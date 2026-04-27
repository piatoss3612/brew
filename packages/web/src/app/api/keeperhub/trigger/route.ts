import { NextResponse, type NextRequest } from 'next/server';

import type {
  KeeperHubTriggerApiResponse,
  KeeperHubTriggerPayload,
} from '../../../../sponsor-evidence';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function keeperHubWebhookConfig() {
  const webhookUrl = process.env.KEEPERHUB_WEBHOOK_URL;
  const webhookApiKey = process.env.KEEPERHUB_WEBHOOK_API_KEY;
  const workflowId = process.env.KEEPERHUB_WORKFLOW_ID;
  const missing: string[] = [];

  if (!webhookUrl) missing.push('KEEPERHUB_WEBHOOK_URL');
  if (!webhookApiKey) missing.push('KEEPERHUB_WEBHOOK_API_KEY');

  return {
    webhookUrl,
    webhookApiKey,
    workflowId,
    missing,
  };
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

function parsePayload(value: unknown): KeeperHubTriggerPayload | string {
  const payload = {
    trustId: stringField(value, 'trustId'),
    attestationUid: stringField(value, 'attestationUid'),
    beneficiary: optionalStringField(value, 'beneficiary'),
    escrowAddress: optionalStringField(value, 'escrowAddress'),
    verifierAddress: optionalStringField(value, 'verifierAddress'),
    templateId: optionalStringField(value, 'templateId'),
    schemaUid: optionalStringField(value, 'schemaUid'),
  };

  if (!payload.trustId || !/^\d+$/.test(payload.trustId)) return 'trustId must be a uint256 string';
  if (!BYTES32_PATTERN.test(payload.attestationUid)) return 'attestationUid must be bytes32';
  if (payload.beneficiary && !ADDRESS_PATTERN.test(payload.beneficiary)) return 'beneficiary must be an address';
  if (payload.escrowAddress && !ADDRESS_PATTERN.test(payload.escrowAddress)) return 'escrowAddress must be an address';
  if (payload.verifierAddress && !ADDRESS_PATTERN.test(payload.verifierAddress)) return 'verifierAddress must be an address';
  if (payload.templateId && !BYTES32_PATTERN.test(payload.templateId)) return 'templateId must be bytes32';
  if (payload.schemaUid && !BYTES32_PATTERN.test(payload.schemaUid)) return 'schemaUid must be bytes32';

  return payload;
}

function readTextField(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

export async function POST(request: NextRequest) {
  const config = keeperHubWebhookConfig();
  if (config.missing.length > 0 || !config.webhookUrl || !config.webhookApiKey) {
    return NextResponse.json({
      configured: false,
      missing: config.missing,
    } satisfies KeeperHubTriggerApiResponse);
  }

  const parsed = parsePayload(await request.json().catch(() => null));
  if (typeof parsed === 'string') {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.webhookApiKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      trustId: parsed.trustId,
      attestationUid: parsed.attestationUid,
    }),
    cache: 'no-store',
  });

  const text = await response.text();
  let raw: unknown = text;

  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    raw = text;
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `KeeperHub webhook failed: ${response.status}`,
        raw,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    configured: true,
    workflowId: config.workflowId,
    executionId: readTextField(raw, 'executionId'),
    runId: readTextField(raw, 'runId'),
    status: readTextField(raw, 'status'),
    raw,
  } satisfies KeeperHubTriggerApiResponse);
}
