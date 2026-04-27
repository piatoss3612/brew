import { NextResponse, type NextRequest } from 'next/server';

import {
  normalizeKeeperHubExecution,
  type KeeperHubEvidenceApiResponse,
  type KeeperHubExecutionLog,
  type KeeperHubExecutionRecord,
  type KeeperHubExecutionStatusResponse,
} from '../../../../sponsor-evidence';

const DEFAULT_KEEPERHUB_API_BASE_URL = 'https://app.keeperhub.com';

type KeeperHubExecutionsResponse =
  | KeeperHubExecutionRecord[]
  | {
      data?: KeeperHubExecutionRecord[];
    };

type KeeperHubLogsResponse =
  | KeeperHubExecutionLog[]
  | {
      execution?: KeeperHubExecutionRecord;
      logs?: KeeperHubExecutionLog[];
      data?: KeeperHubExecutionLog[];
    };

function keeperHubConfig() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  const workflowId = process.env.KEEPERHUB_WORKFLOW_ID;
  const baseUrl = process.env.KEEPERHUB_API_BASE_URL ?? DEFAULT_KEEPERHUB_API_BASE_URL;
  const missing: string[] = [];

  if (!apiKey) missing.push('KEEPERHUB_API_KEY');
  if (!workflowId) missing.push('KEEPERHUB_WORKFLOW_ID');

  return {
    apiKey,
    workflowId,
    baseUrl: baseUrl.replace(/\/$/, ''),
    missing,
  };
}

