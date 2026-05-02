import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readServiceConfig } from '../src/config.mjs';
import {
  DEFAULT_KEEPERHUB_WEBHOOK_TIMEOUT_MS,
} from '../src/keeperhub-webhook.mjs';

test('readServiceConfig maps optional KeeperHub webhook config', () => {
  const config = readServiceConfig({
    BREW_REVIEW_COORDINATOR_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
    BREW_VERIFIER_ADDRESS: '0x1111111111111111111111111111111111111111',
    BREW_0G_STORAGE_PRIVATE_KEY: `0x${'22'.repeat(32)}`,
    KEEPERHUB_WEBHOOK_URL: 'https://keeperhub.example/webhooks/brew-release',
    KEEPERHUB_WEBHOOK_API_KEY: 'kh_webhook_secret',
    KEEPERHUB_WEBHOOK_TIMEOUT_MS: '45000',
    BREW_AGENTIC_ID_CHAIN: '0g-galileo',
    BREW_AGENTIC_ID_CONTRACT: '0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F',
    BREW_AGENTIC_AUTHORIZED_EXECUTOR: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    BREW_EVIDENCE_AGENTIC_TOKEN_ID: '1',
    BREW_EVIDENCE_AGENTIC_METADATA_HASH: `0x${'33'.repeat(32)}`,
    BREW_POLICY_AGENTIC_ID: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/2',
    BREW_POLICY_AGENTIC_TOKEN_ID: '2',
    BREW_POLICY_AGENTIC_METADATA_HASH: `0x${'44'.repeat(32)}`,
  });

  assert.deepEqual(config.keeperHubWebhook, {
    webhookUrl: 'https://keeperhub.example/webhooks/brew-release',
    webhookApiKey: 'kh_webhook_secret',
    timeoutMs: 45000,
  });
  assert.deepEqual(config.agenticIds, [
    {
      role: 'evidence',
      agenticId: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/1',
      chain: '0g-galileo',
      contract: '0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F',
      tokenId: '1',
      metadataHash: `0x${'33'.repeat(32)}`,
      authorizedExecutor: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    },
    {
      role: 'policy',
      agenticId: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/2',
      chain: '0g-galileo',
      contract: '0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F',
      tokenId: '2',
      metadataHash: `0x${'44'.repeat(32)}`,
      authorizedExecutor: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    },
  ]);
  assert.deepEqual(config.missing, []);
});

test('readServiceConfig keeps KeeperHub webhook optional for receipt-only operation', () => {
  const config = readServiceConfig({
    BREW_REVIEW_COORDINATOR_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
    BREW_VERIFIER_ADDRESS: '0x1111111111111111111111111111111111111111',
    BREW_0G_STORAGE_PRIVATE_KEY: `0x${'22'.repeat(32)}`,
  });

  assert.deepEqual(config.keeperHubWebhook, {
    webhookUrl: undefined,
    webhookApiKey: undefined,
    timeoutMs: DEFAULT_KEEPERHUB_WEBHOOK_TIMEOUT_MS,
  });
  assert.deepEqual(config.missing, []);
});
