import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILES = ['.env.local', '.env'];
const DEFAULT_TESTNET_RPC_URL = 'https://evmrpc-testnet.0g.ai';

loadEnvFiles();

const args = parseArgs(process.argv.slice(2));
const mode = readMode(args);
const timeoutMs = readPositiveInt(readEnv('OG_COMPUTE_TIMEOUT_MS'), 60_000);
const maxTokens = readPositiveInt(readEnv('OG_COMPUTE_MAX_TOKENS'), 256);
const context = readReviewContext(args);
const prompt = buildReviewPrompt(context);
const messages = [
  {
    role: 'system',
    content: 'You are Brew Trust Operations Agent. Return strict JSON only. Do not include markdown.',
  },
  {
    role: 'user',
    content: prompt,
  },
];

try {
  const result =
    mode === 'sdk'
      ? await runSdkMode({ messages, prompt, timeoutMs, maxTokens })
      : await runDirectMode({ messages, timeoutMs, maxTokens });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    fail(`0G proxy timed out after ${timeoutMs}ms.`);
  }
  fail(error instanceof Error ? error.message : String(error));
}

async function runDirectMode({ messages, timeoutMs, maxTokens }) {
  const proxyUrl = computeProxyUrl();
  const model = readEnv('OG_COMPUTE_MODEL');
  const appSecret = readEnv('OG_COMPUTE_APP_SECRET');

  if (!model) {
    fail('Missing OG_COMPUTE_MODEL. Add it to .env.local or export it before running.');
  }
  if (!appSecret) {
    fail('Missing OG_COMPUTE_APP_SECRET. Add it to .env.local or export it before running.');
  }
  if (!proxyUrl) {
    fail('Missing OG_COMPUTE_PROXY_URL or OG_COMPUTE_SERVICE_URL.');
  }

  const result = await requestChatCompletion({
    mode: 'direct',
    url: proxyUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appSecret}`,
    },
    body: {
      model,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
    },
    timeoutMs,
  });

  return {
    ...result,
    proxyUrl,
    model,
  };
}

async function runSdkMode({ messages, prompt, timeoutMs, maxTokens }) {
  const providerAddress = readEnv('OG_COMPUTE_PROVIDER_ADDRESS');
  const privateKey = readPrivateKey();
  const rpcUrl = readEnv('OG_COMPUTE_RPC_URL') ?? DEFAULT_TESTNET_RPC_URL;

  if (!providerAddress) {
    fail('Missing OG_COMPUTE_PROVIDER_ADDRESS for SDK mode.');
  }
  if (!privateKey) {
    fail('Missing ZERO_G_PRIVATE_KEY or OG_COMPUTE_PRIVATE_KEY for SDK mode.');
  }

  const { ethers } = await importSdkDependency('ethers');
  const { createZGComputeNetworkBroker } = await importSdkDependency(
    '@0glabs/0g-serving-broker',
  );

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const service = await getServiceMetadata(broker, providerAddress);
  const endpoint = normalizeServiceEndpoint(service.endpoint ?? service.url);
  const model = readEnv('OG_COMPUTE_MODEL') ?? service.model;

  if (!endpoint) {
    fail('0G SDK did not return a service endpoint for the provider.');
  }
  if (!model) {
    fail('0G SDK did not return a model for the provider. Set OG_COMPUTE_MODEL manually.');
  }

  const billingContent = JSON.stringify({ messages, prompt });
  const requestHeaders = await getRequestHeaders(broker, providerAddress, billingContent);
  const url = joinEndpoint(endpoint, 'chat/completions');
  const result = await requestChatCompletion({
    mode: 'sdk',
    url,
    headers: {
      'Content-Type': 'application/json',
      ...requestHeaders,
    },
    body: {
      model,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
    },
    timeoutMs,
  });

  const verification = await maybeProcessResponse({
    broker,
    providerAddress,
    content: result.rawContent,
    chatId: result.responseKey ?? result.responseId,
  });

  return {
    ...result,
    providerAddress,
    rpcUrl,
    endpoint,
    model,
    walletAddress: wallet.address,
    responseVerification: verification,
  };
}

async function requestChatCompletion({ mode, url, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    const responseText = await response.text();

    if (!response.ok) {
      fail(`0G ${mode} request returned HTTP ${response.status}: ${responseText}`);
    }

    const responseJson = parseResponseJson(responseText);
    const rawContent = responseJson?.choices?.[0]?.message?.content ?? '';
    const review = parseReview(rawContent);
    const responseKey = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key');

    if (!review.decision) {
      fail(`0G response did not contain a decision. Raw content: ${rawContent}`);
    }

    return {
      ok: true,
      mode,
      elapsedMs,
      keeperHubSafe: elapsedMs <= 60_000,
      keeperHubMaxSafe: elapsedMs <= 120_000,
      responseId: responseJson?.id,
      responseKey,
      rawContent,
      review,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getServiceMetadata(broker, providerAddress) {
  const candidates = [
    [broker.inference, broker.inference?.getServiceMetadata],
    [broker, broker.getServiceMetadata],
  ];

  for (const [owner, fn] of candidates) {
    if (typeof fn !== 'function') continue;
    return await fn.call(owner, providerAddress);
  }

  throw new Error('0G SDK broker has no getServiceMetadata method.');
}

async function getRequestHeaders(broker, providerAddress, content) {
  const candidates = [
    [broker.inference, broker.inference?.getRequestHeaders],
    [broker, broker.getRequestHeaders],
  ];

  for (const [owner, fn] of candidates) {
    if (typeof fn !== 'function') continue;

    try {
      return await fn.call(owner, providerAddress, content);
    } catch (error) {
      try {
        return await fn.call(owner, providerAddress);
      } catch {
        throw error;
      }
    }
  }

  throw new Error('0G SDK broker has no getRequestHeaders method.');
}

async function maybeProcessResponse({ broker, providerAddress, content, chatId }) {
  if (!readBooleanEnv('OG_COMPUTE_PROCESS_RESPONSE', true)) {
    return { attempted: false, reason: 'disabled' };
  }
  if (!chatId) {
    return { attempted: false, reason: 'missing chat id' };
  }

  const candidates = [
    [broker.inference, broker.inference?.processResponse],
    [broker, broker.processResponse],
  ];

  for (const [owner, fn] of candidates) {
    if (typeof fn !== 'function') continue;

    try {
      const valid = await fn.call(owner, providerAddress, content, chatId);
      return { attempted: true, valid };
    } catch (error) {
      try {
        const valid = await fn.call(owner, providerAddress, chatId);
        return { attempted: true, valid };
      } catch {
        return {
          attempted: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return { attempted: false, reason: 'missing processResponse method' };
}

async function importSdkDependency(name) {
  try {
    return await import(name);
  } catch (error) {
    if (error instanceof Error && error.code === 'ERR_MODULE_NOT_FOUND') {
      fail(`SDK mode requires ${name}. Run: yarn add @0glabs/0g-serving-broker ethers crypto-js@4.2.0`);
    }
    throw error;
  }
}

function loadEnvFiles() {
  for (const file of ENV_FILES) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const index = trimmed.indexOf('=');
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      const value = stripQuotes(trimmed.slice(index + 1).trim());
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readEnv(key) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readPrivateKey() {
  return readEnv('ZERO_G_PRIVATE_KEY') ?? readEnv('OG_COMPUTE_PRIVATE_KEY') ?? readEnv('PRIVATE_KEY');
}

function readMode(args) {
  const explicit = (args.mode ?? readEnv('OG_COMPUTE_MODE'))?.toLowerCase();
  if (!explicit) {
    return computeProxyUrl() ? 'direct' : 'sdk';
  }
  if (explicit !== 'direct' && explicit !== 'sdk') {
    fail('OG_COMPUTE_MODE must be direct or sdk.');
  }
  return explicit;
}

function computeProxyUrl() {
  const explicitProxyUrl = readEnv('OG_COMPUTE_PROXY_URL');
  if (explicitProxyUrl) return explicitProxyUrl;

  const serviceUrl = readEnv('OG_COMPUTE_SERVICE_URL');
  if (!serviceUrl) return undefined;

  if (serviceUrl.endsWith('/chat/completions')) return serviceUrl;
  return `${serviceUrl.replace(/\/+$/, '')}/v1/proxy/chat/completions`;
}

function normalizeServiceEndpoint(endpoint) {
  if (!endpoint) return undefined;
  return endpoint.replace(/\/+$/, '');
}

function joinEndpoint(base, path) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function readPositiveInt(value, fallback) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readBooleanEnv(key, fallback) {
  const value = readEnv(key);
  if (!value) return fallback;

  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = 'true';
    }
  }

  return parsed;
}

function readReviewContext(args) {
  const raw = args.context ?? readEnv('BREW_REVIEW_SAMPLE_JSON');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      fail(`BREW_REVIEW_SAMPLE_JSON is not valid JSON: ${error.message}`);
    }
  }

  return {
    trustId: args['trust-id'] ?? '1',
    beneficiary: args.beneficiary ?? '0x0000000000000000000000000000000000000000',
    templateId:
      args['template-id'] ??
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    attestationUid:
      args['attestation-uid'] ??
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    status: 'PENDING',
  };
}

function buildReviewPrompt(context) {
  return [
    'Review this Brew trust-release context for a verifier-gated release.',
    'The AI review is advisory only. It must not claim authority to move funds.',
    'Return exactly this JSON shape:',
    JSON.stringify(
      {
        decision: 'ready_for_verifier | missing_evidence | blocked',
        rationale: ['short reason'],
        riskFlags: ['short risk flag or none'],
        nextAction: 'trigger_keeperhub | wait_for_attestation | do_not_release',
        receiptSummary: 'one sentence summary for the evidence receipt',
      },
      null,
      2,
    ),
    `Trust context:\n${JSON.stringify(context, null, 2)}`,
  ].join('\n\n');
}

function parseResponseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`0G proxy returned non-JSON response: ${text}`);
  }
}

function parseReview(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    fail(`0G content was not strict JSON: ${content}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
