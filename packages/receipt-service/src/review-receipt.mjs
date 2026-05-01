import { ethers } from 'ethers';

import { uploadJsonArtifactToZeroGStorage } from './zero-g-storage.mjs';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

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
};

export function validateReviewReceiptInput(input) {
  if (!input.trustId || !/^\d+$/.test(input.trustId)) return 'trustId must be a uint256 string';
  if (!ADDRESS_PATTERN.test(input.beneficiary)) return 'beneficiary must be an address';
  if (!BYTES32_PATTERN.test(input.attestationUid)) return 'attestationUid must be bytes32';
  if (!BYTES32_PATTERN.test(input.templateId)) return 'templateId must be bytes32';
  return null;
}

export function validateServiceConfig(config) {
  const missing = [...config.missing];
  if (
    config.coordinatorPrivateKey &&
    !PRIVATE_KEY_PATTERN.test(config.coordinatorPrivateKey)
  ) {
    missing.push('BREW_REVIEW_COORDINATOR_PRIVATE_KEY(valid 0x-prefixed private key)');
  }
  if (config.coordinatorAddress && !ADDRESS_PATTERN.test(config.coordinatorAddress)) {
    missing.push('BREW_REVIEW_COORDINATOR_ADDRESS(valid address)');
  }
  if (config.verifierAddress && !ADDRESS_PATTERN.test(config.verifierAddress)) {
    missing.push('BREW_VERIFIER_ADDRESS(valid address)');
  }

  return missing;
}

export async function generateReviewReceipt(input, config) {
  const validationError = validateReviewReceiptInput(input);
  if (validationError) throw new Error(validationError);

  const missing = validateServiceConfig(config);
  if (missing.length > 0) {
    throw new Error(`Review receipt service is not configured: ${missing.join(', ')}`);
  }

  const wallet = new ethers.Wallet(config.coordinatorPrivateKey);
  if (
    config.coordinatorAddress &&
    wallet.address.toLowerCase() !== config.coordinatorAddress.toLowerCase()
  ) {
    throw new Error(
      `BREW_REVIEW_COORDINATOR_PRIVATE_KEY resolves to ${wallet.address}, expected ${config.coordinatorAddress}`,
    );
  }

  const createdAt = currentUnixSeconds();
  const expiresAt = createdAt + config.ttlSeconds;
  const artifact = buildReceiptArtifact({
    ...input,
    coordinator: wallet.address,
    createdAt,
    expiresAt,
  });
  const receiptStorage = await uploadJsonArtifactToZeroGStorage({
    artifact,
    privateKey: config.storage.privateKey,
    rpcUrl: config.storage.rpcUrl,
    indexerRpc: config.storage.indexerRpc,
    uriPrefix: config.storage.uriPrefix,
    filePrefix: `brew-review-receipt-${input.trustId}`,
    retries: config.storage.retries,
  });

  if (!BYTES32_PATTERN.test(receiptStorage.rootHash)) {
    throw new Error('0G Storage upload did not return a bytes32 root hash');
  }

  const reviewReceipt = buildReviewReceiptMessage({
    input,
    coordinator: wallet.address,
    receiptRoot: receiptStorage.rootHash,
    receiptUri: receiptStorage.uri,
    createdAt,
    expiresAt,
  });
  const coordinatorSignature = await wallet.signTypedData(
    {
      name: 'BrewReviewReceipt',
      version: '1',
      chainId: config.chainId,
      verifyingContract: config.verifierAddress,
    },
    REVIEW_RECEIPT_TYPES,
    {
      ...reviewReceipt,
      trustId: BigInt(reviewReceipt.trustId),
      createdAt: BigInt(reviewReceipt.createdAt),
      expiresAt: BigInt(reviewReceipt.expiresAt),
    },
  );

  return {
    reviewReceipt,
    coordinatorSignature,
    receiptDigestInput: {
      artifact,
      storage: receiptStorage,
    },
    receiptStorage,
  };
}

export function buildReceiptArtifact(input) {
  const votes = normalizeVotes(input.votes, input.review);
  const aggregate = normalizeAggregate(input.aggregate, votes);

  return {
    kind: 'BrewSwarmReviewBundle',
    version: 1,
    source: input.source ?? 'receipt-service',
    trust: {
      trustId: input.trustId,
      beneficiary: input.beneficiary,
      attestationUid: input.attestationUid,
      templateId: input.templateId,
    },
    reviewCouncil: {
      coordinator: input.coordinator,
      agenticIds: normalizeAgenticIds(input.agenticIds),
    },
    votes,
    aggregate,
    receipt: {
      verdict: 'ReleaseRecommended',
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    },
  };
}

