'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isAddress, type Address, type Hex } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { sepolia } from 'wagmi/chains';

import {
  BREW_ESCROW_ADDRESS,
  BREW_VERIFIER_ADDRESS,
  attestationVerifierAbi,
  brewEscrowAbi,
  erc20Abi,
} from '../../../contracts';
import {
  formatTimestamp,
  formatTrustAmount,
  getWalletTrustRole,
  isSameAddress,
  readDecimals,
  readString,
  shortHash,
  shortenAddress,
  statusLabels,
  txLink,
} from '../../../format';
import { fetchBrewStatus } from '../../../subgraph';

type ActionStep = 'idle' | 'switching' | 'verifying' | 'refunding' | 'confirmed' | 'error';
type ActiveAction = 'release' | 'refund';

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function isBytes32(value: string): value is Hex {
  return BYTES32_PATTERN.test(value);
}

function terminalStatus(status: string) {
  return status === 'RELEASED' || status === 'REFUNDED';
}

function readDeadlineSeconds(value?: string) {
  if (!value) return BigInt(0);

  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

export function TrustDetail({ trustId }: { trustId: string }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [attestationUid, setAttestationUid] = useState('');
  const [releaseHash, setReleaseHash] = useState<string | null>(null);
  const [refundHash, setRefundHash] = useState<string | null>(null);
  const [step, setStep] = useState<ActionStep>('idle');
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  const statusQuery = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });

  const trust = useMemo(
    () => statusQuery.data?.trusts.find((item) => item.trustId === trustId),
    [statusQuery.data?.trusts, trustId],
  );

  const tokenAddress = trust && isAddress(trust.token) ? (trust.token as Address) : undefined;
  const beneficiaryAddress =
    trust && isAddress(trust.beneficiary) ? (trust.beneficiary as Address) : undefined;
  const tokenReads = useReadContracts({
    contracts: tokenAddress
      ? [
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId: sepolia.id,
          },
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: sepolia.id,
          },
        ]
      : [],
    query: {
      enabled: Boolean(tokenAddress),
    },
  });

  const tokenSymbol = readString(tokenReads.data?.[0]?.result, 'TOKEN');
  const tokenDecimals = readDecimals(tokenReads.data?.[1]?.result);
  const trimmedAttestationUid = attestationUid.trim();
  const attestationReady = isBytes32(trimmedAttestationUid);
  const needsNetworkSwitch = isConnected && chainId !== sepolia.id;
  const deadlineSeconds = readDeadlineSeconds(trust?.deadline);
  const isSponsor = isSameAddress(trust?.sponsor ?? '', address);
  const isBeneficiary = isSameAddress(trust?.beneficiary ?? '', address);
  const hasRefundDeadline = deadlineSeconds > BigInt(0);
  const refundReady = hasRefundDeadline && BigInt(nowSeconds) >= deadlineSeconds;
  const canRelease =
    Boolean(trust) &&
    trust?.status === 'PENDING' &&
    isConnected &&
    isBeneficiary &&
    Boolean(publicClient) &&
    Boolean(beneficiaryAddress) &&
    attestationReady &&
    step !== 'switching' &&
    step !== 'verifying' &&
    step !== 'refunding' &&
    step !== 'confirmed';
  const canRefund =
    Boolean(trust) &&
    trust?.status === 'PENDING' &&
    isConnected &&
    isSponsor &&
    Boolean(publicClient) &&
    refundReady &&
    step !== 'switching' &&
    step !== 'verifying' &&
    step !== 'refunding' &&
    step !== 'confirmed';

  async function verifyAndRelease() {
    if (!trust || !beneficiaryAddress || !isBytes32(trimmedAttestationUid) || !publicClient) {
      return;
    }

    setErrorMessage(null);
    setReleaseHash(null);
    setRefundHash(null);
    setActiveAction('release');

    try {
      if (chainId !== sepolia.id) {
        setStep('switching');
        await switchChainAsync({ chainId: sepolia.id });
      }

      setStep('verifying');
      const nextReleaseHash = await writeContractAsync({
        address: BREW_VERIFIER_ADDRESS,
        abi: attestationVerifierAbi,
        functionName: 'verifyAndRelease',
        chainId: sepolia.id,
        args: [BigInt(trust.trustId), beneficiaryAddress, trimmedAttestationUid],
      });
      setReleaseHash(nextReleaseHash);
      await publicClient.waitForTransactionReceipt({ hash: nextReleaseHash });

      await queryClient.invalidateQueries({ queryKey: ['brew-status'] });
      setStep('confirmed');
    } catch (error) {
      setStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Release transaction failed');
    }
  }

  async function refundTrust() {
    if (!trust || !publicClient) {
      return;
    }

    setErrorMessage(null);
    setReleaseHash(null);
    setRefundHash(null);
    setActiveAction('refund');

    try {
      if (chainId !== sepolia.id) {
        setStep('switching');
        await switchChainAsync({ chainId: sepolia.id });
      }

      setStep('refunding');
      const nextRefundHash = await writeContractAsync({
        address: BREW_ESCROW_ADDRESS,
        abi: brewEscrowAbi,
        functionName: 'refund',
        chainId: sepolia.id,
        args: [BigInt(trust.trustId)],
      });
      setRefundHash(nextRefundHash);
      await publicClient.waitForTransactionReceipt({ hash: nextRefundHash });

      await queryClient.invalidateQueries({ queryKey: ['brew-status'] });
      setStep('confirmed');
    } catch (error) {
      setStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Refund transaction failed');
    }
  }

  if (statusQuery.isLoading) {
    return <p className="form-note">Loading trust from the subgraph.</p>;
  }

  if (!trust) {
    return (
      <section className="detail-panel">
        <p className="data-error">Trust #{trustId} is not indexed.</p>
      </section>
    );
  }

  const role = getWalletTrustRole(trust.sponsor, trust.beneficiary, address);
  const isTerminal = terminalStatus(trust.status);

  return (
    <>
      <section className="detail-panel" aria-label="Trust details">
        <div className="section-heading">
          <div>
            <span className="data-label">Trust detail</span>
            <h2>#{trust.trustId}</h2>
          </div>
          <strong>{statusLabels[trust.status]}</strong>
        </div>

        <div className="data-panel detail-grid">
          <div>
            <span className="data-label">Amount</span>
            <strong>
              {formatTrustAmount(
                trust.amount,
                tokenDecimals,
                tokenSymbol,
                tokenReads.isLoading,
              )}
            </strong>
          </div>
          <div>
            <span className="data-label">Role</span>
            <strong>{role}</strong>
          </div>
          <div>
            <span className="data-label">Sponsor</span>
            <strong title={trust.sponsor}>{shortenAddress(trust.sponsor)}</strong>
          </div>
          <div>
            <span className="data-label">Beneficiary</span>
            <strong title={trust.beneficiary}>{shortenAddress(trust.beneficiary)}</strong>
          </div>
          <div>
            <span className="data-label">Token</span>
            <strong title={trust.token}>{shortenAddress(trust.token)}</strong>
          </div>
          <div>
            <span className="data-label">Template</span>
            <strong title={trust.templateId}>{shortHash(trust.templateId)}</strong>
          </div>
          <div>
            <span className="data-label">Created</span>
            <strong>{formatTimestamp(trust.createdAt)}</strong>
          </div>
          <div>
            <span className="data-label">Deadline</span>
            <strong>{trust.deadline === '0' ? 'None' : formatTimestamp(trust.deadline)}</strong>
          </div>
          <div>
            <span className="data-label">Verified</span>
            <strong>{formatTimestamp(trust.verifiedAt)}</strong>
          </div>
        </div>
      </section>

      <section className="sponsor-panel" aria-label="Release trust">
        <div className="section-heading">
          <div>
            <span className="data-label">Release</span>
            <h2>{isTerminal ? 'Terminal state' : 'Verify attestation'}</h2>
          </div>
          {trust.attestationUid ? <strong>{shortHash(trust.attestationUid)}</strong> : null}
        </div>

        {!isTerminal && isBeneficiary ? (
          <>
            <div className="form-grid input-panel">
              <label className="wide-field">
                Attestation UID
                <input
                  autoComplete="off"
                  placeholder="0x..."
                  value={attestationUid}
                  onChange={(event) => {
                    setAttestationUid(event.target.value);
                    setStep('idle');
                    setActiveAction(null);
                    setReleaseHash(null);
                    setErrorMessage(null);
                  }}
                />
              </label>
            </div>

            <button className="primary-action" disabled={!canRelease} onClick={verifyAndRelease}>
              {needsNetworkSwitch ? 'Switch and release' : 'Verify and release'}
            </button>
          </>
        ) : !isTerminal ? (
          <p className="form-note">Waiting for an issuer attestation for this beneficiary.</p>
        ) : (
          <p className="form-note">Status: {statusLabels[trust.status]}</p>
        )}

        {!isConnected ? <p className="form-note">Connect a wallet to view release actions.</p> : null}
        {trimmedAttestationUid && !attestationReady ? (
          <p className="form-note">Enter a valid bytes32 attestation UID.</p>
        ) : null}
        {activeAction === 'release' && step !== 'idle' ? (
          <p className="form-note">Status: {step}</p>
        ) : null}
        {trust.verifiedTx ? (
          <a className="tx-link" href={txLink(trust.verifiedTx)} target="_blank" rel="noreferrer">
            Verified {shortHash(trust.verifiedTx)}
          </a>
        ) : null}
        {trust.releasedTx ? (
          <a className="tx-link" href={txLink(trust.releasedTx)} target="_blank" rel="noreferrer">
            Released {shortHash(trust.releasedTx)}
          </a>
        ) : null}
        {releaseHash ? (
          <a className="tx-link" href={txLink(releaseHash)} target="_blank" rel="noreferrer">
            Release tx {shortHash(releaseHash)}
          </a>
        ) : null}
        {statusQuery.error instanceof Error ? (
          <p className="data-error">{statusQuery.error.message}</p>
        ) : null}
        {activeAction === 'release' && errorMessage ? (
          <p className="data-error">{errorMessage}</p>
        ) : null}
      </section>

      <section className="sponsor-panel" aria-label="Refund trust">
        <div className="section-heading">
          <div>
            <span className="data-label">Refund</span>
            <h2>{trust.status === 'REFUNDED' ? 'Refunded' : 'Sponsor recovery'}</h2>
          </div>
          {trust.refundedTx ? <strong>{shortHash(trust.refundedTx)}</strong> : null}
        </div>

        {!isTerminal && isSponsor ? (
          <>
            <div className="trust-summary">
              <div>
                <span className="data-label">Deadline</span>
                <strong>{hasRefundDeadline ? formatTimestamp(trust.deadline) : 'Disabled'}</strong>
              </div>
              <div>
                <span className="data-label">Refund state</span>
                <strong>
                  {!hasRefundDeadline ? 'Disabled' : refundReady ? 'Ready' : 'Waiting'}
                </strong>
              </div>
            </div>

            <button className="primary-action" disabled={!canRefund} onClick={refundTrust}>
              {needsNetworkSwitch ? 'Switch and refund' : 'Refund trust'}
            </button>
          </>
        ) : trust.status === 'REFUNDED' ? (
          <p className="form-note">Status: refunded.</p>
        ) : !isTerminal ? (
          <p className="form-note">Refund is available only to the sponsor after deadline.</p>
        ) : (
          <p className="form-note">Status: {statusLabels[trust.status]}</p>
        )}

        {!isConnected ? <p className="form-note">Connect a wallet to view refund actions.</p> : null}
        {isSponsor && !hasRefundDeadline && !isTerminal ? (
          <p className="form-note">This trust has no refund deadline.</p>
        ) : null}
        {isSponsor && hasRefundDeadline && !refundReady && !isTerminal ? (
          <p className="form-note">Refund unlocks after {formatTimestamp(trust.deadline)}.</p>
        ) : null}
        {trust.refundedTx ? (
          <a className="tx-link" href={txLink(trust.refundedTx)} target="_blank" rel="noreferrer">
            Refunded {shortHash(trust.refundedTx)}
          </a>
        ) : null}
        {refundHash ? (
          <a className="tx-link" href={txLink(refundHash)} target="_blank" rel="noreferrer">
            Refund tx {shortHash(refundHash)}
          </a>
        ) : null}
        {activeAction === 'refund' && step !== 'idle' ? (
          <p className="form-note">Status: {step}</p>
        ) : null}
        {activeAction === 'refund' && errorMessage ? (
          <p className="data-error">{errorMessage}</p>
        ) : null}
      </section>
    </>
  );
}
