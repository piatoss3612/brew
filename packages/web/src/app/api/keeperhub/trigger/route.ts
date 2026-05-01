import { NextResponse, type NextRequest } from 'next/server';

import type {
  KeeperHubTriggerApiResponse,
  KeeperHubTriggerPayload,
  ReviewReceiptPayload,
  ReviewReceiptStoragePayload,
} from '../../../../sponsor-evidence';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

type ReceiptServiceInput = {
  trustId: string;
  beneficiary: string;
  attestationUid: string;
  templateId: string;
  token?: string;
  amount?: string;
  deadline?: string;
  released?: boolean;
  refunded?: boolean;
  executeRelease?: boolean;
  runReviewSwarm: true;
  source: string;
  agenticIds?: unknown[];
};

const KEEPERHUB_WORKFLOW_FALLBACK_ID = 'kh://workflow/verify-and-release';

function reviewReceiptServiceConfig() {
  const url = process.env.BREW_REVIEW_RECEIPT_URL;
  const apiKey = process.env.BREW_REVIEW_RECEIPT_API_KEY;
  const missing: string[] = [];

  if (!url) missing.push('BREW_REVIEW_RECEIPT_URL');
  if (!apiKey) missing.push('BREW_REVIEW_RECEIPT_API_KEY');

  return { url, apiKey, missing };
}

function stringField(value: unknown, key: keyof KeeperHubTriggerPayload) {
  if (!value || typeof value !== 'object') return '';
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field.trim() : '';
}

function optionalStringField(value: unknown, key: keyof KeeperHubTriggerPayload) {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}

function optionalBooleanField(value: unknown, key: keyof KeeperHubTriggerPayload) {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'boolean' ? field : undefined;
}

function parsePayload(value: unknown): KeeperHubTriggerPayload | string {
  const payload = {
    trustId: stringField(value, 'trustId'),
    attestationUid: stringField(value, 'attestationUid'),
    beneficiary: optionalStringField(value, 'beneficiary'),
    escrowAddress: optionalStringField(value, 'escrowAddress'),
    verifierAddress: optionalStringField(value, 'verifierAddress'),
    templateId: optionalStringField(value, 'templateId'),
    schemaUid: optionalStringField(value, 'schemaUid'),
    token: optionalStringField(value, 'token'),
    amount: optionalStringField(value, 'amount'),
    deadline: optionalStringField(value, 'deadline'),
    released: optionalBooleanField(value, 'released'),
    refunded: optionalBooleanField(value, 'refunded'),
    executeRelease: optionalBooleanField(value, 'executeRelease'),
  };

  if (!payload.trustId || !/^\d+$/.test(payload.trustId)) return 'trustId must be a uint256 string';
  if (!BYTES32_PATTERN.test(payload.attestationUid)) return 'attestationUid must be bytes32';
  if (payload.beneficiary && !ADDRESS_PATTERN.test(payload.beneficiary)) return 'beneficiary must be an address';
  if (payload.escrowAddress && !ADDRESS_PATTERN.test(payload.escrowAddress)) return 'escrowAddress must be an address';
  if (payload.verifierAddress && !ADDRESS_PATTERN.test(payload.verifierAddress)) return 'verifierAddress must be an address';
  if (payload.templateId && !BYTES32_PATTERN.test(payload.templateId)) return 'templateId must be bytes32';
  if (payload.schemaUid && !BYTES32_PATTERN.test(payload.schemaUid)) return 'schemaUid must be bytes32';
  if (payload.token && !ADDRESS_PATTERN.test(payload.token)) return 'token must be an address';
  if (payload.amount && !/^\d+$/.test(payload.amount)) return 'amount must be a uint256 string';
  if (payload.deadline && !/^\d+$/.test(payload.deadline)) return 'deadline must be a uint64 string';

  return payload;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function readReviewReceipt(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>).reviewReceipt;
  if (!field || typeof field !== 'object') return undefined;
  const record = field as Record<string, unknown>;
  const receipt = {
    trustId: typeof record.trustId === 'string' ? record.trustId : undefined,
    beneficiary: typeof record.beneficiary === 'string' ? record.beneficiary : undefined,
    attestationUid: typeof record.attestationUid === 'string' ? record.attestationUid : undefined,
    templateId: typeof record.templateId === 'string' ? record.templateId : undefined,
    receiptRoot: typeof record.receiptRoot === 'string' ? record.receiptRoot : undefined,
    receiptUri: typeof record.receiptUri === 'string' ? record.receiptUri : undefined,
    coordinator: typeof record.coordinator === 'string' ? record.coordinator : undefined,
    verdict: typeof record.verdict === 'number' ? record.verdict : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
  };

  if (
    !receipt.trustId ||
    !/^\d+$/.test(receipt.trustId) ||
    !receipt.beneficiary ||
    !ADDRESS_PATTERN.test(receipt.beneficiary) ||
    !receipt.attestationUid ||
    !BYTES32_PATTERN.test(receipt.attestationUid) ||
    !receipt.templateId ||
    !BYTES32_PATTERN.test(receipt.templateId) ||
    !receipt.receiptRoot ||
    !BYTES32_PATTERN.test(receipt.receiptRoot) ||
    !receipt.receiptUri ||
    !receipt.coordinator ||
    !ADDRESS_PATTERN.test(receipt.coordinator) ||
    typeof receipt.verdict !== 'number' ||
    !receipt.createdAt ||
    !/^\d+$/.test(receipt.createdAt) ||
    !receipt.expiresAt ||
    !/^\d+$/.test(receipt.expiresAt)
  ) {
    return undefined;
  }

  return receipt as ReviewReceiptPayload;
}

