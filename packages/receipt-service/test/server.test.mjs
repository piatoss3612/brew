import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { routeRequest } from '../src/server.mjs';

const INCOMPLETE_CONFIG = {
  apiKey: 'test-api-key',
  coordinatorPrivateKey: undefined,
  coordinatorAddress: undefined,
  verifierAddress: undefined,
  chainId: 11155111,
  ttlSeconds: 604800,
  storage: {
    privateKey: undefined,
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    indexerRpc: 'https://indexer-storage-testnet-turbo.0g.ai',
    uriPrefix: '0g://storage',
    retries: 2,
  },
  missing: [
    'BREW_REVIEW_COORDINATOR_PRIVATE_KEY',
    'BREW_VERIFIER_ADDRESS',
    'BREW_0G_STORAGE_PRIVATE_KEY or ZERO_G_PRIVATE_KEY',
  ],
};

test('GET /health reports receipt service configuration state', async () => {
  const response = await dispatch({
    method: 'GET',
    url: '/health',
    config: INCOMPLETE_CONFIG,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.service, 'brew-receipt-service');
  assert.equal(response.body.configured, false);
  assert.deepEqual(response.body.missing, INCOMPLETE_CONFIG.missing);
});

test('POST /review-receipt requires bearer auth when an API key is configured', async () => {
  const response = await dispatch({
    method: 'POST',
    url: '/review-receipt',
    body: {},
    config: INCOMPLETE_CONFIG,
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Unauthorized review receipt request');
});

test('POST /review-receipt returns configured=false before touching 0G Storage', async () => {
  const response = await dispatch({
    method: 'POST',
    url: '/review-receipt',
    headers: {
      authorization: `Bearer ${INCOMPLETE_CONFIG.apiKey}`,
      'content-type': 'application/json',
    },
    body: {},
    config: INCOMPLETE_CONFIG,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.configured, false);
  assert.deepEqual(response.body.missing, INCOMPLETE_CONFIG.missing);
});

async function dispatch({ method, url, headers = {}, body, config }) {
  const requestBody = body === undefined ? '' : JSON.stringify(body);
  const request = Readable.from([requestBody]);
  request.method = method;
  request.url = url;
  request.headers = {
    host: 'receipt-service.test',
    ...headers,
  };

  const response = {
    status: 0,
    headers: {},
    payload: '',
    writeHead(status, responseHeaders) {
      this.status = status;
      this.headers = responseHeaders;
    },
    end(payload) {
      this.payload = payload;
    },
  };

  await routeRequest(request, response, config);
  return {
    status: response.status,
    headers: response.headers,
    body: JSON.parse(response.payload),
  };
}
