import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_KEEPERHUB_WEBHOOK_TIMEOUT_MS,
} from './keeperhub-webhook.mjs';

export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_CHAIN_ID = 84532;
export const DEFAULT_ZERO_G_STORAGE_RPC_URL = 'https://evmrpc-testnet.0g.ai';
export const DEFAULT_ZERO_G_STORAGE_INDEXER_RPC =
  'https://indexer-storage-testnet-turbo.0g.ai';
export const DEFAULT_ZERO_G_STORAGE_URI_PREFIX = '0g://storage';
export const DEFAULT_RECEIPT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_OG_COMPUTE_TIMEOUT_MS = 120_000;
export const DEFAULT_OG_COMPUTE_MAX_TOKENS = 512;

export function loadEnvFiles(cwd = process.cwd()) {
  for (const file of ['.env.local', '.env']) {
    const path = join(cwd, file);
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

export function readServiceConfig(env = process.env) {
  const port = readPositiveInt(readEnv(env, 'PORT'), DEFAULT_PORT);
  const host = readEnv(env, 'HOST') ?? DEFAULT_HOST;
  const coordinatorPrivateKey = readEnv(env, 'BREW_REVIEW_COORDINATOR_PRIVATE_KEY');
  const coordinatorAddress = readEnv(env, 'BREW_REVIEW_COORDINATOR_ADDRESS');
  const verifierAddress = readEnv(env, 'BREW_VERIFIER_ADDRESS');
  const apiKey = readEnv(env, 'BREW_REVIEW_RECEIPT_API_KEY');
  const chainId = readPositiveInt(readEnv(env, 'BREW_REVIEW_RECEIPT_CHAIN_ID'), DEFAULT_CHAIN_ID);
  const ttlSeconds = readPositiveInt(
    readEnv(env, 'BREW_REVIEW_RECEIPT_TTL_SECONDS'),
    DEFAULT_RECEIPT_TTL_SECONDS,
  );
  const storagePrivateKey =
    readEnv(env, 'BREW_0G_STORAGE_PRIVATE_KEY') ??
    readEnv(env, 'ZERO_G_PRIVATE_KEY') ??
    readEnv(env, 'OG_COMPUTE_PRIVATE_KEY');
  const storageRpcUrl =
    readEnv(env, 'BREW_0G_STORAGE_RPC_URL') ?? DEFAULT_ZERO_G_STORAGE_RPC_URL;
  const storageIndexerRpc =
    readEnv(env, 'BREW_0G_STORAGE_INDEXER_RPC') ?? DEFAULT_ZERO_G_STORAGE_INDEXER_RPC;
  const storageUriPrefix =
    readEnv(env, 'BREW_0G_STORAGE_URI_PREFIX') ?? DEFAULT_ZERO_G_STORAGE_URI_PREFIX;
  const storageRetries = readPositiveInt(readEnv(env, 'BREW_0G_STORAGE_RETRIES'), 2);
  const computeServiceUrl = readEnv(env, 'OG_COMPUTE_SERVICE_URL');
  const computeProxyUrl =
    readEnv(env, 'OG_COMPUTE_PROXY_URL') ?? proxyUrlFromServiceUrl(computeServiceUrl);
  const computeModel = readEnv(env, 'OG_COMPUTE_MODEL');
  const computeAppSecret = readEnv(env, 'OG_COMPUTE_APP_SECRET');
  const computeTimeoutMs = readPositiveInt(
    readEnv(env, 'OG_COMPUTE_TIMEOUT_MS'),
    DEFAULT_OG_COMPUTE_TIMEOUT_MS,
  );
  const computeMaxTokens = readPositiveInt(
    readEnv(env, 'OG_COMPUTE_MAX_TOKENS'),
    DEFAULT_OG_COMPUTE_MAX_TOKENS,
  );
  const keeperHubWebhookUrl =
    readEnv(env, 'KEEPERHUB_WEBHOOK_URL') ?? readEnv(env, 'BREW_KEEPERHUB_WEBHOOK_URL');
  const keeperHubWebhookApiKey =
    readEnv(env, 'KEEPERHUB_WEBHOOK_API_KEY') ??
    readEnv(env, 'BREW_KEEPERHUB_WEBHOOK_API_KEY');
  const keeperHubTimeoutMs = readPositiveInt(
    readEnv(env, 'KEEPERHUB_WEBHOOK_TIMEOUT_MS') ??
      readEnv(env, 'BREW_KEEPERHUB_WEBHOOK_TIMEOUT_MS'),
    DEFAULT_KEEPERHUB_WEBHOOK_TIMEOUT_MS,
  );
  const agenticIds = readAgenticIds(env);
  const missing = [];

  if (!coordinatorPrivateKey) missing.push('BREW_REVIEW_COORDINATOR_PRIVATE_KEY');
  if (!verifierAddress) missing.push('BREW_VERIFIER_ADDRESS');
  if (!storagePrivateKey) missing.push('BREW_0G_STORAGE_PRIVATE_KEY or ZERO_G_PRIVATE_KEY');

  return {
    port,
    host,
    apiKey,
    coordinatorPrivateKey,
    coordinatorAddress,
    verifierAddress,
    chainId,
    ttlSeconds,
    storage: {
      privateKey: storagePrivateKey,
      rpcUrl: storageRpcUrl,
      indexerRpc: storageIndexerRpc,
      uriPrefix: storageUriPrefix,
      retries: storageRetries,
    },
    compute: {
      proxyUrl: computeProxyUrl,
      model: computeModel,
      appSecret: computeAppSecret,
      timeoutMs: computeTimeoutMs,
      maxTokens: computeMaxTokens,
    },
    keeperHubWebhook: {
      webhookUrl: keeperHubWebhookUrl,
      webhookApiKey: keeperHubWebhookApiKey,
      timeoutMs: keeperHubTimeoutMs,
    },
    agenticIds,
    missing,
  };
}

export function readEnv(env, key) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInt(value, fallback) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
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

function proxyUrlFromServiceUrl(serviceUrl) {
  if (!serviceUrl) return undefined;
  if (serviceUrl.endsWith('/chat/completions')) return serviceUrl;
  return `${serviceUrl.replace(/\/+$/, '')}/v1/proxy/chat/completions`;
}

function readAgenticIds(env) {
  const chain = readEnv(env, 'BREW_AGENTIC_ID_CHAIN') ?? '0g-galileo';
  const contract = readEnv(env, 'BREW_AGENTIC_ID_CONTRACT');
  const authorizedExecutor = readEnv(env, 'BREW_AGENTIC_AUTHORIZED_EXECUTOR');

  return [
    readAgenticId(env, 'evidence', 'BREW_EVIDENCE_AGENTIC', {
      chain,
      contract,
      authorizedExecutor,
    }),
    readAgenticId(env, 'policy', 'BREW_POLICY_AGENTIC', {
      chain,
      contract,
      authorizedExecutor,
    }),
    readAgenticId(env, 'risk', 'BREW_RISK_AGENTIC', {
      chain,
      contract,
      authorizedExecutor,
    }),
  ].filter(Boolean);
}

function readAgenticId(env, role, prefix, defaults) {
  const tokenId = readEnv(env, `${prefix}_TOKEN_ID`);
  const contract = readEnv(env, `${prefix}_CONTRACT`) ?? defaults.contract;
  const chain = readEnv(env, `${prefix}_CHAIN`) ?? defaults.chain;
  const metadataHash = readEnv(env, `${prefix}_METADATA_HASH`);
  const authorizedExecutor =
    readEnv(env, `${prefix}_AUTHORIZED_EXECUTOR`) ?? defaults.authorizedExecutor;
  const agenticId =
    readEnv(env, `${prefix}_ID`) ?? (contract && tokenId ? `${chain}:${contract}/${tokenId}` : undefined);

  if (!agenticId && !tokenId && !metadataHash) return undefined;

  return withoutUndefined({
    role,
    agenticId,
    chain,
    contract,
    tokenId,
    metadataHash,
    authorizedExecutor,
  });
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
