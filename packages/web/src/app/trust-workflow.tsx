'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchBrewStatus, type BrewTrust, type TrustStatus } from '../subgraph';

const statusLabels: Record<TrustStatus, string> = {
  PENDING: 'Pending',
  RELEASED: 'Released',
  REFUNDED: 'Refunded',
};

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatBrewAmount(amount: string) {
  return `${(Number(amount) / 1_000_000).toFixed(2)} BREW`;
}

function buildWorkflowSteps(trust?: BrewTrust) {
  const hasTrust = Boolean(trust);
  const isVerified = Boolean(trust?.attestationUid || trust?.verifiedAt);
  const isReleased = trust?.status === 'RELEASED';
  const isRefunded = trust?.status === 'REFUNDED';

  return [
    {
      label: 'Sponsor',
      state: hasTrust ? 'Funded' : 'Waiting for funding',
    },
    {
      label: 'Verify',
      state: isVerified ? 'Attestation verified' : 'Attestation pending',
    },
    {
      label: 'Release',
      state: isReleased
        ? 'Released'
        : isRefunded
          ? 'Refunded'
          : isVerified
            ? 'Ready to release'
            : 'Awaiting verification',
    },
  ];
}

export function TrustWorkflow() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });

  const latestTrust = data?.trusts[0];
  const workflowSteps = buildWorkflowSteps(latestTrust);

  return (
    <>
      <section className="workflow" aria-label="Trust workflow">
        {workflowSteps.map((step, index) => (
          <div className="workflow-row" key={step.label}>
            <span className="workflow-index">{String(index + 1).padStart(2, '0')}</span>
            <strong>{step.label}</strong>
            <span className="workflow-state">{step.state}</span>
          </div>
        ))}
      </section>

      <section className="data-panel" aria-label="Indexed trust data">
        <div>
          <span className="data-label">Latest trust</span>
          <strong>{latestTrust ? `#${latestTrust.trustId}` : isLoading ? 'Loading' : 'None'}</strong>
        </div>
        <div>
          <span className="data-label">Status</span>
          <strong>{latestTrust ? statusLabels[latestTrust.status] : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Amount</span>
          <strong>{latestTrust ? formatBrewAmount(latestTrust.amount) : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Beneficiary</span>
          <strong>{latestTrust ? shortenAddress(latestTrust.beneficiary) : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Templates</span>
          <strong>{data ? data.templates.length : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Verifier</span>
          <strong>
            {data?.verifierConfigs[0]
              ? shortenAddress(data.verifierConfigs[0].verifier)
              : '-'}
          </strong>
        </div>
      </section>

      {error instanceof Error ? <p className="data-error">{error.message}</p> : null}
    </>
  );
}
