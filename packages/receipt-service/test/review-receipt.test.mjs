import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildReceiptArtifact,
  buildReviewReceiptMessage,
  normalizeReviewReceiptInput,
  validateReviewReceiptInput,
} from '../src/review-receipt.mjs';

const VALID_INPUT = {
  trustId: '1',
  beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
  attestationUid: '0x' + '22'.repeat(32),
  templateId: '0x' + '33'.repeat(32),
  review: {
    decision: 'ready_for_verifier',
  },
  source: 'test',
};

const AGENTIC_IDS = [
  {
    role: 'evidence',
    agenticId: '0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/1',
    chain: '0g-galileo',
    contract: '0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F',
    tokenId: '1',
    metadataHash: '0x' + '44'.repeat(32),
    authorizedExecutor: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
  },
];

const VOTES = [
  {
    role: 'evidence',
    agenticId: AGENTIC_IDS[0].agenticId,
    decision: 'approve',
    rationale: ['Attestation recipient matches the trust beneficiary.'],
    riskFlags: ['none'],
  },
  {
    role: 'risk',
    decision: 'pass',
    rationale: ['No stale evidence or terminal escrow state detected.'],
    riskFlags: ['none'],
  },
];

test('validateReviewReceiptInput accepts a complete receipt request', () => {
  assert.equal(validateReviewReceiptInput(VALID_INPUT), null);
});

test('validateReviewReceiptInput rejects invalid identifiers', () => {
  assert.equal(validateReviewReceiptInput({ ...VALID_INPUT, trustId: 'abc' }), 'trustId must be a uint256 string');
  assert.equal(validateReviewReceiptInput({ ...VALID_INPUT, beneficiary: '0x0' }), 'beneficiary must be an address');
  assert.equal(validateReviewReceiptInput({ ...VALID_INPUT, attestationUid: '0x0' }), 'attestationUid must be bytes32');
  assert.equal(validateReviewReceiptInput({ ...VALID_INPUT, templateId: '0x0' }), 'templateId must be bytes32');
});

test('buildReceiptArtifact stores a swarm review bundle without signature or storage root', () => {
  const artifact = buildReceiptArtifact({
    ...VALID_INPUT,
    agenticIds: AGENTIC_IDS,
    votes: VOTES,
    aggregate: {
      rule: 'evidence approve + risk pass',
      verdict: 'ReleaseRecommended',
      releaseReady: true,
    },
    coordinator: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    createdAt: 1777177200,
    expiresAt: 1777782000,
  });

  assert.equal(artifact.kind, 'BrewSwarmReviewBundle');
  assert.equal(artifact.version, 1);
  assert.equal(artifact.source, 'test');
  assert.deepEqual(artifact.trust, {
    trustId: VALID_INPUT.trustId,
    beneficiary: VALID_INPUT.beneficiary,
    attestationUid: VALID_INPUT.attestationUid,
    templateId: VALID_INPUT.templateId,
  });
  assert.equal(artifact.reviewCouncil.coordinator, '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF');
  assert.deepEqual(artifact.reviewCouncil.agenticIds, AGENTIC_IDS);
  assert.deepEqual(artifact.votes, VOTES);
  assert.deepEqual(artifact.aggregate, {
    rule: 'evidence approve + risk pass',
    verdict: 'ReleaseRecommended',
    releaseReady: true,
    rationale: [],
  });
  assert.deepEqual(artifact.receipt, {
    verdict: 'ReleaseRecommended',
    createdAt: 1777177200,
    expiresAt: 1777782000,
  });
  assert.equal(Object.hasOwn(artifact, 'receiptRoot'), false);
  assert.equal(Object.hasOwn(artifact, 'coordinatorSignature'), false);
});

test('buildReceiptArtifact wraps legacy single review as an operations vote', () => {
  const artifact = buildReceiptArtifact({
    ...VALID_INPUT,
    coordinator: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    createdAt: 1777177200,
    expiresAt: 1777782000,
  });

  assert.equal(artifact.kind, 'BrewSwarmReviewBundle');
  assert.equal(artifact.votes.length, 1);
  assert.equal(artifact.votes[0].role, 'operations');
  assert.equal(artifact.votes[0].decision, 'ready_for_verifier');
  assert.deepEqual(artifact.votes[0].raw, VALID_INPUT.review);
  assert.equal(artifact.aggregate.verdict, 'ReleaseRecommended');
});

test('normalizeReviewReceiptInput accepts swarm fields from request bodies', () => {
  const input = normalizeReviewReceiptInput({
    ...VALID_INPUT,
    executeRelease: true,
    agenticIds: AGENTIC_IDS,
    votes: VOTES,
    aggregate: {
      rule: 'evidence approve + risk pass',
      verdict: 'ReleaseRecommended',
      releaseReady: true,
    },
  });

  assert.deepEqual(input.agenticIds, AGENTIC_IDS);
  assert.deepEqual(input.votes, VOTES);
  assert.equal(input.executeRelease, true);
  assert.deepEqual(input.aggregate, {
    rule: 'evidence approve + risk pass',
    verdict: 'ReleaseRecommended',
    releaseReady: true,
  });
});

test('buildReviewReceiptMessage signs the 0G Storage root and URI', () => {
  const message = buildReviewReceiptMessage({
    input: VALID_INPUT,
    coordinator: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    receiptRoot: '0x' + '44'.repeat(32),
    receiptUri: '0g://storage/0x' + '44'.repeat(32),
    createdAt: 1777177200,
    expiresAt: 1777782000,
  });

  assert.equal(message.trustId, '1');
  assert.equal(message.receiptRoot, '0x' + '44'.repeat(32));
  assert.equal(message.receiptUri, '0g://storage/0x' + '44'.repeat(32));
  assert.equal(message.verdict, 1);
});
