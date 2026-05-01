import {
  BREW_ESCROW_ADDRESS,
  BREW_VERIFIER_ADDRESS,
  EAS_ADDRESS,
} from './contracts';
import type { BrewTemplate, BrewTrust } from './subgraph';
import { keccak256, toHex } from 'viem';

export type EvidenceMode = 'live' | 'simulated' | 'planned' | 'skipped';
export type KeeperExecutionStatus = 'waiting' | 'ready' | 'completed' | 'blocked';
export type KeeperExecutionPhaseStatus =
  | 'waiting'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'skipped';

export type KeeperExecutionPhase = {
  name: 'monitor' | 'preflight' | 'execute' | 'explain';
  status: KeeperExecutionPhaseStatus;
  summary: string;
};

export type KeeperExecutionInput = {
  trustId: string;
  beneficiary: string;
  attestationUid?: string;
  escrowAddress: string;
  verifierAddress: string;
  templateId: string;
  schemaUid?: string;
};

export type KeeperExecutionResult = {
  workflowId: string;
  executionMode: EvidenceMode;
  executionId?: string;
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  status: KeeperExecutionStatus;
  action: string;
  txHash?: string;
  revertReason?: string;
  nodeStatusSummary: string;
  phases: KeeperExecutionPhase[];
};

export type KeeperHubExecutionStatusResponse = {
  status?: string;
  nodeStatuses?: Array<{
    nodeId?: string;
    status?: string;
  }>;
  progress?: {
    totalSteps?: number;
    completedSteps?: number;
    runningSteps?: number;
    currentNodeId?: string;
    percentage?: number;
  };
};

export type KeeperHubExecutionLog = {
  id?: string;
  executionId?: string;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  duration?: number | string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  timestamp?: string;
};

export type KeeperHubExecutionRecord = {
  id?: string;
  runId?: string;
  workflowId?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  createdAt?: string;
  completedAt?: string;
};

export type KeeperHubEvidenceApiResponse =
  | {
      configured: false;
      missing: string[];
    }
  | {
      configured: true;
      workflowId: string;
      executionId?: string;
      keeperExecution: KeeperExecutionResult;
      raw: {
        execution?: KeeperHubExecutionRecord;
        status?: KeeperHubExecutionStatusResponse;
        logs?: KeeperHubExecutionLog[];
      };
    };

export type KeeperHubTriggerPayload = {
  trustId: string;
  attestationUid: string;
  beneficiary?: string;
  escrowAddress?: string;
  verifierAddress?: string;
  templateId?: string;
  schemaUid?: string;
  token?: string;
  amount?: string;
  deadline?: string;
  released?: boolean;
  refunded?: boolean;
  executeRelease?: boolean;
};

export type ReviewReceiptPayload = {
  trustId: string;
  beneficiary: string;
  attestationUid: string;
  templateId: string;
  receiptRoot: string;
  receiptUri: string;
  coordinator: string;
  verdict: number;
  createdAt: string;
  expiresAt: string;
};

export type ReviewReceiptStoragePayload = {
  rootHash: string;
  uri: string;
  byteSize: number;
  attempts: number;
  txHash?: string;
  txSeq?: number;
};

export type KeeperHubTriggerApiResponse =
  | {
      configured: false;
      missing: string[];
    }
  | {
      configured: true;
      workflowId?: string;
      executionId?: string;
      runId?: string;
      reviewReceipt?: ReviewReceiptPayload;
      coordinatorSignature?: string;
      reviewReceiptSource?:
        | 'keeperhub-workflow'
        | 'trigger-api-receipt-service'
        | 'receipt-service-keeperhub-webhook';
      receiptError?: string;
      keeperHubExecutionError?: string;
      keeperHubMissing?: string[];
      receiptDigestInput?: unknown;
      receiptStorage?: ReviewReceiptStoragePayload;
      status?: string;
      raw: unknown;
    };

