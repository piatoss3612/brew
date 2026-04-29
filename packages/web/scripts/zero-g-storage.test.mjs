import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildReceiptStorageArtifact,
  formatZeroGStorageUri,
  parseZeroGStorageRoot,
  serializeJsonArtifact,
} from '../src/zero-g-storage.js';

test('formatZeroGStorageUri appends the storage root to the normalized prefix', () => {
  assert.equal(
    formatZeroGStorageUri('0g://storage/', '0x' + '11'.repeat(32)),
    '0g://storage/0x' + '11'.repeat(32),
  );
});

test('parseZeroGStorageRoot accepts a root hash or a 0g storage URI', () => {
  const rootHash = '0x' + '11'.repeat(32);

  assert.equal(parseZeroGStorageRoot(rootHash), rootHash);
  assert.equal(parseZeroGStorageRoot(`0g://storage/${rootHash}`), rootHash);
});

test('parseZeroGStorageRoot rejects non-root values', () => {
  assert.throws(() => parseZeroGStorageRoot('0g://storage/not-a-root'), /bytes32 root hash/);
});

test('buildReceiptStorageArtifact keeps the signed root artifact separate from signature output', () => {
  const artifact = buildReceiptStorageArtifact({
    trustId: '1',
    beneficiary: '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
    attestationUid: '0x' + '22'.repeat(32),
    templateId: '0x' + '33'.repeat(32),
    coordinator: '0x965B0E63e00E7805569ee3B428Cf96330DFc57EF',
    verdict: 'ReleaseRecommended',
    createdAt: 1777177200,
    expiresAt: 1777782000,
    source: 'test',
    review: {
      decision: 'ready_for_verifier',
      rationale: ['complete context'],
    },
  });

  assert.equal(artifact.kind, 'BrewReviewReceiptArtifact');
  assert.equal(artifact.version, 1);
  assert.equal(artifact.trustId, '1');
  assert.equal(artifact.verdict, 'ReleaseRecommended');
  assert.equal(artifact.review.decision, 'ready_for_verifier');
  assert.equal(Object.hasOwn(artifact, 'coordinatorSignature'), false);
  assert.equal(Object.hasOwn(artifact, 'receiptRoot'), false);
});

test('serializeJsonArtifact is deterministic for object key order', () => {
  assert.equal(
    serializeJsonArtifact({ b: 2, a: { d: 4, c: 3 } }),
    serializeJsonArtifact({ a: { c: 3, d: 4 }, b: 2 }),
  );
});
