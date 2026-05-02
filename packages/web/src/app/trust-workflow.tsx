'use client';

import { useQuery } from '@tanstack/react-query';
import { isAddress, type Address } from 'viem';
import { useReadContracts } from 'wagmi';

import { BREW_CHAIN } from '../chain';
import { erc20Abi } from '../contracts';
import { formatTrustAmount, readDecimals, readString } from '../format';
import { fetchBrewStatus } from '../subgraph';
import { buildWorkflowSteps, getTrustVisualState } from '../trust-visual-state';
import { AddressDisplay } from './address-display';

export function TrustWorkflow() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });

  const latestTrust = data?.trusts[0];
  const latestTokenAddress =
    latestTrust && isAddress(latestTrust.token) ? (latestTrust.token as Address) : undefined;
  const tokenReads = useReadContracts({
    contracts: latestTokenAddress
      ? [
          {
            address: latestTokenAddress,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId: BREW_CHAIN.id,
          },
          {
            address: latestTokenAddress,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: BREW_CHAIN.id,
          },
        ]
      : [],
    query: {
      enabled: Boolean(latestTokenAddress),
    },
  });
  const latestTokenSymbol = readString(tokenReads.data?.[0]?.result, 'TOKEN');
  const latestTokenDecimals = readDecimals(tokenReads.data?.[1]?.result);
  const workflowSteps = buildWorkflowSteps(latestTrust);
  const visualState = getTrustVisualState(latestTrust);
  const latestAmount = latestTrust
    ? formatTrustAmount(
        latestTrust.amount,
        latestTokenDecimals,
        latestTokenSymbol,
        tokenReads.isLoading,
      )
    : '-';

  return (
    <>
      <section
        className={`status-overview status-overview-${visualState.tone}`}
        aria-label="Latest trust status"
      >
        <div className="status-orb" aria-hidden="true" />
        <div className="status-overview-copy">
          <span className="data-label">Latest trust state</span>
          <h2>{visualState.label}</h2>
          <p>{visualState.detail}</p>
        </div>
        <div className="status-overview-meter" aria-label={`${visualState.progress}% complete`}>
          <span style={{ width: `${visualState.progress}%` }} />
        </div>
        <div className="status-overview-facts">
          <div>
            <span className="data-label">Trust</span>
            <strong>{latestTrust ? `#${latestTrust.trustId}` : isLoading ? 'Loading' : 'None'}</strong>
          </div>
          <div>
            <span className="data-label">Amount</span>
            <strong>{latestAmount}</strong>
          </div>
          <div>
            <span className="data-label">Beneficiary</span>
            <AddressDisplay address={latestTrust?.beneficiary} />
          </div>
        </div>
      </section>

      <section className="workflow" aria-label="Trust workflow">
        {workflowSteps.map((step, index) => (
          <div className={`workflow-row workflow-row-${step.tone}`} key={step.label}>
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
          <span className={`status-badge status-badge-${visualState.tone}`}>
            {visualState.label}
          </span>
        </div>
        <div>
          <span className="data-label">Amount</span>
          <strong>{latestAmount}</strong>
        </div>
        <div>
          <span className="data-label">Beneficiary</span>
          <AddressDisplay address={latestTrust?.beneficiary} />
        </div>
        <div>
          <span className="data-label">Templates</span>
          <strong>{data ? data.templates.length : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Verifier</span>
          <AddressDisplay address={data?.verifierConfigs[0]?.verifier} />
        </div>
      </section>

      {error instanceof Error ? <p className="data-error">{error.message}</p> : null}
    </>
  );
}
