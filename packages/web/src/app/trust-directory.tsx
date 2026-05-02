'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAccount } from 'wagmi';

import {
  formatTimestamp,
  getWalletTrustRole,
  isSameAddress,
  shortHash,
} from '../format';
import { fetchBrewStatus, type BrewTrust } from '../subgraph';
import { getTrustVisualState } from '../trust-visual-state';
import { AddressDisplay } from './address-display';

function sortConnectedTrusts(trusts: BrewTrust[], address?: string) {
  if (!address) return trusts;

  return [...trusts].sort((left, right) => {
    const leftRelated = isSameAddress(left.sponsor, address) || isSameAddress(left.beneficiary, address);
    const rightRelated =
      isSameAddress(right.sponsor, address) || isSameAddress(right.beneficiary, address);

    if (leftRelated === rightRelated) return 0;
    return leftRelated ? -1 : 1;
  });
}

export function TrustDirectory() {
  const { address } = useAccount();
  const { data, error, isLoading } = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });

  const trusts = sortConnectedTrusts(data?.trusts ?? [], address);

  return (
    <section className="trust-directory" id="trusts" aria-label="Trust directory">
      <div className="section-heading">
        <div>
          <span className="data-label">Indexed trusts</span>
          <h2>{address ? 'Your workspace' : 'Recent trusts'}</h2>
        </div>
        <strong>{isLoading ? 'Loading' : `${trusts.length} total`}</strong>
      </div>

      {trusts.length ? (
        <div className="trust-list">
          {trusts.map((trust) => {
            const visualState = getTrustVisualState(trust);

            return (
              <Link
                className={`trust-card trust-card-${visualState.tone}`}
                href={`/trust/${trust.trustId}`}
                key={trust.id}
              >
                <div className="trust-card-main">
                  <div>
                    <span>Trust #{trust.trustId}</span>
                    <strong>{visualState.label}</strong>
                  </div>
                  <span className={`status-badge status-badge-${visualState.tone}`}>
                    {visualState.label}
                  </span>
                </div>
                <div className="trust-progress" aria-hidden="true">
                  <span style={{ width: `${visualState.progress}%` }} />
                </div>
                <p className="trust-card-state">{visualState.detail}</p>
                <div className="trust-card-grid">
                  <div>
                    <span className="data-label">Role</span>
                    <strong>{getWalletTrustRole(trust.sponsor, trust.beneficiary, address)}</strong>
                  </div>
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
        </div>
      ) : (
        <p className="form-note">
          {isLoading ? 'Loading trusts from the subgraph.' : 'No indexed trusts yet.'}
        </p>
      )}

      {error instanceof Error ? <p className="data-error">{error.message}</p> : null}
    </section>
  );
}
