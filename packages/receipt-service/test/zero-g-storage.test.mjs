import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readUploadTxSeq } from '../src/zero-g-storage.mjs';

test('readUploadTxSeq extracts the StorageScan submission sequence', () => {
  assert.equal(readUploadTxSeq({ txSeq: 42 }), 42);
  assert.equal(readUploadTxSeq({ txSeqs: [43] }), 43);
  assert.equal(readUploadTxSeq({ txSeq: '44' }), 44);
  assert.equal(readUploadTxSeq({ txSeq: '' }), undefined);
});
