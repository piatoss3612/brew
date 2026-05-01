import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { loadEnvFiles, readServiceConfig } from './config.mjs';
import {
  triggerKeeperHubWebhook,
  validateKeeperHubWebhookConfig,
} from './keeperhub-webhook.mjs';
import {
  generateReviewReceipt,
  normalizeReviewReceiptInput,
  validateReviewReceiptInput,
  validateServiceConfig,
} from './review-receipt.mjs';
import { runReviewSwarm, validateReviewComputeConfig } from './review-swarm.mjs';
import { downloadJsonArtifactFromZeroGStorage } from './zero-g-storage.mjs';

const MAX_BODY_BYTES = 1024 * 1024;
let requestSequence = 0;

export function createReceiptService(config = readServiceConfig()) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, config);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Receipt service request failed',
      });
    }
  });
}

export async function routeRequest(request, response, config = readServiceConfig()) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const requestId = request.headers['x-request-id'] ?? nextRequestId();
  const reply = (status, body) => sendJson(response, status, body, requestId);

  logRequest(request, url, requestId);

  if (request.method === 'GET' && url.pathname === '/health') {
    const missing = validateServiceConfig(config);
    reply(200, {
      ok: true,
      service: 'brew-receipt-service',
      configured: missing.length === 0,
      missing,
      reviewConfigured: validateReviewComputeConfig(config.compute).length === 0,
      reviewMissing: validateReviewComputeConfig(config.compute),
      keeperHubWebhookConfigured:
        validateKeeperHubWebhookConfig(config.keeperHubWebhook).length === 0,
      keeperHubWebhookMissing: validateKeeperHubWebhookConfig(config.keeperHubWebhook),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/review-receipt') {
    const auth = authError(request, config);
    if (auth) {
      reply(auth.status, { error: auth.error });
      return;
    }

    const missing = validateServiceConfig(config);
    if (missing.length > 0) {
      reply(200, { configured: false, missing });
      return;
    }

    const body = await readJsonBody(request);
    logReceiptRequestBody(requestId, body);
    const input = normalizeReviewReceiptInput(body);
    const validationError = validateReviewReceiptInput(input);
    if (validationError) {
      reply(400, { error: validationError });
      return;
    }

    const reviewedInput = input.runReviewSwarm
      ? await inputFromReviewSwarm(input, config)
      : input;
    if (reviewedInput.reviewResult && !reviewedInput.reviewResult.releaseReady) {
      reply(200, {
        configured: true,
        ...reviewedInput.reviewResult,
      });
      return;
    }

    const generated = await generateReviewReceipt(reviewedInput, config);
    const responseBody = await buildReviewReceiptResponse({
      reviewedInput,
      generated,
      config,
    });
    reply(200, responseBody);
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/storage')) {
    const auth = authError(request, config);
    if (auth) {
      reply(auth.status, { error: auth.error });
      return;
    }

    const rootHashOrUri = storageRootFromUrl(url);
    if (!rootHashOrUri) {
      reply(400, { error: 'rootHash or uri is required' });
      return;
    }

    const receipt = await downloadJsonArtifactFromZeroGStorage({
      rootHashOrUri,
      indexerRpc: config.storage.indexerRpc,
      uriPrefix: config.storage.uriPrefix,
    });
    reply(200, receipt);
    return;
  }

  reply(404, { error: 'Not found' });
}

function nextRequestId() {
  requestSequence += 1;
  return `req-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function logRequest(request, url, requestId) {
  console.log(
    JSON.stringify({
      event: 'http_request',
      requestId,
      method: request.method,
      path: url.pathname,
      contentType: request.headers['content-type'],
      contentLength: request.headers['content-length'],
      hasAuthorization: Boolean(request.headers.authorization),
      at: new Date().toISOString(),
    }),
  );
}

function logReceiptRequestBody(requestId, body) {
  console.log(
    JSON.stringify({
      event: 'review_receipt_body',
      requestId,
      trustId: safeScalar(body?.trustId),
      source: safeScalar(body?.source),
      runReviewSwarm: Boolean(body?.runReviewSwarm),
      hasAttestationUid: Boolean(body?.attestationUid),
      hasAgenticIds: Array.isArray(body?.agenticIds) && body.agenticIds.length > 0,
      bodyKeys: body && typeof body === 'object' ? Object.keys(body).sort() : [],
      at: new Date().toISOString(),
    }),
  );
}

function logResponse(requestId, status, body) {
  console.log(
    JSON.stringify({
      event: 'http_response',
      requestId,
      status,
      ok: status >= 200 && status < 300,
      resultKeys: body && typeof body === 'object' ? Object.keys(body).sort() : [],
      hasError: Boolean(body?.error),
      releaseReady: typeof body?.releaseReady === 'boolean' ? body.releaseReady : undefined,
      decision: safeScalar(body?.decision),
      receiptRoot: safeScalar(body?.receiptRoot),
      at: new Date().toISOString(),
    }),
  );
}

function safeScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

async function inputFromReviewSwarm(input, config) {
  const reviewInput = {
    ...input,
    agenticIds:
      Array.isArray(input.agenticIds) && input.agenticIds.length > 0
        ? input.agenticIds
        : config.agenticIds,
  };
  const reviewResult = await runReviewSwarm(reviewInput, config.compute);
  return {
    ...reviewInput,
    source: input.source || 'receipt-service-review-swarm',
    review: {
      mode: reviewResult.mode,
      provider: reviewResult.provider,
      votes: reviewResult.votes,
      aggregate: reviewResult.aggregate,
    },
    agenticIds: reviewResult.agenticIds,
    votes: reviewResult.votes,
    aggregate: reviewResult.aggregate,
    reviewResult,
  };
}

export async function buildReviewReceiptResponse({
  reviewedInput,
  generated,
  config,
  triggerKeeperHub = triggerKeeperHubWebhook,
}) {
  const body = {
    configured: true,
    ...(reviewedInput.reviewResult ?? {}),
    ...generated,
  };

  if (!reviewedInput.executeRelease) {
    return body;
  }

  const keeperHubMissing = validateKeeperHubWebhookConfig(config.keeperHubWebhook);
  if (keeperHubMissing.length > 0) {
    return {
      ...body,
      keeperHubMissing,
      keeperHubExecutionError: `KeeperHub webhook is not configured: ${keeperHubMissing.join(', ')}`,
    };
  }

  try {
    const keeperHubWebhook = await triggerKeeperHub({
      input: reviewedInput,
      reviewReceipt: generated.reviewReceipt,
      coordinatorSignature: generated.coordinatorSignature,
      receiptStorage: generated.receiptStorage,
      config: config.keeperHubWebhook,
    });
    return {
      ...body,
      keeperHubWebhook,
      keeperHubExecution: keeperHubWebhook,
    };
  } catch (error) {
    return {
      ...body,
      keeperHubExecutionError:
        error instanceof Error ? error.message : 'KeeperHub webhook failed',
    };
  }
}

function authError(request, config) {
  if (!config.apiKey) return null;

  const authorization = request.headers.authorization ?? '';
  if (authorization === `Bearer ${config.apiKey}`) return null;

  return { status: 401, error: 'Unauthorized review receipt request' };
}

function storageRootFromUrl(url) {
  const queryValue = url.searchParams.get('rootHash') ?? url.searchParams.get('uri');
  if (queryValue) return queryValue;

  const [, , rootHash] = url.pathname.split('/');
  return rootHash ? decodeURIComponent(rootHash) : '';
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });

    request.on('error', reject);
  });
}

function sendJson(response, status, body, requestId) {
  if (requestId) logResponse(requestId, status, body);

  const payload = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

if (isDirectRun()) {
  loadEnvFiles();
  const config = readServiceConfig();
  const server = createReceiptService(config);

  server.listen(config.port, config.host, () => {
    const missing = validateServiceConfig(config);
    console.log(
      `Brew receipt service listening on http://${config.host}:${config.port} configured=${missing.length === 0}`,
    );
    if (missing.length > 0) {
      console.log(`Missing config: ${missing.join(', ')}`);
    }
  });
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
