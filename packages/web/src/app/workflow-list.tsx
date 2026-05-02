'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { formatTimestamp, shortHash } from '../format';
import { fetchBrewStatus } from '../subgraph';
import { buildWorkflowSteps, getTrustVisualState } from '../trust-visual-state';
import { AddressDisplay } from './address-display';

export function WorkflowList() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });
  const trusts = data?.trusts ?? [];

  return (
    <>
      <section className="workflow-list-head" aria-label="Workflow list summary">
        <div>
          <span className="data-label">All workflows</span>
          <h2>{isLoading ? 'Loading indexed workflows' : `${trusts.length} trust workflows`}</h2>
          <p>
            Each row is one full release workflow from funding through EAS proof, 0G review,
            KeeperHub execution, and final escrow state.
          </p>
        </div>
        <Link className="primary-action" href="/sponsor/new">
          New trust
        </Link>
      </section>

      {trusts.length ? (
        <section className="workflow-list" aria-label="Indexed trust workflows">
          {trusts.map((trust) => {
            const visualState = getTrustVisualState(trust);
            const steps = buildWorkflowSteps(trust);

            return (
              <Link
                className={`workflow-card workflow-card-${visualState.tone}`}
                href={`/trust/${trust.trustId}`}
                key={trust.id}
              >
                <div className="workflow-card-main">
                  <div>
                    <span className="data-label">Workflow</span>
                    <strong>Trust #{trust.trustId}</strong>
                  </div>
                  <span className={`status-badge status-badge-${visualState.tone}`}>
                    {visualState.label}
                  </span>
                </div>
                <div className="workflow-card-steps" aria-label={`Trust ${trust.trustId} steps`}>
                  {steps.map((step, index) => (
                    <div className={`workflow-step-chip workflow-step-chip-${step.tone}`} key={step.label}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{step.label}</strong>
                      <small>{step.state}</small>
                    </div>
                  ))}
                </div>
                <div className="workflow-card-grid">
                  <div>
                    <span className="data-label">Sponsor</span>
                    <AddressDisplay address={trust.sponsor} />
                  </div>
                  <div>
                    <span className="data-label">Beneficiary</span>
                    <AddressDisplay address={trust.beneficiary} />
                  </div>
                  <div>
                    <span className="data-label">Template</span>
                    <strong>{shortHash(trust.templateId)}</strong>
                  </div>
                  <div>
                    <span className="data-label">Created</span>
                    <strong>{formatTimestamp(trust.createdAt)}</strong>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <p className="form-note">
          {isLoading ? 'Loading workflows from the subgraph.' : 'No indexed workflows yet.'}
        </p>
      )}

      {error instanceof Error ? <p className="data-error">{error.message}</p> : null}
    </>
  );
}
