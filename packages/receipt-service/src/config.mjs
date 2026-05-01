import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_CHAIN_ID = 11155111;
export const DEFAULT_ZERO_G_STORAGE_RPC_URL = 'https://evmrpc-testnet.0g.ai';
export const DEFAULT_ZERO_G_STORAGE_INDEXER_RPC =
  'https://indexer-storage-testnet-turbo.0g.ai';
export const DEFAULT_ZERO_G_STORAGE_URI_PREFIX = '0g://storage';
export const DEFAULT_RECEIPT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function loadEnvFiles(cwd = process.cwd()) {
  for (const file of ['.env.local', '.env']) {
    const path = join(cwd, file);
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

export function readServiceConfig(env = process.env) {
  const port = readPositiveInt(readEnv(env, 'PORT'), DEFAULT_PORT);
  const host = readEnv(env, 'HOST') ?? DEFAULT_HOST;
  const coordinatorPrivateKey = readEnv(env, 'BREW_REVIEW_COORDINATOR_PRIVATE_KEY');
  const coordinatorAddress = readEnv(env, 'BREW_REVIEW_COORDINATOR_ADDRESS');
  const verifierAddress = readEnv(env, 'BREW_VERIFIER_ADDRESS');
  const apiKey = readEnv(env, 'BREW_REVIEW_RECEIPT_API_KEY');
  const chainId = readPositiveInt(readEnv(env, 'BREW_REVIEW_RECEIPT_CHAIN_ID'), DEFAULT_CHAIN_ID);
  const ttlSeconds = readPositiveInt(
    readEnv(env, 'BREW_REVIEW_RECEIPT_TTL_SECONDS'),
    DEFAULT_RECEIPT_TTL_SECONDS,
  );
  const storagePrivateKey =
    readEnv(env, 'BREW_0G_STORAGE_PRIVATE_KEY') ??
    readEnv(env, 'ZERO_G_PRIVATE_KEY') ??
    readEnv(env, 'OG_COMPUTE_PRIVATE_KEY');
  const storageRpcUrl =
    readEnv(env, 'BREW_0G_STORAGE_RPC_URL') ?? DEFAULT_ZERO_G_STORAGE_RPC_URL;
  const storageIndexerRpc =
    readEnv(env, 'BREW_0G_STORAGE_INDEXER_RPC') ?? DEFAULT_ZERO_G_STORAGE_INDEXER_RPC;
  const storageUriPrefix =
    readEnv(env, 'BREW_0G_STORAGE_URI_PREFIX') ?? DEFAULT_ZERO_G_STORAGE_URI_PREFIX;
  const storageRetries = readPositiveInt(readEnv(env, 'BREW_0G_STORAGE_RETRIES'), 2);
  const missing = [];

  if (!coordinatorPrivateKey) missing.push('BREW_REVIEW_COORDINATOR_PRIVATE_KEY');
  if (!verifierAddress) missing.push('BREW_VERIFIER_ADDRESS');
  if (!storagePrivateKey) missing.push('BREW_0G_STORAGE_PRIVATE_KEY or ZERO_G_PRIVATE_KEY');

  return {
    port,
    host,
    apiKey,
    coordinatorPrivateKey,
    coordinatorAddress,
    verifierAddress,
    chainId,
    ttlSeconds,
    storage: {
      privateKey: storagePrivateKey,
      rpcUrl: storageRpcUrl,
      indexerRpc: storageIndexerRpc,
      uriPrefix: storageUriPrefix,
      retries: storageRetries,
    },
    missing,
  };
}

export function readEnv(env, key) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInt(value, fallback) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
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
