import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildKeeperHubWebhookPayload,
  triggerKeeperHubWebhook,
  validateKeeperHubWebhookConfig,
} from '../src/keeperhub-webhook.mjs';

const INPUT = {
  trustId: '1',
  beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
  attestationUid: `0x${'22'.repeat(32)}`,
  templateId: `0x${'33'.repeat(32)}`,
};

const REVIEW_RECEIPT = {
  trustId: '1',
  beneficiary: INPUT.beneficiary,
  attestationUid: INPUT.attestationUid,
  templateId: INPUT.templateId,
  receiptRoot: `0x${'44'.repeat(32)}`,
  receiptUri: `0g://storage/0x${'44'.repeat(32)}`,
  coordinator: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
  verdict: 1,
  createdAt: '1777177200',
  expiresAt: '1777782000',
};

const CONFIG = {
  webhookUrl: 'https://keeperhub.example/webhooks/brew-release',
  webhookApiKey: 'kh_webhook_secret',
  timeoutMs: 1000,
};

test('validateKeeperHubWebhookConfig requires a webhook URL when release execution is enabled', () => {
  assert.deepEqual(validateKeeperHubWebhookConfig(CONFIG), []);
  assert.deepEqual(validateKeeperHubWebhookConfig({ ...CONFIG, webhookUrl: undefined }), [
    'KEEPERHUB_WEBHOOK_URL',
  ]);
});

test('buildKeeperHubWebhookPayload sends only trigger-only release fields to KeeperHub', () => {
  const payload = buildKeeperHubWebhookPayload({
    input: INPUT,
    reviewReceipt: REVIEW_RECEIPT,
    coordinatorSignature: '0xsignature',
    receiptStorage: {
      rootHash: REVIEW_RECEIPT.receiptRoot,
      uri: REVIEW_RECEIPT.receiptUri,
      byteSize: 1234,
      attempts: 1,
    },
  });

  assert.equal(payload.action, 'verifyAndReleaseWithReceiptFields');
  assert.equal(payload.trustId, INPUT.trustId);
  assert.equal(payload.attestationUid, INPUT.attestationUid);
  assert.equal(payload.receiptRoot, REVIEW_RECEIPT.receiptRoot);
  assert.equal(payload.receiptUri, REVIEW_RECEIPT.receiptUri);
  assert.equal(payload.coordinator, REVIEW_RECEIPT.coordinator);
  assert.equal(payload.verdict, REVIEW_RECEIPT.verdict);
  assert.equal(payload.createdAt, REVIEW_RECEIPT.createdAt);
  assert.equal(payload.expiresAt, REVIEW_RECEIPT.expiresAt);
  assert.equal(payload.coordinatorSignature, '0xsignature');
  assert.equal(payload.receiptStorageRootHash, REVIEW_RECEIPT.receiptRoot);
  assert.equal(payload.receiptStorageUri, REVIEW_RECEIPT.receiptUri);
  assert.equal('beneficiary' in payload, false);
  assert.equal('templateId' in payload, false);
  assert.equal('reviewReceipt' in payload, false);
  assert.equal('contractCall' in payload, false);
});

test('triggerKeeperHubWebhook posts the receipt payload to the configured KeeperHub webhook', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          executionId: 'workflow_123',
          status: 'queued',
        });
      },
    };
  };

  const result = await triggerKeeperHubWebhook({
    input: INPUT,
    reviewReceipt: REVIEW_RECEIPT,
    coordinatorSignature: `0x${'66'.repeat(65)}`,
    config: CONFIG,
    fetchImpl,
  });

  assert.equal(result.executionId, 'workflow_123');
  assert.equal(result.status, 'queued');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CONFIG.webhookUrl);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer kh_webhook_secret');
  assert.equal(calls[0].init.headers['x-api-key'], 'kh_webhook_secret');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.action, 'verifyAndReleaseWithReceiptFields');
  assert.equal(body.receiptRoot, REVIEW_RECEIPT.receiptRoot);
  assert.equal(body.receiptUri, REVIEW_RECEIPT.receiptUri);
  assert.equal('beneficiary' in body, false);
  assert.equal('templateId' in body, false);
});