function readReceiptStorage(value: unknown): ReviewReceiptStoragePayload | undefined {
  const field = objectRecord(value)?.receiptStorage;
  const record = objectRecord(field);
  if (!record) return undefined;
  const storage = {
    rootHash: stringValue(record.rootHash),
    uri: stringValue(record.uri),
    byteSize: typeof record.byteSize === 'number' ? record.byteSize : undefined,
    attempts: typeof record.attempts === 'number' ? record.attempts : undefined,
    txHash: stringValue(record.txHash),
  };

  if (
    !storage.rootHash ||
    !BYTES32_PATTERN.test(storage.rootHash) ||
    !storage.uri ||
    typeof storage.byteSize !== 'number' ||
    typeof storage.attempts !== 'number'
  ) {
    return undefined;
  }

  return storage as ReviewReceiptStoragePayload;
}

function findString(value: unknown, keys: string[]): string | undefined {
  const root = objectRecord(value);
  if (!root) return undefined;

  for (const key of keys) {
    const field = root[key];
    if (typeof field === 'string' && field.trim()) return field.trim();
  }

  for (const field of Object.values(root)) {
    const nested = objectRecord(field);
    if (!nested) continue;
    const result = findString(nested, keys);
    if (result) return result;
  }

  return undefined;
}

function readReceiptServiceRequest(value: unknown): ReceiptServiceInput | undefined {
  const record = objectRecord(value);
  if (!record) return undefined;
  const field = objectRecord(record.receiptServiceRequest);
  if (!field) return undefined;

  return normalizeReceiptServiceInput(field);
}

function findReceiptServiceRequest(value: unknown): ReceiptServiceInput | undefined {
  const direct = readReceiptServiceRequest(value);
  if (direct) return direct;

  const root = objectRecord(value);
  if (!root) return undefined;

  for (const field of Object.values(root)) {
    const nested = objectRecord(field);
    if (!nested) continue;
    const result = findReceiptServiceRequest(nested);
    if (result) return result;
  }

  return undefined;
}

function normalizeReceiptServiceInput(value: Record<string, unknown>): ReceiptServiceInput | undefined {
  const input = {
    trustId: stringValue(value.trustId),
    beneficiary: stringValue(value.beneficiary),
    attestationUid: stringValue(value.attestationUid),
    templateId: stringValue(value.templateId),
    token: stringValue(value.token),
    amount: stringValue(value.amount),
    deadline: stringValue(value.deadline),
    released: booleanValue(value.released),
    refunded: booleanValue(value.refunded),
    executeRelease: booleanValue(value.executeRelease),
    runReviewSwarm: true,
    source: stringValue(value.source) ?? 'receipt-service-keeperhub-webhook',
    agenticIds: Array.isArray(value.agenticIds) ? value.agenticIds : undefined,
  };

  if (
    !input.trustId ||
    !/^\d+$/.test(input.trustId) ||
    !input.beneficiary ||
    !ADDRESS_PATTERN.test(input.beneficiary) ||
    !input.attestationUid ||
    !BYTES32_PATTERN.test(input.attestationUid) ||
    !input.templateId ||
    !BYTES32_PATTERN.test(input.templateId)
  ) {
    return undefined;
  }

  return {
    ...input,
    trustId: input.trustId,
    beneficiary: input.beneficiary,
    attestationUid: input.attestationUid,
    templateId: input.templateId,
  } as ReceiptServiceInput;
}

function fallbackReceiptServiceInput(
  parsed: KeeperHubTriggerPayload,
  raw: unknown,
): ReceiptServiceInput | undefined {
  return normalizeReceiptServiceInput({
    trustId: parsed.trustId,
    beneficiary: parsed.beneficiary ?? findString(raw, ['beneficiary']),
    attestationUid: parsed.attestationUid,
    templateId: parsed.templateId ?? findString(raw, ['templateId']),
    token: parsed.token ?? findString(raw, ['token', 'erc20Token']),
    amount: parsed.amount ?? findString(raw, ['amount']),
    deadline: parsed.deadline ?? findString(raw, ['deadline']),
    released: parsed.released ?? findBoolean(raw, ['released']),
    refunded: parsed.refunded ?? findBoolean(raw, ['refunded']),
    executeRelease: parsed.executeRelease ?? findBoolean(raw, ['executeRelease']) ?? true,
    source: 'receipt-service-keeperhub-webhook',
  });
}

