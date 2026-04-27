'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  decodeEventLog,
  encodeAbiParameters,
  isAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
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
  EAS_ADDRESS,
  EAS_SCHEMA_REGISTRY_ADDRESS,
  attestationVerifierAbi,
  brewEscrowAbi,
  easAbi,
  erc20Abi,
  schemaRegistryAbi,
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
import { fetchKeeperHubEvidence, triggerKeeperHubRelease } from '../../../keeperhub';
import { buildSponsorEvidence } from '../../../sponsor-evidence';
import { fetchBrewStatus } from '../../../subgraph';
import { SponsorEvidencePanel } from './sponsor-evidence-panel';

type ActionStep =
  | 'idle'
  | 'switching'
  | 'attesting'
  | 'verifying'
  | 'refunding'
  | 'confirmed'
  | 'error';
type ActiveAction = 'attest' | 'release' | 'refund';
type KeeperHubTriggerState = 'idle' | 'triggering' | 'submitted' | 'error';

type SchemaRecord = {
  uid: string;
  resolver: string;
  revocable: boolean;
  schema: string;
};

type SchemaField = {
  type: string;
  name: string;
};

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;
const DEFAULT_FIELD_VALUES: Record<string, string> = {
  conferral_date: '1704067200',
  deliverable_hash: keccak256(toHex('brew-demo')),
  deliverable_uri: 'ipfs://brew-demo',
  degree_type: 'Bachelor',
  employer: 'Brew Labs',
  milestone_index: '1',
  name: 'Demo Recipient',
  ope_id: '001234',
  program_name: 'Brew Fellowship',
  quarter: '1',
  report_hash: keccak256(toHex('brew-report')),
  report_uri: 'ipfs://brew-report',
  start_date: '1704067200',
  transcript_hash: keccak256(toHex('brew-transcript')),
  university: 'Demo University',
  verification_source: 'issuer-demo',
  verification_timestamp: '1704067200',
};

function isBytes32(value: string): value is Hex {
  return BYTES32_PATTERN.test(value);
}

function readSchemaRecord(value: unknown): SchemaRecord | null {
  if (!value || typeof value !== 'object') return null;

  if (
    'uid' in value &&
    'resolver' in value &&
    'revocable' in value &&
    'schema' in value &&
    typeof value.uid === 'string' &&
    typeof value.resolver === 'string' &&
    typeof value.revocable === 'boolean' &&
    typeof value.schema === 'string'
  ) {
    return {
      uid: value.uid,
      resolver: value.resolver,
      revocable: value.revocable,
      schema: value.schema,
    };
  }

  if (Array.isArray(value)) {
    const [uid, resolver, revocable, schema] = value;

    if (
      typeof uid === 'string' &&
      typeof resolver === 'string' &&
      typeof revocable === 'boolean' &&
      typeof schema === 'string'
    ) {
      return { uid, resolver, revocable, schema };
    }
  }

  return null;
}

function parseSchemaFields(schema: string): SchemaField[] {
  return schema
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => {
      const [type, ...nameParts] = field.split(/\s+/);
      return {
        type: type ?? '',
        name: nameParts.join(' ') || field,
      };
    });
}

function defaultFieldValue(field: SchemaField) {
  return DEFAULT_FIELD_VALUES[field.name] ?? (field.type.startsWith('uint') ? '1' : '');
}

function parseSchemaFieldValue(field: SchemaField, rawValue: string) {
  const value = rawValue.trim();

  if (field.type === 'string') return value;
  if (field.type === 'address') {
    if (!isAddress(value)) throw new Error(`${field.name} must be an address`);
    return value;
  }
  if (field.type === 'bytes32') {
    if (!isBytes32(value)) throw new Error(`${field.name} must be bytes32`);
    return value;
  }
  if (field.type === 'bool') {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`${field.name} must be true or false`);
    }
    return value === 'true';
  }
  if (field.type.startsWith('uint')) {
    if (!/^\d+$/.test(value)) throw new Error(`${field.name} must be an unsigned integer`);
    return BigInt(value);
  }

  throw new Error(`Unsupported schema field type: ${field.type}`);
}

function encodeAttestationData(fields: SchemaField[], values: Record<string, string>) {
  const parameters = fields.map((field) => ({
    name: field.name,
    type: field.type,
  }));
  const parsedValues = fields.map((field) =>
    parseSchemaFieldValue(field, values[field.name] ?? defaultFieldValue(field)),
  );

  return encodeAbiParameters(parameters, parsedValues);
}

