import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_ZERO_G_STORAGE_RPC_URL = 'https://evmrpc-testnet.0g.ai';
export const DEFAULT_ZERO_G_STORAGE_INDEXER_RPC =
  'https://indexer-storage-testnet-turbo.0g.ai';
export const DEFAULT_ZERO_G_STORAGE_URI_PREFIX = '0g://storage';
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function buildReceiptStorageArtifact(input) {
  return {
    kind: 'BrewReviewReceiptArtifact',
    version: 1,
    source: input.source,
    trustId: input.trustId,
    beneficiary: input.beneficiary,
    attestationUid: input.attestationUid,
    templateId: input.templateId,
    coordinator: input.coordinator,
    verdict: input.verdict,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    review: input.review ?? null,
  };
}

export function serializeJsonArtifact(value) {
  return `${JSON.stringify(stableJsonValue(value), null, 2)}\n`;
}

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

export function zeroGStorageConfigFromEnv(env = process.env) {
  const privateKey =
    readEnv(env, 'BREW_0G_STORAGE_PRIVATE_KEY') ??
    readEnv(env, 'ZERO_G_PRIVATE_KEY') ??
    readEnv(env, 'OG_COMPUTE_PRIVATE_KEY');
  const rpcUrl = readEnv(env, 'BREW_0G_STORAGE_RPC_URL') ?? DEFAULT_ZERO_G_STORAGE_RPC_URL;
  const indexerRpc =
    readEnv(env, 'BREW_0G_STORAGE_INDEXER_RPC') ?? DEFAULT_ZERO_G_STORAGE_INDEXER_RPC;
  const uriPrefix =
    readEnv(env, 'BREW_0G_STORAGE_URI_PREFIX') ?? DEFAULT_ZERO_G_STORAGE_URI_PREFIX;
  const missing = [];

  if (!privateKey) {
    missing.push('BREW_0G_STORAGE_PRIVATE_KEY or ZERO_G_PRIVATE_KEY');
  }

  return {
    privateKey,
    rpcUrl,
    indexerRpc,
    uriPrefix,
    missing,
  };
}

export async function downloadJsonArtifactFromZeroGStorage(options) {
  const rootHash = parseZeroGStorageRoot(options.rootHashOrUri);
  const tempDir = options.tempDir ?? tmpdir();
  const tempRoot = join(tempDir, `brew-0g-retrieve-${Date.now()}-${process.pid}`);
  const tempFile = join(tempRoot, `${rootHash.slice(2, 10)}.json`);

  await mkdir(tempRoot, { recursive: true });

  try {
    const { Indexer } = await importZeroGStorageSdk();
    const indexer = new Indexer(options.indexerRpc);
    const downloadError = await indexer.download(rootHash, tempFile, options.proof ?? false);

    if (downloadError) {
      throw new Error(`0G Storage download error: ${downloadError.message}`);
    }

    const content = await readFile(tempFile, 'utf8');
    const artifact = JSON.parse(content);

    return {
      rootHash,
      uri: formatZeroGStorageUri(options.uriPrefix, rootHash),
      byteSize: Buffer.byteLength(content, 'utf8'),
      artifact,
      rawContent: content,
    };
  } finally {
    if (existsSync(tempRoot)) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export async function uploadJsonArtifactToZeroGStorage(options) {
  const artifactJson = serializeJsonArtifact(options.artifact);
  const tempDir = options.tempDir ?? tmpdir();
  const tempRoot = join(tempDir, `brew-0g-storage-${Date.now()}-${process.pid}`);
  const tempFile = join(tempRoot, `${options.filePrefix ?? 'receipt'}.json`);
  const retries = Math.max(1, options.retries ?? 2);

  await mkdir(tempRoot, { recursive: true });
  await writeFile(tempFile, artifactJson, 'utf8');

  let file = null;
  let uploadFile = null;

  try {
    const { Indexer, ZgFile } = await importZeroGStorageSdk();
    const { ethers } = await import('ethers');

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
          uploadResult,
        };
      } catch (error) {
        lastError = error;
        await closeZeroGFile(uploadFile);
        uploadFile = null;

        if (attempt < retries) {
          await delay(attempt * 3000);
        }
      }
    }

    throw lastError;
  } finally {
    await closeZeroGFile(file);
    await closeZeroGFile(uploadFile);
    if (existsSync(tempRoot)) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function importZeroGStorageSdk() {
  try {
    return await import('@0gfoundation/0g-ts-sdk');
  } catch (error) {
    if (error instanceof Error && error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        '0G Storage upload requires @0gfoundation/0g-ts-sdk. Run: yarn add @0gfoundation/0g-ts-sdk',
      );
    }
    throw error;
  }
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const stable = stableJsonValue(item);
      return stable === undefined ? null : stable;
    });
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const stable = stableJsonValue(value[key]);
    if (stable !== undefined) sorted[key] = stable;
  }
  return sorted;
}

function readEnv(env, key) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
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
