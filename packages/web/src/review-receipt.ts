import { type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { BREW_CHAIN } from './chain';
import { BREW_VERIFIER_ADDRESS } from './contracts';
import type { ReviewReceiptPayload } from './sponsor-evidence';
import {
  buildReceiptStorageArtifact,
  uploadJsonArtifactToZeroGStorage,
  zeroGStorageConfigFromEnv,
} from './zero-g-storage';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_RECEIPT_TTL_SECONDS = 7 * 24 * 60 * 60;

const REVIEW_RECEIPT_TYPES = {
  ReviewReceipt: [
    { name: 'trustId', type: 'uint256' },
    { name: 'beneficiary', type: 'address' },
    { name: 'attestationUid', type: 'bytes32' },
    { name: 'templateId', type: 'bytes32' },
    { name: 'receiptRoot', type: 'bytes32' },
    { name: 'receiptUri', type: 'string' },
    { name: 'coordinator', type: 'address' },
    { name: 'verdict', type: 'uint8' },
    { name: 'createdAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
} as const;

export type ReviewReceiptInput = {
  trustId: string;
  beneficiary: string;
  attestationUid: string;
  templateId: string;
  review?: unknown;
  source?: string;
};

export type ReviewReceiptGenerationResult = {
  reviewReceipt: ReviewReceiptPayload;
  coordinatorSignature: Hex;
  receiptDigestInput: unknown;
  receiptStorage: {
    rootHash: string;
    uri: string;
    byteSize: number;
    attempts: number;
    txHash?: string;
  };
};

export function reviewReceiptSignerConfig() {
  const privateKey = readOptionalEnv('BREW_REVIEW_COORDINATOR_PRIVATE_KEY');
  const expectedAddress = readOptionalEnv('BREW_REVIEW_COORDINATOR_ADDRESS');
  const storage = zeroGStorageConfigFromEnv();
  const missing: string[] = [];

  if (!privateKey) missing.push('BREW_REVIEW_COORDINATOR_PRIVATE_KEY');
  if (privateKey && !PRIVATE_KEY_PATTERN.test(privateKey)) {
    missing.push('BREW_REVIEW_COORDINATOR_PRIVATE_KEY(valid 0x-prefixed private key)');
  }
  if (expectedAddress && !ADDRESS_PATTERN.test(expectedAddress)) {
    missing.push('BREW_REVIEW_COORDINATOR_ADDRESS(valid address)');
  }
  missing.push(...storage.missing);

  return {
    privateKey,
    expectedAddress,
    storage,
    missing,
  };
}

export function validateReviewReceiptInput(input: ReviewReceiptInput) {
  if (!input.trustId || !/^\d+$/.test(input.trustId)) return 'trustId must be a uint256 string';
  if (!ADDRESS_PATTERN.test(input.beneficiary)) return 'beneficiary must be an address';
  if (!BYTES32_PATTERN.test(input.attestationUid)) return 'attestationUid must be bytes32';
  if (!BYTES32_PATTERN.test(input.templateId)) return 'templateId must be bytes32';
  return null;
}

export async function generateReviewReceipt(
  input: ReviewReceiptInput,
): Promise<ReviewReceiptGenerationResult> {
  const validationError = validateReviewReceiptInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const config = reviewReceiptSignerConfig();
  if (config.missing.length > 0 || !config.privateKey) {
    throw new Error(`Review receipt signer is not configured: ${config.missing.join(', ')}`);
  }

  const account = privateKeyToAccount(config.privateKey as Hex);
  if (
    config.expectedAddress &&
    account.address.toLowerCase() !== config.expectedAddress.toLowerCase()
  ) {
    throw new Error(
      `BREW_REVIEW_COORDINATOR_PRIVATE_KEY resolves to ${account.address}, expected ${config.expectedAddress}`,
    );
  }

  const createdAt = currentUnixSeconds();
  const ttlSeconds = readPositiveInt(
    readOptionalEnv('BREW_REVIEW_RECEIPT_TTL_SECONDS'),
    DEFAULT_RECEIPT_TTL_SECONDS,
  );
  const expiresAt = createdAt + ttlSeconds;
  if (!config.storage.privateKey) {
    throw new Error('Review receipt storage signer is not configured');
  }

  const receiptDigestInput = buildReceiptDigestInput(input, account.address, createdAt, expiresAt);
  const receiptStorage = await uploadJsonArtifactToZeroGStorage({
    artifact: receiptDigestInput,
    privateKey: config.storage.privateKey,
    rpcUrl: config.storage.rpcUrl,
    indexerRpc: config.storage.indexerRpc,
    uriPrefix: config.storage.uriPrefix,
    filePrefix: `brew-review-receipt-${input.trustId}`,
  });
  if (!receiptStorage.rootHash || !BYTES32_PATTERN.test(receiptStorage.rootHash)) {
    throw new Error('0G Storage upload did not return a bytes32 root hash');
  }
  if (!receiptStorage.uri) {
    throw new Error('0G Storage upload did not return a receipt URI');
  }
  const receiptRoot = receiptStorage.rootHash as Hex;
  const receiptUri = receiptStorage.uri;

  const message = {
    trustId: BigInt(input.trustId),
    beneficiary: input.beneficiary as Address,
    attestationUid: input.attestationUid as Hex,
    templateId: input.templateId as Hex,
    receiptRoot,
    receiptUri,
    coordinator: account.address,
    verdict: 1,
    createdAt: BigInt(createdAt),
    expiresAt: BigInt(expiresAt),
  };

  const coordinatorSignature = await account.signTypedData({
    domain: {
      name: 'BrewReviewReceipt',
      version: '1',
      chainId: BREW_CHAIN.id,
      verifyingContract: BREW_VERIFIER_ADDRESS,
    },
    types: REVIEW_RECEIPT_TYPES,
    primaryType: 'ReviewReceipt',
    message,
  });

  return {
    reviewReceipt: {
      trustId: input.trustId,
      beneficiary: input.beneficiary,
      attestationUid: input.attestationUid,
      templateId: input.templateId,
      receiptRoot,
      receiptUri,
      coordinator: account.address,
      verdict: 1,
      createdAt: String(createdAt),
      expiresAt: String(expiresAt),
    },
    coordinatorSignature,
    receiptDigestInput: {
      artifact: receiptDigestInput,
      storage: {
        rootHash: receiptRoot,
        uri: receiptUri,
        byteSize: receiptStorage.byteSize,
        attempts: receiptStorage.attempts,
        txHash: receiptStorage.txHash,
      },
    },
    receiptStorage: {
      rootHash: receiptRoot,
      uri: receiptUri,
      byteSize: receiptStorage.byteSize,
      attempts: receiptStorage.attempts,
      txHash: receiptStorage.txHash,
    },
  };
}

function buildReceiptDigestInput(
  input: ReviewReceiptInput,
  coordinator: Address,
  createdAt: number,
  expiresAt: number,
) {
  return buildReceiptStorageArtifact({
    source: input.source ?? 'server',
    trustId: input.trustId,
    beneficiary: input.beneficiary,
    attestationUid: input.attestationUid,
    templateId: input.templateId,
    coordinator,
    verdict: 'ReleaseRecommended',
    createdAt,
    expiresAt,
    review: input.review ?? null,
  });
}

function readOptionalEnv(key: string) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function currentUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}
