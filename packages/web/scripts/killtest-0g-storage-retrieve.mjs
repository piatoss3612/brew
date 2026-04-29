import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  downloadJsonArtifactFromZeroGStorage,
  parseZeroGStorageRoot,
  zeroGStorageConfigFromEnv,
} from '../src/zero-g-storage.js';

const ENV_FILES = ['.env.local', '.env'];

loadEnvFiles();

const args = parseArgs(process.argv.slice(2));
const rootHashOrUri = args['root-hash'] ?? args.uri ?? args.root;

if (!rootHashOrUri) {
  fail('Missing --root-hash or --uri.');
}

const config = zeroGStorageConfigFromEnv();

try {
  const rootHash = parseZeroGStorageRoot(rootHashOrUri);
  const startedAt = Date.now();
  const retrieved = await downloadJsonArtifactFromZeroGStorage({
    rootHashOrUri: rootHash,
    indexerRpc: config.indexerRpc,
    uriPrefix: config.uriPrefix,
    proof: args.proof === 'true',
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: '0g-storage-retrieve',
        elapsedMs: Date.now() - startedAt,
        rootHash: retrieved.rootHash,
        receiptUri: retrieved.uri,
        byteSize: retrieved.byteSize,
        indexerRpc: config.indexerRpc,
        artifact: retrieved.artifact,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
