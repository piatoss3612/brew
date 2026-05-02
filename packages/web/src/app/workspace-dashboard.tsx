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

function walletTrusts(trusts: BrewTrust[], address?: string) {
  if (!address) return [];

  return trusts.filter(
    (trust) => isSameAddress(trust.sponsor, address) || isSameAddress(trust.beneficiary, address),
  );
}

function releaseActionLabel(trust: BrewTrust, address?: string) {
  if (trust.status === 'RELEASED') return 'Released';
  if (trust.status === 'REFUNDED') return 'Refunded';
  if (isSameAddress(trust.sponsor, address)) return 'Monitor proof';
  if (!trust.attestationUid && isSameAddress(trust.beneficiary, address)) return 'Attach proof';
  if (trust.attestationUid && !trust.reviewReceiptRoot) return 'Run agent review';
  if (trust.reviewReceiptRoot) return 'Release ready';
  return 'Open trust';
}

export function WorkspaceDashboard() {
  const { address, isConnected } = useAccount();
  const { data, error, isLoading } = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });
  const trusts = walletTrusts(data?.trusts ?? [], address);
  const sponsorCount = trusts.filter((trust) => isSameAddress(trust.sponsor, address)).length;
  const beneficiaryCount = trusts.filter((trust) => isSameAddress(trust.beneficiary, address)).length;
  const actionQueue = trusts.filter((trust) => trust.status === 'PENDING').slice(0, 5);

  return (
    <>
      <section className="workspace-hero" aria-label="Workspace summary">
        <div>
          <span className="data-label">Your workspace</span>
          <h2>{isConnected ? 'Trusts connected to this wallet' : 'Connect to see your trusts'}</h2>
          <p>
            Sponsor and beneficiary work is grouped here so the demo can show the user-facing
            operating surface without mixing it with the global workflow list.
          </p>
        </div>
        <div className="workspace-stats">
          <div>
            <span className="data-label">Related</span>
            <strong>{isLoading ? 'Loading' : trusts.length}</strong>
          </div>
          <div>
            <span className="data-label">Sponsor</span>
            <strong>{sponsorCount}</strong>
          </div>
          <div>
            <span className="data-label">Beneficiary</span>
            <strong>{beneficiaryCount}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid" aria-label="Workspace actions">
        <div className="workspace-panel">
          <div className="section-heading">
            <div>
              <span className="data-label">Action queue</span>
              <h2>Next work</h2>
            </div>
            <strong>{actionQueue.length}</strong>
          </div>

          {actionQueue.length ? (
            <div className="compact-trust-list">
              {actionQueue.map((trust) => {
                const visualState = getTrustVisualState(trust);

                return (
                  <Link
                    className={`compact-trust compact-trust-${visualState.tone}`}
                    href={`/trust/${trust.trustId}`}
                    key={trust.id}
                  >
                    <div>
                      <span>Trust #{trust.trustId}</span>
                      <strong>{releaseActionLabel(trust, address)}</strong>
                    </div>
                    <span className={`status-badge status-badge-${visualState.tone}`}>
                      {visualState.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="form-note">
              {isLoading
                ? 'Loading workspace trusts.'
                : isConnected
                  ? 'No pending work for this wallet.'
                  : 'Connect a wallet to load sponsor and beneficiary work.'}
            </p>
          )}
        </div>

        <div className="workspace-panel">
          <div className="section-heading">
            <div>
              <span className="data-label">Recent related trusts</span>
              <h2>Wallet scope</h2>
            </div>
            <Link className="secondary-link" href="/workflows">
              All workflows
            </Link>
          </div>

          {trusts.length ? (
            <div className="workspace-trust-stack">
              {trusts.slice(0, 6).map((trust) => {
                const visualState = getTrustVisualState(trust);

                return (
                  <Link className="workspace-trust-row" href={`/trust/${trust.trustId}`} key={trust.id}>
                    <div>
                      <span className="data-label">Trust #{trust.trustId}</span>
                      <strong>{visualState.label}</strong>
                    </div>
                    <div>
                      <span className="data-label">Role</span>
                      <strong>{getWalletTrustRole(trust.sponsor, trust.beneficiary, address)}</strong>
                    </div>
                    <div>
                      <span className="data-label">Template</span>
                      <strong>{shortHash(trust.templateId)}</strong>
                    </div>
                    <div>
                      <span className="data-label">Created</span>
                      <strong>{formatTimestamp(trust.createdAt)}</strong>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="form-note">
              {isConnected ? 'No trust currently references this wallet.' : 'Wallet scope is empty.'}
            </p>
          )}
        </div>
      </section>

      <section className="data-panel" aria-label="Workspace source of truth">
        <div>
          <span className="data-label">Connected wallet</span>
          <AddressDisplay address={address} />
        </div>
        <div>
          <span className="data-label">Indexed trusts</span>
          <strong>{data ? data.trusts.length : isLoading ? 'Loading' : '-'}</strong>
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
