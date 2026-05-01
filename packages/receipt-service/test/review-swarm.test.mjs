import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runReviewSwarm, validateReviewComputeConfig } from '../src/review-swarm.mjs';

const VALID_INPUT = {
  trustId: '1',
  beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
  attestationUid: '0x' + '22'.repeat(32),
  templateId: '0x' + '33'.repeat(32),
  agenticIds: [
    {
      role: 'evidence',
      agenticId: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/1',
    },
    {
      role: 'policy',
      agenticId: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/2',
    },
    {
      role: 'risk',
      agenticId: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/3',
    },
  ],
};

const VALID_CONFIG = {
  proxyUrl: 'https://compute.example/v1/proxy/chat/completions',
  model: 'qwen/qwen-2.5-7b-instruct',
  appSecret: 'test-secret',
  timeoutMs: 10_000,
  maxTokens: 512,
};

test('validateReviewComputeConfig reports missing 0G Compute settings', () => {
  assert.deepEqual(validateReviewComputeConfig({}), [
    'OG_COMPUTE_PROXY_URL or OG_COMPUTE_SERVICE_URL',
    'OG_COMPUTE_MODEL',
    'OG_COMPUTE_APP_SECRET',
  ]);
});

test('runReviewSwarm reaches release quorum with mocked 0G responses', async () => {
  const responses = [
    { decision: 'approve', rationale: ['Evidence is complete.'], riskFlags: ['none'] },
    { decision: 'approve', rationale: ['Policy is consistent.'], riskFlags: ['none'] },
    { decision: 'pass', rationale: ['No risk veto.'], riskFlags: ['none'] },
  ];
  let calls = 0;

  const result = await runReviewSwarm(VALID_INPUT, VALID_CONFIG, {
    fetchImpl: async () => {
      const review = responses[calls++];
      return jsonResponse({
        id: `chatcmpl-${calls}`,
        choices: [{ message: { content: JSON.stringify(review) } }],
      });
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.releaseReady, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.aggregate.verdict, 'ReleaseRecommended');
  assert.deepEqual(result.votes.map((vote) => vote.role), ['evidence', 'policy', 'risk']);
});

test('evidence agent prompt treats verifier-owned template checks as sufficient for advisory review', async () => {
  let firstPrompt = '';
  const responses = [
    { decision: 'approve', rationale: ['Verifier-owned template checks are sufficient.'], riskFlags: ['none'] },
    { decision: 'approve', rationale: ['Policy is consistent.'], riskFlags: ['none'] },
    { decision: 'pass', rationale: ['No risk veto.'], riskFlags: ['none'] },
  ];
  let calls = 0;

  const result = await runReviewSwarm(VALID_INPUT, VALID_CONFIG, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (calls === 0) firstPrompt = body.messages[1].content;

      const review = responses[calls++];
      return jsonResponse({
        id: `chatcmpl-${calls}`,
        choices: [{ message: { content: JSON.stringify(review) } }],
      });
    },
  });

  assert.equal(result.releaseReady, true);
  assert.match(firstPrompt, /templateReference and templateRegistrationEvidence fields are sufficient/);
  assert.match(firstPrompt, /do not ask for a separate template document/);
  assert.match(firstPrompt, /advisoryReviewRule/);
});

test('runReviewSwarm blocks when any agent fails', async () => {
  const result = await runReviewSwarm(VALID_INPUT, VALID_CONFIG, {
    fetchImpl: async () => jsonResponse({ error: 'blocked' }, { ok: false, status: 502 }),
  });

  assert.equal(result.releaseReady, false);
  assert.equal(result.status, 'reviewed');
  assert.equal(result.aggregate.verdict, 'Rejected');
  assert.deepEqual(result.votes.map((vote) => vote.decision), ['reject', 'reject', 'veto']);
});

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get(name) {
        return name.toLowerCase() === 'zg-res-key' ? 'response-key' : null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