export function buildReviewReceiptMessage({
  input,
  coordinator,
  receiptRoot,
  receiptUri,
  createdAt,
  expiresAt,
}) {
  return {
    trustId: input.trustId,
    beneficiary: input.beneficiary,
    attestationUid: input.attestationUid,
    templateId: input.templateId,
    receiptRoot,
    receiptUri,
    coordinator,
    verdict: 1,
    createdAt: String(createdAt),
    expiresAt: String(expiresAt),
  };
}

export function normalizeReviewReceiptInput(body) {
  return {
    trustId: stringField(body, 'trustId'),
    beneficiary: stringField(body, 'beneficiary'),
    attestationUid: stringField(body, 'attestationUid'),
    templateId: stringField(body, 'templateId'),
    source: stringField(body, 'source') || 'receipt-service',
    review: body && typeof body === 'object' ? body.review : undefined,
    agenticIds: arrayField(body, 'agenticIds'),
    votes: arrayField(body, 'votes'),
    aggregate: objectField(body, 'aggregate'),
  };
}

function stringField(value, key) {
  if (!value || typeof value !== 'object') return '';
  const field = value[key];
  return typeof field === 'string' ? field.trim() : '';
}

function optionalStringField(value, key) {
  const field = stringField(value, key);
  return field || undefined;
}

function arrayField(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  const field = value[key];
  return Array.isArray(field) ? field : undefined;
}

function objectField(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  const field = value[key];
  return field && typeof field === 'object' && !Array.isArray(field) ? field : undefined;
}

function stringArrayField(value, key) {
  if (!value || typeof value !== 'object') return [];
  const field = value[key];
  if (!Array.isArray(field)) return [];
  return field.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function booleanField(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  const field = value[key];
  return typeof field === 'boolean' ? field : undefined;
}

function normalizeAgenticIds(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) =>
      withoutUndefined({
        role: stringField(item, 'role') || `agent-${index + 1}`,
        agenticId: optionalStringField(item, 'agenticId'),
        chain: optionalStringField(item, 'chain'),
        contract: optionalStringField(item, 'contract'),
        tokenId: optionalStringField(item, 'tokenId'),
        metadataHash: optionalStringField(item, 'metadataHash'),
        authorizedExecutor: optionalStringField(item, 'authorizedExecutor'),
      }),
    );
}

function normalizeVotes(votes, legacyReview) {
  if (Array.isArray(votes) && votes.length > 0) {
    return votes
      .filter((vote) => vote && typeof vote === 'object')
      .map((vote, index) =>
        withoutUndefined({
          role: stringField(vote, 'role') || `agent-${index + 1}`,
          agenticId: optionalStringField(vote, 'agenticId'),
          decision: stringField(vote, 'decision') || 'unknown',
          rationale: stringArrayField(vote, 'rationale'),
          riskFlags: stringArrayField(vote, 'riskFlags'),
          nextAction: optionalStringField(vote, 'nextAction'),
          receiptSummary: optionalStringField(vote, 'receiptSummary'),
          raw: objectField(vote, 'raw'),
        }),
      );
  }

  if (legacyReview && typeof legacyReview === 'object') {
    return [
      {
        role: stringField(legacyReview, 'role') || 'operations',
        agenticId: optionalStringField(legacyReview, 'agenticId'),
        decision: stringField(legacyReview, 'decision') || 'unknown',
        rationale: stringArrayField(legacyReview, 'rationale'),
        riskFlags: stringArrayField(legacyReview, 'riskFlags'),
        nextAction: optionalStringField(legacyReview, 'nextAction'),
        receiptSummary: optionalStringField(legacyReview, 'receiptSummary'),
        raw: legacyReview,
      },
    ];
  }

  return [];
}

function normalizeAggregate(value, votes) {
  const verdict = stringField(value, 'verdict') || inferredVerdict(votes);
  return {
    rule: stringField(value, 'rule') || 'evidence approve + policy approve + risk no-veto',
    verdict,
    releaseReady: booleanField(value, 'releaseReady') ?? verdict === 'ReleaseRecommended',
    rationale: stringArrayField(value, 'rationale'),
  };
}

function inferredVerdict(votes) {
  if (votes.length === 0) return 'ReleaseRecommended';

  const hasBlock = votes.some((vote) => {
    const decision = String(vote.decision ?? '').toLowerCase();
    return decision === 'blocked' || decision === 'reject' || decision === 'rejected';
  });
  if (hasBlock) return 'Rejected';

  return 'ReleaseRecommended';
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function currentUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}