async function requestReviewReceipt(parsed: KeeperHubTriggerPayload, raw: unknown) {
  const config = reviewReceiptServiceConfig();
  if (config.missing.length > 0 || !config.url || !config.apiKey) {
    return {
      receiptError: `Review receipt service is not configured: ${config.missing.join(', ')}`,
    };
  }

  const input = findReceiptServiceRequest(raw) ?? fallbackReceiptServiceInput(parsed, raw);
  if (!input) {
    return {
      receiptError:
        'Trigger payload lacks beneficiary/templateId for receipt-service.',
    };
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    const text = await response.text();
    let body: Record<string, unknown> | undefined;

    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {
        receiptError: `Review receipt service returned non-JSON response: ${text.slice(0, 200)}`,
      };
    }

    if (!response.ok) {
      return {
        receiptError: `Review receipt service failed: ${response.status}`,
        receiptServiceRaw: body,
      };
    }

    if (body.configured === false) {
      const missing = Array.isArray(body.missing) ? body.missing.join(', ') : 'unknown';
      return {
        receiptError: `Review receipt service is not configured: ${missing}`,
        receiptServiceRaw: body,
      };
    }

    if (!readReviewReceipt(body) || typeof body.coordinatorSignature !== 'string') {
      return {
        receiptError:
          typeof body.receiptSummary === 'string'
            ? body.receiptSummary
            : 'Review receipt service did not return a signed receipt.',
        receiptServiceRaw: body,
      };
    }

    return {
      reviewReceipt: readReviewReceipt(body),
      coordinatorSignature: body.coordinatorSignature,
      receiptDigestInput: body.receiptDigestInput,
      receiptStorage: readReceiptStorage(body),
      keeperHubExecutionError:
        typeof body.keeperHubExecutionError === 'string'
          ? body.keeperHubExecutionError
          : undefined,
      keeperHubMissing: Array.isArray(body.keeperHubMissing)
        ? body.keeperHubMissing.filter((item) => typeof item === 'string')
        : undefined,
      receiptServiceRaw: body,
    };
  } catch (error) {
    return {
      receiptError:
        error instanceof Error ? error.message : 'Review receipt service request failed',
    };
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function findBoolean(value: unknown, keys: string[]): boolean | undefined {
  const root = objectRecord(value);
  if (!root) return undefined;

  for (const key of keys) {
    const field = root[key];
    if (typeof field === 'boolean') return field;
  }

  for (const field of Object.values(root)) {
    const nested = objectRecord(field);
    if (!nested) continue;
    const result = findBoolean(nested, keys);
    if (typeof result === 'boolean') return result;
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  const config = reviewReceiptServiceConfig();
  if (config.missing.length > 0 || !config.url || !config.apiKey) {
    return NextResponse.json({
      configured: false,
      missing: config.missing,
    } satisfies KeeperHubTriggerApiResponse);
  }

  const raw = await request.json().catch(() => null);
  const parsed = parsePayload(raw);
  if (typeof parsed === 'string') {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const generated = await requestReviewReceipt(parsed, raw);
  const generatedReceipt =
    generated && !('receiptError' in generated) ? generated : undefined;
  const receiptError =
    generated && 'receiptError' in generated ? generated.receiptError : undefined;
  const receiptServiceRaw = generated?.receiptServiceRaw;
  const keeperHubExecution =
    receiptServiceRaw && typeof receiptServiceRaw === 'object'
      ? (receiptServiceRaw as Record<string, unknown>).keeperHubExecution
      : undefined;

  return NextResponse.json({
    configured: true,
    workflowId: process.env.KEEPERHUB_WORKFLOW_ID ?? KEEPERHUB_WORKFLOW_FALLBACK_ID,
    executionId: findString(keeperHubExecution, ['executionId', 'id']),
    runId: findString(keeperHubExecution, ['runId']),
    reviewReceipt: generatedReceipt?.reviewReceipt,
    coordinatorSignature: generatedReceipt?.coordinatorSignature,
    reviewReceiptSource: generatedReceipt ? 'receipt-service-keeperhub-webhook' : undefined,
    receiptError,
    keeperHubExecutionError: generatedReceipt?.keeperHubExecutionError,
    keeperHubMissing: generatedReceipt?.keeperHubMissing,
    receiptDigestInput: generatedReceipt?.receiptDigestInput,
    receiptStorage: generatedReceipt?.receiptStorage,
    status: findString(keeperHubExecution, ['status']) ?? (generatedReceipt ? 'submitted' : undefined),
    raw: {
      receiptService: receiptServiceRaw,
    },
  } satisfies KeeperHubTriggerApiResponse);
}
