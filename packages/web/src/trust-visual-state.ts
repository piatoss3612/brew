import type { BrewTrust } from './subgraph';

export type TrustTone = 'pending' | 'ready' | 'released' | 'refunded' | 'empty';
export type WorkflowStepTone = 'complete' | 'active' | 'waiting' | 'released' | 'refunded';

export type WorkflowStep = {
  label: string;
  state: string;
  tone: WorkflowStepTone;
};

export function getTrustVisualState(trust?: BrewTrust) {
  if (!trust) {
    return {
      tone: 'empty' as TrustTone,
      label: 'No indexed trust',
      detail: 'Create a trust to start the release workflow.',
      progress: 0,
    };
  }

  if (trust.status === 'RELEASED') {
    return {
      tone: 'released' as TrustTone,
      label: 'Released',
      detail: 'Funds have moved through verifier and KeeperHub execution.',
      progress: 100,
    };
  }

  if (trust.status === 'REFUNDED') {
    return {
      tone: 'refunded' as TrustTone,
      label: 'Refunded',
      detail: 'The trust is closed and sponsor recovery has completed.',
      progress: 100,
    };
  }

  if (trust.reviewReceiptRoot || trust.reviewedAt) {
    return {
      tone: 'ready' as TrustTone,
      label: 'Ready to release',
      detail: 'Agent review receipt is sealed. KeeperHub can execute the verifier.',
      progress: 78,
    };
  }

  if (trust.attestationUid || trust.verifiedAt) {
    return {
      tone: 'pending' as TrustTone,
      label: 'Awaiting review',
      detail: 'EAS proof is linked. 0G review council has not sealed a receipt yet.',
      progress: 52,
    };
  }

  return {
    tone: 'pending' as TrustTone,
    label: 'Pending proof',
    detail: 'Funds are locked. Beneficiary evidence is still needed.',
    progress: 28,
  };
}

export function buildWorkflowSteps(trust?: BrewTrust): WorkflowStep[] {
  const hasTrust = Boolean(trust);
  const isVerified = Boolean(trust?.attestationUid || trust?.verifiedAt);
  const isReviewed = Boolean(trust?.reviewReceiptRoot || trust?.reviewedAt);
  const isReleased = trust?.status === 'RELEASED';
  const isRefunded = trust?.status === 'REFUNDED';

  return [
    {
      label: 'Funded',
      state: hasTrust ? 'Funds locked' : 'Waiting for funding',
      tone: hasTrust ? 'complete' : 'waiting',
    },
    {
      label: 'Attested',
      state: isVerified ? 'EAS proof linked' : 'Proof pending',
      tone: isVerified ? 'complete' : hasTrust ? 'active' : 'waiting',
    },
    {
      label: 'Reviewed',
      state: isReviewed ? 'Agent receipt sealed' : isVerified ? 'Review ready' : 'Awaiting proof',
      tone: isReviewed ? 'complete' : isVerified ? 'active' : 'waiting',
    },
    {
      label: 'Released',
      state: isReleased ? 'Released' : isRefunded ? 'Refunded' : 'Awaiting execution',
      tone: isReleased ? 'released' : isRefunded ? 'refunded' : isReviewed ? 'active' : 'waiting',
    },
  ];
}
