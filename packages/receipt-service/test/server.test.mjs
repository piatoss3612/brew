import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { buildReviewReceiptResponse, routeRequest } from '../src/server.mjs';

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
  assert.equal(response.body.keeperHubWebhookConfigured, false);
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

test('buildReviewReceiptResponse skips KeeperHub when executeRelease is not requested', async () => {
  let called = false;

  const response = await buildReviewReceiptResponse({
    reviewedInput: {
      trustId: '1',
      beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
      attestationUid: `0x${'11'.repeat(32)}`,
      templateId: `0x${'22'.repeat(32)}`,
      executeRelease: false,
    },
    generated: signedReceipt(),
    config: { keeperHub: {} },
    executeKeeperHub: async () => {
      called = true;
      return {};
    },
  });

  assert.equal(called, false);
  assert.equal(response.configured, true);
  assert.equal(Object.hasOwn(response, 'keeperHubExecution'), false);
});

test('buildReviewReceiptResponse triggers KeeperHub webhook when requested', async () => {
  const webhookResult = {
    executionId: 'workflow_123',
    status: 'queued',
  };
  const generated = signedReceipt();
  const reviewedInput = {
    trustId: '1',
    beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
    attestationUid: `0x${'11'.repeat(32)}`,
    templateId: `0x${'22'.repeat(32)}`,
    executeRelease: true,
  };

  const response = await buildReviewReceiptResponse({
    reviewedInput,
    generated,
    config: {
      keeperHubWebhook: {
        webhookUrl: 'https://keeperhub.example/webhooks/brew-release',
        webhookApiKey: 'kh_webhook_secret',
      },
    },
    triggerKeeperHub: async (request) => {
      assert.equal(request.input, reviewedInput);
      assert.equal(request.reviewReceipt, generated.reviewReceipt);
      assert.equal(request.coordinatorSignature, generated.coordinatorSignature);
      return webhookResult;
    },
  });

  assert.equal(response.keeperHubWebhook, webhookResult);
  assert.equal(response.keeperHubExecution, webhookResult);
  assert.equal(Object.hasOwn(response, 'keeperHubExecutionError'), false);
});

test('buildReviewReceiptResponse preserves the signed receipt when KeeperHub webhook is not configured', async () => {
  const response = await buildReviewReceiptResponse({
    reviewedInput: {
      trustId: '1',
      beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
      attestationUid: `0x${'11'.repeat(32)}`,
      templateId: `0x${'22'.repeat(32)}`,
      executeRelease: true,
    },
    generated: signedReceipt(),
    config: { keeperHubWebhook: {} },
    triggerKeeperHub: async () => {
      throw new Error('should not run');
    },
  });

  assert.equal(response.configured, true);
  assert.deepEqual(response.keeperHubMissing, ['KEEPERHUB_WEBHOOK_URL']);
  assert.equal(
    response.keeperHubExecutionError,
    'KeeperHub webhook is not configured: KEEPERHUB_WEBHOOK_URL',
  );
  assert.ok(response.reviewReceipt);
  assert.ok(response.coordinatorSignature);
});

function signedReceipt() {
  return {
    reviewReceipt: {
      trustId: '1',
      beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
      attestationUid: `0x${'11'.repeat(32)}`,
      templateId: `0x${'22'.repeat(32)}`,
      receiptRoot: `0x${'44'.repeat(32)}`,
      receiptUri: `0g://storage/0x${'44'.repeat(32)}`,
      coordinator: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
      verdict: 1,
      createdAt: '1777177200',
      expiresAt: '1777782000',
    },
    coordinatorSignature: `0x${'55'.repeat(65)}`,
    receiptDigestInput: {},
    receiptStorage: {},
  };
}

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
