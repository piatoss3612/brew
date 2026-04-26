'use client';

import { useQuery } from '@tanstack/react-query';
import { formatUnits, isAddress, type Address } from 'viem';
import { useReadContracts } from 'wagmi';
import { sepolia } from 'wagmi/chains';

import { erc20Abi } from '../contracts';
import { fetchBrewStatus, type BrewTrust, type TrustStatus } from '../subgraph';

const statusLabels: Record<TrustStatus, string> = {
  PENDING: 'Pending',
  RELEASED: 'Released',
  REFUNDED: 'Refunded',
};

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readDecimals(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'bigint' && value >= BigInt(0) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  return null;
}

function formatTrustAmount(amount: string, decimals: number | null, symbol: string, loading: boolean) {
  if (loading) return 'Loading';
  if (decimals === null) return `${amount} raw`;

  try {
    return `${formatUnits(BigInt(amount), decimals)} ${symbol}`;
  } catch {
    return `${amount} raw`;
  }
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
  const latestTokenAddress =
    latestTrust && isAddress(latestTrust.token) ? (latestTrust.token as Address) : undefined;
  const tokenReads = useReadContracts({
    contracts: latestTokenAddress
      ? [
          {
            address: latestTokenAddress,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId: sepolia.id,
          },
          {
            address: latestTokenAddress,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: sepolia.id,
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
          <strong>
            {latestTrust
              ? formatTrustAmount(
                  latestTrust.amount,
                  latestTokenDecimals,
                  latestTokenSymbol,
                  tokenReads.isLoading,
                )
              : '-'}
          </strong>
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
