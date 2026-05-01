import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { loadEnvFiles, readServiceConfig } from './config.mjs';
import {
  generateReviewReceipt,
  normalizeReviewReceiptInput,
  validateReviewReceiptInput,
  validateServiceConfig,
} from './review-receipt.mjs';
import { downloadJsonArtifactFromZeroGStorage } from './zero-g-storage.mjs';

const MAX_BODY_BYTES = 1024 * 1024;

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

  if (request.method === 'GET' && url.pathname === '/health') {
    const missing = validateServiceConfig(config);
    sendJson(response, 200, {
      ok: true,
      service: 'brew-receipt-service',
      configured: missing.length === 0,
      missing,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/review-receipt') {
    const auth = authError(request, config);
    if (auth) {
      sendJson(response, auth.status, { error: auth.error });
      return;
    }

    const missing = validateServiceConfig(config);
    if (missing.length > 0) {
      sendJson(response, 200, { configured: false, missing });
      return;
    }

    const body = await readJsonBody(request);
    const input = normalizeReviewReceiptInput(body);
    const validationError = validateReviewReceiptInput(input);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const generated = await generateReviewReceipt(input, config);
    sendJson(response, 200, {
      configured: true,
      ...generated,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/storage')) {
    const auth = authError(request, config);
    if (auth) {
      sendJson(response, auth.status, { error: auth.error });
      return;
    }

    const rootHashOrUri = storageRootFromUrl(url);
    if (!rootHashOrUri) {
      sendJson(response, 400, { error: 'rootHash or uri is required' });
      return;
    }

    const receipt = await downloadJsonArtifactFromZeroGStorage({
      rootHashOrUri,
      indexerRpc: config.storage.indexerRpc,
      uriPrefix: config.storage.uriPrefix,
    });
    sendJson(response, 200, receipt);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
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

function sendJson(response, status, body) {
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