async function keeperHubFetch<T>(path: string, apiKey: string): Promise<T> {
  const { baseUrl } = keeperHubConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`KeeperHub ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

function recordMatchesTrust(record: KeeperHubExecutionRecord, trustId: string | null) {
  if (!trustId) return true;
  const fields = [record.input, record.output];

  return fields.some((field) => hasTrustIdField(field, trustId));
}

function createdAtMs(record: KeeperHubExecutionRecord) {
  const timestamp = record.completedAt ?? record.startedAt ?? record.createdAt;
  if (!timestamp) return 0;

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function executionRecords(response: KeeperHubExecutionsResponse) {
  return Array.isArray(response) ? response : (response.data ?? []);
}

function executionLogs(response: KeeperHubLogsResponse) {
  if (Array.isArray(response)) return response;
  return response.logs ?? response.data ?? [];
}

function executionFromLogsResponse(response: KeeperHubLogsResponse) {
  return Array.isArray(response) ? undefined : response.execution;
}

function hasTrustIdField(value: unknown, trustId: string, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 6) return false;

  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'trustId' && String(field) === trustId) return true;
    if (field && typeof field === 'object' && hasTrustIdField(field, trustId, depth + 1)) {
      return true;
    }
  }

  return false;
}

function logsMatchTrust(logs: KeeperHubExecutionLog[], trustId: string | null) {
  if (!trustId) return true;
  return logs.some((log) => hasTrustIdField(log.input, trustId) || hasTrustIdField(log.output, trustId));
}

function stringField(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

function objectField(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return field && typeof field === 'object' ? (field as Record<string, unknown>) : undefined;
}

function sanitizeExecution(record: KeeperHubExecutionRecord | undefined): KeeperHubExecutionRecord | undefined {
  if (!record) return undefined;

  return {
    id: record.id,
    runId: record.runId,
    workflowId: record.workflowId,
    status: record.status,
    error: record.error,
    startedAt: record.startedAt,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  };
}

function sanitizeLogInput(input: unknown) {
  if (!input || typeof input !== 'object') return undefined;

  const triggerData = objectField(input, 'triggerData');
  if (triggerData) return { triggerData };

  const functionArgs = stringField(input, 'functionArgs');
  const contractAddress = stringField(input, 'contractAddress');
  const abiFunction = stringField(input, 'abiFunction');
  const actionType = stringField(input, 'actionType');
  const network = stringField(input, 'network');

  if (!functionArgs && !contractAddress && !abiFunction && !actionType && !network) return undefined;

  return {
    actionType,
    abiFunction,
    functionArgs,
    contractAddress,
    network,
  };
}

function sanitizeLog(log: KeeperHubExecutionLog): KeeperHubExecutionLog {
  return {
    id: log.id,
    executionId: log.executionId,
    nodeId: log.nodeId,
    nodeName: log.nodeName,
    nodeType: log.nodeType,
    status: log.status,
    input: sanitizeLogInput(log.input),
    output: log.output,
    error: log.error,
    duration: log.duration,
    createdAt: log.createdAt,
    startedAt: log.startedAt,
    completedAt: log.completedAt,
    timestamp: log.timestamp,
  };
}

export async function GET(request: NextRequest) {
  const config = keeperHubConfig();
  if (config.missing.length > 0 || !config.apiKey || !config.workflowId) {
    return NextResponse.json({
      configured: false,
      missing: config.missing,
    } satisfies KeeperHubEvidenceApiResponse);
  }

  const searchParams = request.nextUrl.searchParams;
  const workflowId = searchParams.get('workflowId') ?? config.workflowId;
  const trustId = searchParams.get('trustId');
  let executionId = searchParams.get('executionId') ?? undefined;
  let execution: KeeperHubExecutionRecord | undefined;
  let matchedLogs: KeeperHubExecutionLog[] | undefined;

  try {
    if (!executionId) {
      const executionsResponse = await keeperHubFetch<KeeperHubExecutionsResponse>(
        `/api/workflows/${encodeURIComponent(workflowId)}/executions`,
        config.apiKey,
      );
      const records = executionRecords(executionsResponse).sort(
        (a, b) => createdAtMs(b) - createdAtMs(a),
      );

      if (trustId) {
        for (const record of records) {
          if (recordMatchesTrust(record, trustId)) {
            execution = record;
            break;
          }

          if (!record.id) continue;

          const logsResponse = await keeperHubFetch<KeeperHubLogsResponse>(
            `/api/workflows/executions/${encodeURIComponent(record.id)}/logs`,
            config.apiKey,
          );
          const logs = executionLogs(logsResponse);

          if (logsMatchTrust(logs, trustId)) {
            execution = executionFromLogsResponse(logsResponse) ?? record;
            matchedLogs = logs;
            break;
          }
        }
      } else {
        execution = records[0];
      }

      executionId = execution?.id;
    }

    if (!executionId) {
      return NextResponse.json({
        configured: false,
        missing: [`execution for trust ${trustId ?? 'latest'}`],
      } satisfies KeeperHubEvidenceApiResponse);
    }

    const [status, logs] = await Promise.all([
      keeperHubFetch<KeeperHubExecutionStatusResponse>(
        `/api/workflows/executions/${encodeURIComponent(executionId)}/status`,
        config.apiKey,
      ),
      matchedLogs
        ? Promise.resolve(matchedLogs)
        : keeperHubFetch<KeeperHubLogsResponse>(
            `/api/workflows/executions/${encodeURIComponent(executionId)}/logs`,
            config.apiKey,
          ),
    ]);
    const normalizedLogs = Array.isArray(logs) ? logs : executionLogs(logs);
    const executionFromLogs = Array.isArray(logs) ? undefined : executionFromLogsResponse(logs);
    const normalizedExecution = executionFromLogs ?? execution;
    const keeperExecution = normalizeKeeperHubExecution({
      workflowId,
      executionId,
      runId: normalizedExecution?.runId ?? execution?.runId ?? execution?.id,
      execution: normalizedExecution ?? execution,
      status,
      logs: normalizedLogs,
    });

    return NextResponse.json({
      configured: true,
      workflowId,
      executionId,
      keeperExecution,
      raw: {
        execution: sanitizeExecution(normalizedExecution ?? execution),
        status,
        logs: normalizedLogs.map(sanitizeLog),
      },
    } satisfies KeeperHubEvidenceApiResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'KeeperHub request failed',
      },
      { status: 502 },
    );
  }
}
