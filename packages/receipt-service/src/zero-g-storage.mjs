import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ethers } from 'ethers';
import { Indexer, ZgFile } from '@0gfoundation/0g-ts-sdk';

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function formatZeroGStorageUri(prefix, rootHash) {
  return `${prefix.replace(/\/+$/, '')}/${rootHash}`;
}

export function parseZeroGStorageRoot(value) {
  const raw = String(value ?? '').trim();
  const rootHash = raw.startsWith('0g://') ? raw.split('/').pop() : raw;

  if (!rootHash || !BYTES32_PATTERN.test(rootHash)) {
    throw new Error('0G Storage value must contain a bytes32 root hash');
  }

  return rootHash;
}

export function serializeJsonArtifact(value) {
  return `${JSON.stringify(stableJsonValue(value), null, 2)}\n`;
}

export async function uploadJsonArtifactToZeroGStorage(options) {
  const artifactJson = serializeJsonArtifact(options.artifact);
  const tempRoot = join(tmpdir(), `brew-receipt-service-upload-${Date.now()}-${process.pid}`);
  const tempFile = join(tempRoot, `${options.filePrefix ?? 'receipt'}.json`);
  const retries = Math.max(1, options.retries ?? 2);

  await mkdir(tempRoot, { recursive: true });
  await writeFile(tempFile, artifactJson, 'utf8');

  let file = null;
  let uploadFile = null;

  try {
    file = await ZgFile.fromFilePath(tempFile);
    const [tree, treeError] = await file.merkleTree();
    if (treeError) throw new Error(`0G Storage Merkle tree error: ${treeError}`);
    const rootHash = tree.rootHash();
    await closeZeroGFile(file);
    file = null;

    const provider = new ethers.JsonRpcProvider(options.rpcUrl);
    const signer = new ethers.Wallet(options.privateKey, provider);
    const indexer = new Indexer(options.indexerRpc);
    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        uploadFile = await ZgFile.fromFilePath(tempFile);
        const [uploadResult, uploadError] = await indexer.upload(
          uploadFile,
          options.rpcUrl,
          signer,
        );
        await closeZeroGFile(uploadFile);
        uploadFile = null;

        if (uploadError) throw new Error(`0G Storage upload error: ${uploadError}`);

        return {
          rootHash,
          uri: formatZeroGStorageUri(options.uriPrefix, rootHash),
          byteSize: Buffer.byteLength(artifactJson, 'utf8'),
          attempts: attempt,
          txHash: readUploadTxHash(uploadResult),
          txSeq: readUploadTxSeq(uploadResult),
        };
      } catch (error) {
        lastError = error;
        await closeZeroGFile(uploadFile);
        uploadFile = null;

        if (attempt < retries) await delay(attempt * 3000);
      }
    }

    throw lastError;
  } finally {
    await closeZeroGFile(file);
    await closeZeroGFile(uploadFile);
    if (existsSync(tempRoot)) await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function downloadJsonArtifactFromZeroGStorage(options) {
  const rootHash = parseZeroGStorageRoot(options.rootHashOrUri);
  const tempRoot = join(tmpdir(), `brew-receipt-service-retrieve-${Date.now()}-${process.pid}`);
  const tempFile = join(tempRoot, `${rootHash.slice(2, 10)}.json`);

  await mkdir(tempRoot, { recursive: true });

  try {
    const indexer = new Indexer(options.indexerRpc);
    const downloadError = await indexer.download(rootHash, tempFile, options.proof ?? false);
    if (downloadError) throw new Error(`0G Storage download error: ${downloadError.message}`);

    const content = await readFile(tempFile, 'utf8');

    return {
      rootHash,
      uri: formatZeroGStorageUri(options.uriPrefix, rootHash),
      byteSize: Buffer.byteLength(content, 'utf8'),
      artifact: JSON.parse(content),
      rawContent: content,
    };
  } finally {
    if (existsSync(tempRoot)) await rm(tempRoot, { recursive: true, force: true });
  }
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const stable = stableJsonValue(item);
      return stable === undefined ? null : stable;
    });
  }

  if (!value || typeof value !== 'object') return value;

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const stable = stableJsonValue(value[key]);
    if (stable !== undefined) sorted[key] = stable;
  }
  return sorted;
}

async function closeZeroGFile(file) {
  if (!file || typeof file.close !== 'function') return;
  try {
    await file.close();
  } catch {
    // Best-effort cleanup only.
  }
}

function readUploadTxHash(uploadResult) {
  if (!uploadResult) return undefined;
  if (typeof uploadResult === 'string') return uploadResult;
  if (typeof uploadResult !== 'object') return undefined;
  return (
    uploadResult.txHash ??
    uploadResult.hash ??
    uploadResult.transactionHash ??
    uploadResult.txHashes?.[0]
  );
}

export function readUploadTxSeq(uploadResult) {
  if (!uploadResult || typeof uploadResult !== 'object') return undefined;
  const raw =
    uploadResult.txSeq ??
    uploadResult.txSeqs?.[0] ??
    uploadResult.sequence ??
    uploadResult.submissionIndex;
  if (raw === undefined || raw === null || raw === '') return undefined;

  const sequence = Number(raw);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : undefined;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