export type BrewEvidenceReceipt = {
  version: 'brew.receipt.v1';
  key: string;
  mode: EvidenceMode;
  receiptDigest: string;
  trustId: string;
  templateId: string;
  attestationUid?: string;
  agentIntervention: {
    location: string;
    role: string;
    responsibility: string;
    boundary: string;
  };
  keeperHubWorkflowId: string;
  keeperHubExecutionId?: string;
  keeperHubRunId?: string;
  keeperHubStatus: KeeperExecutionStatus;
  verifierOutcome: 'pending' | 'released' | 'refunded';
  txHash?: string;
  revertReason?: string;
  issuedAt: string;
};

export type SponsorEvidence = {
  agent: {
    ensName: string;
    resolverMode: EvidenceMode;
    role: string;
    records: Record<string, string>;
    intervention: BrewEvidenceReceipt['agentIntervention'];
  };
  issuer: {
    address?: string;
    ensName?: string;
    resolverMode: EvidenceMode;
    authorizationSource: string;
  };
  keeperHub: {
    workflowId: string;
    executionMode: EvidenceMode;
    executionId?: string;
    runId?: string;
    status: KeeperExecutionStatus;
    action: string;
    txHash?: string;
    revertReason?: string;
    nodeStatusSummary: string;
    phases: KeeperExecutionPhase[];
  };
  storage: {
    provider: '0G';
    storageStatus: EvidenceMode;
    manifestUri: string;
    metadataRoot: string;
    receiptKey?: string;
    coordinator?: string;
    reviewedTx?: string;
    submissionSequence?: number;
  };
  receipt: BrewEvidenceReceipt;
  verifier: {
    authority: string;
    input: {
      trustId: string;
      beneficiary: string;
      templateId: string;
      schemaUid?: string;
      attestationUid?: string;
      escrowAddress: string;
      verifierAddress: string;
      easAddress: string;
    };
    outcome: 'pending' | 'released' | 'refunded';
  };
};

const AGENT_ENS_NAME = 'operator.brew.eth';
const KEEPER_WORKFLOW_ID = 'kh://workflow/verify-and-release';
const AGENT_INTERVENTION: BrewEvidenceReceipt['agentIntervention'] = {
  location: 'KeeperHub preflight, after ReadTrust and before ReleaseTrust',
  role: 'Trust Operations Agent',
  responsibility: 'Assemble trust state, attestation UID, execution status, and receipt evidence for the release attempt.',
  boundary: 'The agent prepares and explains the execution; AttestationVerifier and BrewEscrow decide whether funds can move.',
};

function verifierOutcome(trust: BrewTrust): SponsorEvidence['verifier']['outcome'] {
  if (trust.status === 'RELEASED') return 'released';
  if (trust.status === 'REFUNDED') return 'refunded';
  return 'pending';
}

function mapKeeperHubStatus(status?: string): KeeperExecutionStatus {
  if (status === 'success') return 'completed';
  if (status === 'error' || status === 'cancelled') return 'blocked';
  if (status === 'running' || status === 'pending') return 'ready';
  return 'ready';
}

function mapKeeperHubPhaseStatus(status?: string): KeeperExecutionPhaseStatus {
  if (status === 'success') return 'completed';
  if (status === 'error' || status === 'cancelled') return 'blocked';
  if (status === 'running') return 'running';
  if (status === 'pending') return 'waiting';
  return 'waiting';
}

function phaseNameFromLog(log: KeeperHubExecutionLog, index: number): KeeperExecutionPhase['name'] {
  const label = `${log.nodeName ?? ''} ${log.nodeType ?? ''}`.toLowerCase();

  if (label.includes('trigger') || label.includes('webhook') || label.includes('schedule')) {
    return 'monitor';
  }
  if (
    label.includes('read') ||
    label.includes('condition') ||
    label.includes('preflight') ||
    label.includes('canrelease') ||
    label.includes('can release')
  ) {
    return 'preflight';
  }
  if (label.includes('write') || label.includes('contract') || label.includes('execute')) {
    return 'execute';
  }
  if (label.includes('discord') || label.includes('notify') || label.includes('receipt')) {
    return 'explain';
  }

  return index === 0 ? 'monitor' : index === 1 ? 'preflight' : index === 2 ? 'execute' : 'explain';
}

