#!/usr/bin/env node
import { loadEnvFiles, readEnv } from '../src/config.mjs';

loadEnvFiles();

const url =
  argValue('--url') ??
  readEnv(process.env, 'BREW_RECEIPT_SERVICE_URL') ??
  'http://127.0.0.1:8787/review-receipt';
const apiKey = argValue('--api-key') ?? readEnv(process.env, 'BREW_REVIEW_RECEIPT_API_KEY');

const body = {
  trustId: requiredValue('--trust-id', 'BREW_REVIEW_TEST_TRUST_ID'),
  beneficiary: requiredValue('--beneficiary', 'BREW_REVIEW_TEST_BENEFICIARY'),
  templateId: requiredValue('--template-id', 'BREW_REVIEW_TEST_TEMPLATE_ID'),
  attestationUid: requiredValue('--attestation-uid', 'BREW_REVIEW_TEST_ATTESTATION_UID'),
  runReviewSwarm: process.argv.includes('--run-review-swarm'),
  executeRelease: process.argv.includes('--execute-release'),
  source: 'receipt-service-killtest',
  review: {
    mode: 'killtest',
    provider: '0g-compute',
    decision: 'ready_for_verifier',
    rationale: ['Receipt service kill-test request.'],
    riskFlags: ['none'],
    nextAction: 'trigger_keeperhub',
    receiptSummary: 'Kill-test receipt service request.',
  },
};

const startedAt = Date.now();
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  },
  body: JSON.stringify(body),
});
const text = await response.text();
let parsed = null;

try {
  parsed = text ? JSON.parse(text) : null;
} catch {
  parsed = { raw: text };
}

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      url,
      response: parsed,
    },
    null,
    2,
  ),
);

if (!response.ok || parsed?.configured === false) {
  process.exitCode = 1;
}

function requiredValue(flag, envKey) {
  const value = argValue(flag) ?? readEnv(process.env, envKey);
  if (!value) {
    console.error(`Missing ${flag} or ${envKey}`);
    process.exit(1);
  }
  return value;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}
