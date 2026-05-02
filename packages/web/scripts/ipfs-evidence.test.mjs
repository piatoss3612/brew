import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEvidenceFieldPatch,
  buildIpfsGatewayUrl,
  readPinataCid,
  sanitizeEvidenceFileName,
} from '../src/ipfs-evidence.mjs';

describe('ipfs evidence helpers', () => {
  it('maps upload output into URI and bytes32 hash schema fields', () => {
    const patch = buildEvidenceFieldPatch(
      [
        { type: 'uint8', name: 'milestone_index' },
        { type: 'string', name: 'deliverable_uri' },
        { type: 'bytes32', name: 'deliverable_hash' },
      ],
      {
        uri: 'ipfs://bafyEvidence',
        bytes32Hash: `0x${'1'.repeat(64)}`,
      },
    );

    assert.deepEqual(patch, {
      deliverable_uri: 'ipfs://bafyEvidence',
      deliverable_hash: `0x${'1'.repeat(64)}`,
    });
  });

  it('uses verification_source as the fallback URI field', () => {
    const patch = buildEvidenceFieldPatch(
      [
        { type: 'string', name: 'name' },
        { type: 'bytes32', name: 'transcript_hash' },
        { type: 'string', name: 'verification_source' },
      ],
      {
        uri: 'ipfs://bafyTranscript',
        bytes32Hash: `0x${'a'.repeat(64)}`,
      },
    );

    assert.deepEqual(patch, {
      transcript_hash: `0x${'a'.repeat(64)}`,
      verification_source: 'ipfs://bafyTranscript',
    });
  });

  it('builds gateway URLs from ipfs URIs and gateway bases', () => {
    assert.equal(
      buildIpfsGatewayUrl('ipfs://bafyEvidence/path/to/file.pdf', 'https://gateway.pinata.cloud/ipfs/'),
      'https://gateway.pinata.cloud/ipfs/bafyEvidence/path/to/file.pdf',
    );
  });

  it('reads CIDs from legacy and v3 Pinata responses', () => {
    assert.equal(readPinataCid({ IpfsHash: 'bafyLegacy' }), 'bafyLegacy');
    assert.equal(readPinataCid({ data: { cid: 'bafyV3' } }), 'bafyV3');
  });

  it('sanitizes blank and unsafe file names', () => {
    assert.equal(sanitizeEvidenceFileName('../'), 'brew-evidence');
    assert.equal(sanitizeEvidenceFileName(' transcript final.pdf '), 'transcript-final.pdf');
  });
});