function readTextField(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  for (const key of keys) {
    if (key in value) {
      const field = (value as Record<string, unknown>)[key];
      if (typeof field === 'string' && field.length > 0) return field;
    }
  }

  return undefined;
}

function summarizeKeeperHubLog(log: KeeperHubExecutionLog) {
  const error =
    typeof log.error === 'string'
      ? log.error
      : readTextField(log.error, ['message', 'error', 'reason']);
  if (error) return error;

  const txHash = readTextField(log.output, ['txHash', 'transactionHash', 'hash']);
  if (txHash) return `Transaction ${txHash}`;

  const transactionLink = readTextField(log.output, ['transactionLink']);
  if (transactionLink) return `Explorer link ${transactionLink}`;

  const success = readTextField(log.output, ['success']);
  if (success) return `Output success: ${success}`;

  return log.nodeName
    ? `${log.nodeName} ${log.status ?? 'pending'}`
    : `Node ${log.nodeId ?? 'unknown'} ${log.status ?? 'pending'}`;
}

function txHashFromLogs(logs: KeeperHubExecutionLog[]) {
  for (const log of logs) {
    const txHash = readTextField(log.output, ['txHash', 'transactionHash', 'hash']);
    if (txHash?.startsWith('0x')) return txHash;
  }

  return undefined;
}

function revertReasonFromLogs(logs: KeeperHubExecutionLog[]) {
  for (const log of logs) {
    const error =
      typeof log.error === 'string'
        ? log.error
        : readTextField(log.error, ['message', 'error', 'reason']);
    if (error) return error;

    const outputError = readTextField(log.output, ['error', 'revertReason', 'reason']);
    if (outputError) return outputError;
  }

  return undefined;
}