function readAttestationUid(
  logs: Array<{
    address: Address;
    data: Hex;
    topics: [Hex, ...Hex[]] | [];
  }>,
) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== EAS_ADDRESS.toLowerCase()) continue;

    try {
      const decoded = decodeEventLog({
        abi: easAbi,
        data: log.data,
        topics: log.topics,
      });

      if (
        decoded.eventName === 'Attested' &&
        decoded.args &&
        'uid' in decoded.args &&
        typeof decoded.args.uid === 'string'
      ) {
        return decoded.args.uid as Hex;
      }
    } catch {
      // Ignore unrelated EAS logs.
    }
  }

  return null;
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
  const [attestationFieldValues, setAttestationFieldValues] = useState<Record<string, string>>({});
  const [attestationHash, setAttestationHash] = useState<string | null>(null);
  const [createdAttestationUid, setCreatedAttestationUid] = useState<string | null>(null);
  const [releaseHash, setReleaseHash] = useState<string | null>(null);
  const [refundHash, setRefundHash] = useState<string | null>(null);
  const [keeperHubRunId, setKeeperHubRunId] = useState<string | null>(null);
  const [keeperHubTriggerState, setKeeperHubTriggerState] =
    useState<KeeperHubTriggerState>('idle');
  const [keeperHubTriggerError, setKeeperHubTriggerError] = useState<string | null>(null);
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
  const template = useMemo(
    () => statusQuery.data?.templates.find((item) => item.templateId === trust?.templateId),
    [statusQuery.data?.templates, trust?.templateId],
  );
  const keeperHubQuery = useQuery({
    queryKey: ['keeperhub-evidence', trust?.trustId ?? trustId],
    queryFn: () => fetchKeeperHubEvidence(trust?.trustId ?? trustId),
    enabled: Boolean(trust),
    refetchOnWindowFocus: false,
  });

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
  const schemaUid = template?.schemaUid;
  const schemaReads = useReadContracts({
    contracts: schemaUid && isBytes32(schemaUid)
      ? [
          {
            address: EAS_SCHEMA_REGISTRY_ADDRESS,
            abi: schemaRegistryAbi,
            functionName: 'getSchema',
            chainId: sepolia.id,
            args: [schemaUid],
          },
        ]
      : [],
    query: {
      enabled: Boolean(schemaUid && isBytes32(schemaUid)),
    },
  });
  const issuerReads = useReadContracts({
    contracts: trust && address && isBytes32(trust.templateId)
      ? [
          {
            address: BREW_VERIFIER_ADDRESS,
            abi: attestationVerifierAbi,
            functionName: 'isIssuerAllowed',
            chainId: sepolia.id,
            args: [trust.templateId, address],
          },
        ]
      : [],
    query: {
      enabled: Boolean(trust && address && isBytes32(trust.templateId)),
    },
  });

  const tokenSymbol = readString(tokenReads.data?.[0]?.result, 'TOKEN');
  const tokenDecimals = readDecimals(tokenReads.data?.[1]?.result);
  const schemaResult = schemaReads.data?.[0]?.result;
  const schemaRecord = useMemo(() => readSchemaRecord(schemaResult), [schemaResult]);
  const schemaFields = useMemo(
    () => (schemaRecord ? parseSchemaFields(schemaRecord.schema) : []),
    [schemaRecord],
  );
  const issuerAllowed = issuerReads.data?.[0]?.result === true;
  const attestationExpiryWindow = Number(template?.expiryWindowSeconds ?? '0');
  const attestationExpirationSeconds =
    attestationExpiryWindow > 0
      ? BigInt(nowSeconds + Math.min(attestationExpiryWindow, 7 * 24 * 60 * 60))
      : BigInt(0);
  const trimmedAttestationUid = attestationUid.trim();
  const attestationReady = isBytes32(trimmedAttestationUid);
  const needsNetworkSwitch = isConnected && chainId !== sepolia.id;
  const deadlineSeconds = readDeadlineSeconds(trust?.deadline);
  const isSponsor = isSameAddress(trust?.sponsor ?? '', address);
  const isBeneficiary = isSameAddress(trust?.beneficiary ?? '', address);
  const hasRefundDeadline = deadlineSeconds > BigInt(0);
  const refundReady = hasRefundDeadline && BigInt(nowSeconds) >= deadlineSeconds;
  const actionBusy =
    step === 'switching' ||
    step === 'attesting' ||
    step === 'verifying' ||
    step === 'refunding';
  const canRelease =
    Boolean(trust) &&
    trust?.status === 'PENDING' &&
    isConnected &&
    isBeneficiary &&
    Boolean(publicClient) &&
    Boolean(beneficiaryAddress) &&
    attestationReady &&
    !actionBusy &&
    !(activeAction === 'release' && step === 'confirmed');
  const canAttest =
    Boolean(trust) &&
    trust?.status === 'PENDING' &&
    isConnected &&
    issuerAllowed &&
    Boolean(publicClient) &&
    Boolean(beneficiaryAddress) &&
    Boolean(schemaRecord) &&
    schemaFields.length > 0 &&
    !createdAttestationUid &&
    !actionBusy;
  const canRefund =
    Boolean(trust) &&
    trust?.status === 'PENDING' &&
    isConnected &&
    isSponsor &&
    Boolean(publicClient) &&
    refundReady &&
    !actionBusy &&
    !(activeAction === 'refund' && step === 'confirmed');
  const canTriggerKeeperHub =
    Boolean(trust) &&
    trust?.status === 'PENDING' &&
    attestationReady &&
    keeperHubTriggerState !== 'triggering';

  async function issueAttestation() {
    if (!trust || !beneficiaryAddress || !publicClient || !schemaUid || !isBytes32(schemaUid)) {
      return;
    }

    setErrorMessage(null);
    setAttestationHash(null);
    setReleaseHash(null);
    setRefundHash(null);
    setActiveAction('attest');

    try {
      if (chainId !== sepolia.id) {
        setStep('switching');
        await switchChainAsync({ chainId: sepolia.id });
      }

      const encodedData = encodeAttestationData(schemaFields, attestationFieldValues);

      setStep('attesting');
      const nextAttestationHash = await writeContractAsync({
        address: EAS_ADDRESS,
        abi: easAbi,
        functionName: 'attest',
        chainId: sepolia.id,
        args: [
          {
            schema: schemaUid,
            data: {
              recipient: beneficiaryAddress,
              expirationTime: attestationExpirationSeconds,
              revocable: true,
              refUID: ZERO_BYTES32,
              data: encodedData,
              value: BigInt(0),
            },
          },
        ],
      });
      setAttestationHash(nextAttestationHash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: nextAttestationHash });
      const nextAttestationUid = readAttestationUid(receipt.logs);
      if (!nextAttestationUid) {
        throw new Error('Attestation confirmed, but UID could not be decoded from the receipt');
      }

      setCreatedAttestationUid(nextAttestationUid);
      setAttestationUid(nextAttestationUid);
      setStep('confirmed');
    } catch (error) {
      setStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Attestation transaction failed');
    }
  }

  async function verifyAndRelease() {
    if (!trust || !beneficiaryAddress || !isBytes32(trimmedAttestationUid) || !publicClient) {
      return;
    }

    setErrorMessage(null);
    setReleaseHash(null);
    setAttestationHash(null);
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

  async function triggerKeeperHubWorkflow() {
    if (!trust || !isBytes32(trimmedAttestationUid)) {
      return;
    }

    setKeeperHubTriggerState('triggering');
    setKeeperHubTriggerError(null);
    setKeeperHubRunId(null);

    try {
      const result = await triggerKeeperHubRelease({
        trustId: trust.trustId,
        attestationUid: trimmedAttestationUid,
      });

      if (!result.configured) {
        throw new Error(`KeeperHub trigger is not configured: ${result.missing.join(', ')}`);
      }

      setKeeperHubRunId(result.runId ?? result.executionId ?? result.status ?? 'submitted');
      setKeeperHubTriggerState('submitted');
      await queryClient.invalidateQueries({ queryKey: ['keeperhub-evidence', trust.trustId] });
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['keeperhub-evidence', trust.trustId] });
      }, 2500);
    } catch (error) {
      setKeeperHubTriggerState('error');
      setKeeperHubTriggerError(
        error instanceof Error ? error.message : 'KeeperHub trigger failed',
      );
    }
  }

  async function refundTrust() {
    if (!trust || !publicClient) {
      return;
    }

    setErrorMessage(null);
    setAttestationHash(null);
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
  const sponsorEvidence = buildSponsorEvidence({
    trust,
    template,
    attestationUid: createdAttestationUid ?? attestationUid,
    connectedIssuer: issuerAllowed ? address : undefined,
    keeperExecution:
      keeperHubQuery.data?.configured === true
        ? keeperHubQuery.data.keeperExecution
        : undefined,
  });

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

      <SponsorEvidencePanel evidence={sponsorEvidence} />

      <section className="sponsor-panel" aria-label="Issue attestation">
        <div className="section-heading">
          <div>
            <span className="data-label">Issuer</span>
            <h2>{isTerminal ? 'Attestation closed' : 'Issue attestation'}</h2>
          </div>
          {createdAttestationUid ? <strong>{shortHash(createdAttestationUid)}</strong> : null}
        </div>

        {!isTerminal && issuerAllowed ? (
          <>
            <div className="trust-summary">
              <div>
                <span className="data-label">Recipient</span>
                <strong title={trust.beneficiary}>{shortenAddress(trust.beneficiary)}</strong>
              </div>
              <div>
                <span className="data-label">Schema UID</span>
                <strong title={schemaUid}>{schemaUid ? shortHash(schemaUid) : '-'}</strong>
              </div>
              <div>
                <span className="data-label">Expiration</span>
                <strong>
                  {attestationExpirationSeconds === BigInt(0)
                    ? 'None'
                    : formatTimestamp(attestationExpirationSeconds.toString())}
                </strong>
              </div>
              <div>
                <span className="data-label">Issuer permission</span>
                <strong>Allowed</strong>
              </div>
            </div>

            <div className="form-grid input-panel">
              {schemaFields.map((field) => (
                <label key={`${field.type}-${field.name}`}>
                  {field.name}
                  {field.type === 'bool' ? (
                    <select
                      value={attestationFieldValues[field.name] ?? defaultFieldValue(field)}
                      onChange={(event) => {
                        setAttestationFieldValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }));
                        setStep('idle');
                        setActiveAction(null);
                        setAttestationHash(null);
                        setCreatedAttestationUid(null);
                        setErrorMessage(null);
                      }}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      autoComplete="off"
                      inputMode={field.type.startsWith('uint') ? 'numeric' : 'text'}
                      placeholder={field.type}
                      value={attestationFieldValues[field.name] ?? defaultFieldValue(field)}
                      onChange={(event) => {
                        setAttestationFieldValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }));
                        setStep('idle');
                        setActiveAction(null);
                        setAttestationHash(null);
                        setCreatedAttestationUid(null);
                        setErrorMessage(null);
                      }}
                    />
                  )}
                </label>
              ))}
            </div>

            <button className="primary-action" disabled={!canAttest} onClick={issueAttestation}>
              {needsNetworkSwitch ? 'Switch and attest' : 'Issue attestation'}
            </button>
          </>
        ) : isTerminal ? (
          <p className="form-note">Status: {statusLabels[trust.status]}</p>
        ) : (
          <p className="form-note">Connect an allowlisted issuer wallet to issue an attestation.</p>
        )}

        {!isConnected ? <p className="form-note">Connect a wallet to view issuer actions.</p> : null}
        {isConnected && issuerReads.isFetched && !issuerAllowed && !isTerminal ? (
          <p className="form-note">Connected wallet is not allowlisted for this template.</p>
        ) : null}
        {schemaReads.isLoading ? <p className="form-note">Reading EAS schema fields.</p> : null}
        {schemaReads.error instanceof Error ? (
          <p className="data-error">{schemaReads.error.message}</p>
        ) : null}
        {issuerReads.error instanceof Error ? (
          <p className="data-error">{issuerReads.error.message}</p>
        ) : null}
        {attestationHash ? (
          <a className="tx-link" href={txLink(attestationHash)} target="_blank" rel="noreferrer">
            Attestation tx {shortHash(attestationHash)}
          </a>
        ) : null}
        {createdAttestationUid ? (
          <p className="form-note">Attestation UID copied into the release form.</p>
        ) : null}
        {activeAction === 'attest' && step !== 'idle' ? (
          <p className="form-note">Status: {step}</p>
        ) : null}
        {activeAction === 'attest' && errorMessage ? (
          <p className="data-error">{errorMessage}</p>
        ) : null}
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
                    setKeeperHubRunId(null);
                    setKeeperHubTriggerError(null);
                    setKeeperHubTriggerState('idle');
                  }}
                />
              </label>
            </div>

            <div className="action-row">
              <button className="primary-action" disabled={!canRelease} onClick={verifyAndRelease}>
                {needsNetworkSwitch ? 'Switch and release' : 'Verify and release'}
              </button>
              <button
                className="secondary-action"
                disabled={!canTriggerKeeperHub}
                onClick={triggerKeeperHubWorkflow}
              >
                {keeperHubTriggerState === 'triggering'
                  ? 'Triggering KeeperHub'
                  : 'Run KeeperHub release'}
              </button>
            </div>
          </>
        ) : !isTerminal ? (
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
                    setKeeperHubRunId(null);
                    setKeeperHubTriggerError(null);
                    setKeeperHubTriggerState('idle');
                  }}
                />
              </label>
            </div>

            <button
              className="secondary-action"
              disabled={!canTriggerKeeperHub}
              onClick={triggerKeeperHubWorkflow}
            >
              {keeperHubTriggerState === 'triggering'
                ? 'Triggering KeeperHub'
                : 'Run KeeperHub release'}
            </button>
          </>
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
        {keeperHubTriggerState === 'submitted' ? (
          <p className="form-note">KeeperHub submitted: {keeperHubRunId}.</p>
        ) : null}
        {keeperHubTriggerState === 'error' && keeperHubTriggerError ? (
          <p className="data-error">{keeperHubTriggerError}</p>
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
