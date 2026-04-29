import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ethers } from 'ethers';

import {
  buildReceiptStorageArtifact,
  serializeJsonArtifact,
  uploadJsonArtifactToZeroGStorage,
  zeroGStorageConfigFromEnv,
} from '../src/zero-g-storage.js';

const ENV_FILES = ['.env.local', '.env'];

loadEnvFiles();

const args = parseArgs(process.argv.slice(2));
const config = zeroGStorageConfigFromEnv();

if (config.missing.length > 0 || !config.privateKey) {
  fail(`Missing 0G Storage config: ${config.missing.join(', ')}`);
}

const wallet = new ethers.Wallet(config.privateKey);
const artifact = buildReceiptStorageArtifact(readReceiptInput(args, wallet.address));
const dryRun = args['dry-run'] === 'true';

try {
  if (dryRun) {
    const serialized = serializeJsonArtifact(artifact);
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dry-run',
          byteSize: Buffer.byteLength(serialized, 'utf8'),
          signerAddress: wallet.address,
          artifact,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const startedAt = Date.now();
  const storage = await uploadJsonArtifactToZeroGStorage({
    artifact,
    privateKey: config.privateKey,
    rpcUrl: config.rpcUrl,
    indexerRpc: config.indexerRpc,
    uriPrefix: config.uriPrefix,
    filePrefix: `brew-review-receipt-${artifact.trustId}`,
    retries: readPositiveInt(readEnv('BREW_0G_STORAGE_RETRIES'), 2),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: '0g-storage',
        elapsedMs: Date.now() - startedAt,
        rootHash: storage.rootHash,
        receiptUri: storage.uri,
        byteSize: storage.byteSize,
        attempts: storage.attempts,
        txHash: storage.txHash,
        signerAddress: wallet.address,
        rpcUrl: config.rpcUrl,
        indexerRpc: config.indexerRpc,
        artifact,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function readReceiptInput(parsedArgs, coordinator) {
  const now = Math.floor(Date.now() / 1000);
  return {
    trustId: parsedArgs['trust-id'] ?? '1',
    beneficiary:
      parsedArgs.beneficiary ?? '0x64dF96071ED800100E85B567add2B2e5190b0F0b',
    attestationUid: parsedArgs['attestation-uid'] ?? '0x' + '22'.repeat(32),
    templateId: parsedArgs['template-id'] ?? '0x' + '33'.repeat(32),
    coordinator,
    verdict: 'ReleaseRecommended',
    createdAt: readPositiveInt(parsedArgs['created-at'], now),
    expiresAt: readPositiveInt(parsedArgs['expires-at'], now + 7 * 24 * 60 * 60),
    source: 'killtest-0g-storage-receipt',
    review: {
      mode: 'killtest',
      provider: '0g-storage',
      decision: 'ready_for_verifier',
      rationale: ['0G Storage receipt upload kill-test artifact.'],
      riskFlags: ['none'],
      nextAction: 'trigger_keeperhub',
      receiptSummary: 'Synthetic Brew review receipt artifact for 0G Storage upload validation.',
    },
  };
}

function loadEnvFiles() {
  for (const file of ENV_FILES) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const index = trimmed.indexOf('=');
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      const value = stripQuotes(trimmed.slice(index + 1).trim());
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = 'true';
    }
  }

  return parsed;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readEnv(key) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInt(value, fallback) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