function logTimestampMs(log: KeeperHubExecutionLog) {
  const timestamp = log.startedAt ?? log.timestamp ?? log.createdAt ?? log.completedAt;
  if (!timestamp) return 0;

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeKeeperHubExecution(input: {
  workflowId: string;
  executionId?: string;
  runId?: string;
  status?: KeeperHubExecutionStatusResponse;
  logs?: KeeperHubExecutionLog[];
  execution?: KeeperHubExecutionRecord;
}): KeeperExecutionResult {
  const logs = [...(input.logs ?? [])].sort((a, b) => logTimestampMs(a) - logTimestampMs(b));
  const status = input.status?.status ?? input.execution?.status;
  const nodeStatuses = input.status?.nodeStatuses ?? [];
  const fallbackPhases: KeeperExecutionPhase[] = nodeStatuses.map((node, index) => ({
    name: phaseNameFromLog({ nodeId: node.nodeId, status: node.status }, index),
    status: mapKeeperHubPhaseStatus(node.status),
    summary: `KeeperHub node ${node.nodeId ?? index + 1} is ${node.status ?? 'pending'}.`,
  }));
  const logPhases: KeeperExecutionPhase[] = logs.map((log, index) => ({
    name: phaseNameFromLog(log, index),
    status: mapKeeperHubPhaseStatus(log.status),
    summary: summarizeKeeperHubLog(log),
  }));
  const phases = logPhases.length > 0 ? logPhases : fallbackPhases;
  const txHash = txHashFromLogs(logs);
  const revertReason = revertReasonFromLogs(logs);
  const progress = input.status?.progress;
  const progressSummary =
    progress &&
    typeof progress.percentage === 'number' &&
    typeof progress.totalSteps === 'number' &&
    progress.totalSteps > 0
      ? `${progress.completedSteps ?? 0}/${progress.totalSteps ?? 0} nodes complete (${progress.percentage}%).`
      : undefined;

  return {
    workflowId: input.workflowId,
    executionMode: 'live',
    executionId: input.executionId,
    runId: input.runId,
    startedAt: input.execution?.startedAt,
    completedAt: input.execution?.completedAt,
    status: mapKeeperHubStatus(status),
    action: 'verifyAndReleaseWithReceiptFields(uint256,address,bytes32,bytes32,string,address,uint64,uint64,bytes)',
    txHash,
    revertReason,
    nodeStatusSummary:
      progressSummary ?? `KeeperHub execution ${input.executionId ?? input.runId ?? ''} is ${status ?? 'unknown'}.`,
    phases:
      phases.length > 0
        ? phases
        : [
            {
              name: 'monitor',
              status: mapKeeperHubPhaseStatus(status),
              summary: `KeeperHub execution status: ${status ?? 'unknown'}.`,
            },
          ],
  };
}

function buildKeeperInput(
  trust: BrewTrust,
  template: BrewTemplate | undefined,
  attestationUid: string | undefined,
): KeeperExecutionInput {
  return {
    trustId: trust.trustId,
    beneficiary: trust.beneficiary,
    attestationUid,
    escrowAddress: BREW_ESCROW_ADDRESS,
    verifierAddress: BREW_VERIFIER_ADDRESS,
    templateId: trust.templateId,
    schemaUid: template?.schemaUid,
  };
}

function simulateKeeperExecution(input: {
  trust: BrewTrust;
  keeperInput: KeeperExecutionInput;
}): KeeperExecutionResult {
  const { trust, keeperInput } = input;
  const runId =
    trust.status === 'PENDING' && !keeperInput.attestationUid
      ? undefined
      : `simulated-run:trust-${trust.trustId}:${trust.status.toLowerCase()}`;

  if (trust.status === 'RELEASED') {
    return {
      workflowId: KEEPER_WORKFLOW_ID,
      executionMode: 'simulated',
      runId,
      status: 'completed',
      action: 'verifyAndReleaseWithReceiptFields(uint256,address,bytes32,bytes32,string,address,uint64,uint64,bytes)',
      txHash: trust.verifiedTx ?? undefined,
      nodeStatusSummary: 'Simulated KeeperHub run completed after verifier accepted the EAS proof.',
      phases: [
        {
          name: 'monitor',
          status: 'completed',
          summary: 'Detected released trust state from the indexed contract events.',
        },
        {
          name: 'preflight',
          status: 'completed',
          summary: 'Matched trust, beneficiary, template, issuer allowlist, and attestation UID.',
        },
        {
          name: 'execute',
          status: 'completed',
          summary: 'Submitted verifyAndReleaseWithReceiptFields with review receipt fields and observed the release transaction.',
        },
        {
          name: 'explain',
          status: 'completed',
          summary: 'Prepared the 0G evidence receipt for the successful release.',
        },
      ],
    };
  }

  if (trust.status === 'REFUNDED') {
    return {
      workflowId: KEEPER_WORKFLOW_ID,
      executionMode: 'simulated',
      runId,
      status: 'blocked',
      action: 'verifyAndReleaseWithReceiptFields(uint256,address,bytes32,bytes32,string,address,uint64,uint64,bytes)',
      revertReason: 'TrustAlreadyRefunded',
      nodeStatusSummary: 'Simulated KeeperHub run stopped because the trust is already refunded.',
      phases: [
        {
          name: 'monitor',
          status: 'completed',
          summary: 'Detected a terminal refunded trust.',
        },
        {
          name: 'preflight',
          status: 'blocked',
          summary: 'Stopped before write because the escrow can no longer release funds.',
        },
        {
          name: 'execute',
          status: 'skipped',
          summary: 'No write submitted for a terminal refunded trust.',
        },
        {
          name: 'explain',
          status: 'completed',
          summary: 'Prepared a blocked receipt with the deterministic failure reason.',
        },
      ],
    };
  }

  if (!keeperInput.attestationUid) {
    return {
      workflowId: KEEPER_WORKFLOW_ID,
      executionMode: 'simulated',
      status: 'waiting',
      action: 'verifyAndReleaseWithReceiptFields(uint256,address,bytes32,bytes32,string,address,uint64,uint64,bytes)',
      nodeStatusSummary: 'Waiting for an attestation UID before KeeperHub can execute release.',
      phases: [
        {
          name: 'monitor',
          status: 'waiting',
          summary: 'Pending trust is indexed, but no attestation UID is attached yet.',
        },
        {
          name: 'preflight',
          status: 'skipped',
          summary: 'Preflight needs a candidate attestation UID.',
        },
        {
          name: 'execute',
          status: 'skipped',
          summary: 'No write can be attempted without verifier input.',
        },
        {
          name: 'explain',
          status: 'waiting',
          summary: 'Receipt will be written after an execution attempt.',
        },
      ],
    };
  }

  return {
    workflowId: KEEPER_WORKFLOW_ID,
    executionMode: 'simulated',
    runId,
    status: 'ready',
    action: 'verifyAndReleaseWithReceiptFields(uint256,address,bytes32,bytes32,string,address,uint64,uint64,bytes)',
    nodeStatusSummary: 'Simulated KeeperHub preflight is ready to submit verifier execution.',
    phases: [
      {
        name: 'monitor',
        status: 'completed',
        summary: 'Detected a pending trust with a candidate attestation UID.',
      },
      {
        name: 'preflight',
        status: 'completed',
        summary: 'Prepared trustId, beneficiary, attestation UID, escrow, and verifier inputs.',
      },
      {
        name: 'execute',
        status: 'waiting',
        summary: 'Waiting for live KeeperHub write execution.',
      },
      {
        name: 'explain',
        status: 'waiting',
        summary: '0G receipt will be finalized after tx or revert evidence exists.',
      },
    ],
  };
}

function buildEvidenceReceipt(input: {
  trust: BrewTrust;
  keeperExecution: KeeperExecutionResult;
  attestationUid?: string;
}): BrewEvidenceReceipt {
  const { trust, keeperExecution, attestationUid } = input;
  const issuedAt = receiptIssuedAt(trust, keeperExecution);
  const liveReceiptRoot = trust.reviewReceiptRoot ?? undefined;
  const digestInput = {
    version: 'brew.receipt.v1',
    trustId: trust.trustId,
    templateId: trust.templateId,
    beneficiary: trust.beneficiary,
    attestationUid,
    agentIntervention: AGENT_INTERVENTION,
    keeperHubWorkflowId: keeperExecution.workflowId,
    keeperHubExecutionId: keeperExecution.executionId,
    keeperHubRunId: keeperExecution.runId,
    keeperHubStatus: keeperExecution.status,
    verifierOutcome: verifierOutcome(trust),
    txHash: keeperExecution.txHash,
    revertReason: keeperExecution.revertReason,
    issuedAt,
  };
  const receiptDigest = liveReceiptRoot ?? keccak256(toHex(JSON.stringify(digestInput)));

  return {
    version: 'brew.receipt.v1',
    key: `evidence:${trust.trustId}:${receiptDigest.slice(2, 14)}`,
    mode: liveReceiptRoot ? 'live' : 'simulated',
    receiptDigest,
    trustId: trust.trustId,
    templateId: trust.templateId,
    attestationUid,
    agentIntervention: AGENT_INTERVENTION,
    keeperHubWorkflowId: keeperExecution.workflowId,
    keeperHubExecutionId: keeperExecution.executionId,
    keeperHubRunId: keeperExecution.runId,
    keeperHubStatus: keeperExecution.status,
    verifierOutcome: verifierOutcome(trust),
    txHash: keeperExecution.txHash,
    revertReason: keeperExecution.revertReason,
    issuedAt,
  };
}

function timestampSecondsToIso(value: string | null | undefined) {
  if (!value) return undefined;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;

  return new Date(seconds * 1000).toISOString();
}

function receiptIssuedAt(trust: BrewTrust, keeperExecution: KeeperExecutionResult) {
  return (
    keeperExecution.completedAt ??
    keeperExecution.startedAt ??
    timestampSecondsToIso(trust.reviewedAt) ??
    timestampSecondsToIso(trust.verifiedAt) ??
    timestampSecondsToIso(trust.releasedAt) ??
    timestampSecondsToIso(trust.refundedAt) ??
    timestampSecondsToIso(trust.createdAt) ??
    '1970-01-01T00:00:00.000Z'
  );
}

export function buildSponsorEvidence(input: {
  trust: BrewTrust;
  template?: BrewTemplate;
  attestationUid?: string | null;
  connectedIssuer?: string;
  keeperExecution?: KeeperExecutionResult;
  receiptStorage?: ReviewReceiptStoragePayload;
  storageSubmissionSequence?: number;
}): SponsorEvidence {
  const {
    trust,
    template,
    attestationUid,
    connectedIssuer,
    keeperExecution,
    receiptStorage,
    storageSubmissionSequence,
  } = input;
  const effectiveAttestationUid = attestationUid ?? trust.attestationUid ?? undefined;
  const keeperInput = buildKeeperInput(trust, template, effectiveAttestationUid);
  const resolvedKeeperExecution =
    keeperExecution ?? simulateKeeperExecution({ trust, keeperInput });
  const receipt = buildEvidenceReceipt({
    trust,
    keeperExecution: resolvedKeeperExecution,
    attestationUid: effectiveAttestationUid,
  });
  const manifestUri =
    trust.reviewReceiptUri ??
    receiptStorage?.uri ??
    `0g://simulated/brew/trust/${trust.trustId}/manifest.json`;
  const metadataRoot = trust.reviewReceiptRoot ?? receiptStorage?.rootHash ?? receipt.receiptDigest;
  const storageStatus: EvidenceMode =
    (trust.reviewReceiptRoot && trust.reviewReceiptUri) || receiptStorage?.rootHash
      ? 'live'
      : 'simulated';

  return {
    agent: {
      ensName: AGENT_ENS_NAME,
      resolverMode: 'planned',
      role: 'Trust Operations Agent',
      intervention: AGENT_INTERVENTION,
      records: {
        'com.brew.role': 'trust-operations-agent',
        'com.brew.keeperhub_workflow': KEEPER_WORKFLOW_ID,
        'com.brew.0g_root': metadataRoot,
        'com.brew.manifest_uri': manifestUri,
        'com.brew.app': 'planned-audit-url',
      },
    },
    issuer: {
      address: connectedIssuer,
      ensName: connectedIssuer ? 'issuer.brew.eth' : undefined,
      resolverMode: connectedIssuer ? 'planned' : 'skipped',
      authorizationSource: 'AttestationVerifier issuer allowlist',
    },
    keeperHub: {
      ...resolvedKeeperExecution,
    },
    storage: {
      provider: '0G',
      storageStatus,
      manifestUri,
      metadataRoot,
      receiptKey: receipt.key,
      coordinator: trust.reviewCoordinator ?? undefined,
      reviewedTx: trust.reviewedTx ?? undefined,
      submissionSequence: receiptStorage?.txSeq ?? storageSubmissionSequence,
    },
    receipt,
    verifier: {
      authority: 'EAS attestation + issuer allowlist + Brew verifier + escrow state',
      input: {
        ...keeperInput,
        easAddress: EAS_ADDRESS,
      },
      outcome: verifierOutcome(trust),
    },
  };
}
