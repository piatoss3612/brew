'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { isAddress, type Address, formatUnits, type Hex, parseUnits } from 'viem';
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
  BREW_TOKEN_ADDRESS,
  EAS_SCHEMA_REGISTRY_ADDRESS,
  brewEscrowAbi,
  erc20Abi,
  schemaRegistryAbi,
} from '../../../contracts';
import { isEnsName, resolveEnsAddress } from '../../../ens';
import { fetchBrewStatus, type BrewTemplate } from '../../../subgraph';

type StepState = 'idle' | 'switching' | 'approving' | 'creating' | 'confirmed' | 'error';

const ZERO = BigInt(0);
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const TEMPLATE_LABELS_BY_SCHEMA_UID: Record<string, string> = {
  '0x01a3629d02136181035c01693fc6fa5e868061456b8865f56ba9c51a4b36b5c1': 'Workplace',
  '0x6429c150638a057d5d4b034e6530c9f1b5f300fc96edc0461d25effd8bfda9d5': 'DAO grant',
  '0xcd32f560f8ee50bc49024b8d847d4dabb9bf3672d88c6a64207e83dfde4f6a6a': 'Fellowship',
  '0xd9d697d74ca8ad8f0ee967b724eccadee7695b8f9a12f0ddb580e6aa6bbb3325': 'Degree',
};

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

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M5.5 5.5h7v7h-7z" />
      <path d="M3.5 10.5v-7h7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3.25 8.25 6.5 11.5l6.25-7" />
    </svg>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  }

  return (
    <button
      aria-label={`Copy ${label}`}
      className="copy-button"
      title={copied ? 'Copied' : `Copy ${label}`}
      type="button"
      onClick={copyValue}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function CopyableValue({
  display,
  label,
  value,
}: {
  display: string;
  label: string;
  value: string;
}) {
  return (
    <span className="copyable-value">
      <strong title={value}>{display}</strong>
      <CopyButton label={label} value={value} />
    </span>
  );
}

function txLink(hash: string) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function isBytes32(value: string): value is Hex {
  return BYTES32_PATTERN.test(value);
}

function formatWindow(seconds: string) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const days = Math.round(value / 86_400);
  return `${days}d`;
}

function getTemplateLabel(template: BrewTemplate) {
  const label = TEMPLATE_LABELS_BY_SCHEMA_UID[template.schemaUid.toLowerCase()] ?? 'Template';
  return `${label} / ${shortHash(template.templateId)}`;
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

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readDecimals(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'bigint' && value >= ZERO && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  return null;
}

function formatTokenAmount(value: unknown, decimals: number | null, symbol: string) {
  if (typeof value !== 'bigint' || decimals === null) return '-';
  return `${formatUnits(value, decimals)} ${symbol}`;
}

function formatBalance(value: unknown, decimals: number | null, symbol: string, loading: boolean) {
  if (loading) return 'Loading';
  return formatTokenAmount(value, decimals, symbol);
}

export function SponsorNewForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const statusQuery = useQuery({
    queryKey: ['brew-status'],
    queryFn: fetchBrewStatus,
    refetchInterval: 12_000,
  });

  const [beneficiary, setBeneficiary] = useState('');
  const [tokenAddressInput, setTokenAddressInput] = useState<string>(BREW_TOKEN_ADDRESS);
  const [amount, setAmount] = useState('10');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [step, setStep] = useState<StepState>('idle');
  const [approveHash, setApproveHash] = useState<string | null>(null);
  const [createHash, setCreateHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tokenAddress = useMemo(() => {
    const trimmed = tokenAddressInput.trim();
    return isAddress(trimmed) ? (trimmed as Address) : null;
  }, [tokenAddressInput]);

  const beneficiaryInput = beneficiary.trim();
  const directBeneficiary = isAddress(beneficiaryInput) ? (beneficiaryInput as Address) : null;
  const shouldResolveEns = Boolean(beneficiaryInput && !directBeneficiary && isEnsName(beneficiaryInput));
  const ensQuery = useQuery({
    queryKey: ['ens-address', beneficiaryInput],
    queryFn: () => resolveEnsAddress(beneficiaryInput),
    enabled: shouldResolveEns,
    retry: false,
    staleTime: 600_000,
  });

  const resolvedBeneficiary = directBeneficiary ?? ensQuery.data ?? (!beneficiaryInput ? address : null);
  const beneficiaryInputInvalid = Boolean(
    beneficiaryInput && !directBeneficiary && !shouldResolveEns,
  );
  const beneficiaryEnsUnresolved = Boolean(
    shouldResolveEns && ensQuery.isFetched && !ensQuery.data,
  );
  const templates = statusQuery.data?.templates ?? [];
  const selectedTemplate =
    templates.find((template) => template.templateId === selectedTemplateId) ?? templates[0];
  const resolvedTemplateId = selectedTemplate?.templateId ?? '';
  const resolvedSchemaUid = selectedTemplate?.schemaUid ?? '';
  const templateReady = Boolean(resolvedTemplateId && isBytes32(resolvedTemplateId));
  const schemaUidReady = isBytes32(resolvedSchemaUid);

  const schemaReads = useReadContracts({
    contracts: schemaUidReady
      ? [
          {
            address: EAS_SCHEMA_REGISTRY_ADDRESS,
            abi: schemaRegistryAbi,
            functionName: 'getSchema',
            chainId: sepolia.id,
            args: [resolvedSchemaUid],
          },
        ]
      : [],
    query: {
      enabled: schemaUidReady,
    },
  });

  const schemaRecord = readSchemaRecord(schemaReads.data?.[0]?.result);
  const schemaFields = schemaRecord ? parseSchemaFields(schemaRecord.schema) : [];

  const metadataReads = useReadContracts({
    contracts: tokenAddress
      ? [
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'name',
            chainId: sepolia.id,
          },
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

  const tokenName = readString(metadataReads.data?.[0]?.result, 'ERC20 token');
  const tokenSymbol = readString(metadataReads.data?.[1]?.result, 'TOKEN');
  const tokenDecimals = readDecimals(metadataReads.data?.[2]?.result);
  const tokenMetadataReady = Boolean(tokenAddress && tokenDecimals !== null);
  const tokenMetadataFailed = Boolean(
    tokenAddress && metadataReads.isFetched && tokenDecimals === null,
  );

  const amountUnits = useMemo(() => {
    if (tokenDecimals === null) return ZERO;

    try {
      return parseUnits(amount || '0', tokenDecimals);
    } catch {
      return ZERO;
    }
  }, [amount, tokenDecimals]);

  const tokenReads = useReadContracts({
    contracts: address && tokenAddress
      ? [
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            chainId: sepolia.id,
            args: [address],
          },
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            chainId: sepolia.id,
            args: [address, BREW_ESCROW_ADDRESS],
          },
        ]
      : [],
    query: {
      enabled: Boolean(address && tokenAddress),
    },
  });

  const balance = tokenReads.data?.[0]?.result;
  const allowance = tokenReads.data?.[1]?.result;
  const balanceKnown = typeof balance === 'bigint';
  const tokenBalanceLoading = Boolean(isConnected && tokenAddress && tokenReads.isLoading);
  const hasEnoughAllowance =
    typeof allowance === 'bigint' && amountUnits > ZERO && allowance >= amountUnits;
  const hasEnoughBalance = balanceKnown && amountUnits > ZERO && balance >= amountUnits;
  const needsNetworkSwitch = isConnected && chainId !== sepolia.id;
  const canSubmit =
    isConnected &&
    Boolean(publicClient) &&
    Boolean(tokenAddress) &&
    tokenMetadataReady &&
    templateReady &&
    Boolean(resolvedBeneficiary) &&
    amountUnits > ZERO &&
    hasEnoughBalance &&
    step !== 'switching' &&
    step !== 'approving' &&
    step !== 'creating';

  function updateTokenAddress(value: string) {
    setTokenAddressInput(value);
    setStep('idle');
    setApproveHash(null);
    setCreateHash(null);
    setErrorMessage(null);
  }

  function updateTemplateId(value: string) {
    setSelectedTemplateId(value);
    setStep('idle');
    setApproveHash(null);
    setCreateHash(null);
    setErrorMessage(null);
  }

  async function submitTrust() {
    if (
      !address ||
      !publicClient ||
      !tokenAddress ||
      !resolvedBeneficiary ||
      !isBytes32(resolvedTemplateId)
    ) {
      return;
    }

    setErrorMessage(null);
    setApproveHash(null);
    setCreateHash(null);

    try {
      if (chainId !== sepolia.id) {
        setStep('switching');
        await switchChainAsync({ chainId: sepolia.id });
      }

      if (!hasEnoughAllowance) {
        setStep('approving');
        const nextApproveHash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          chainId: sepolia.id,
          args: [BREW_ESCROW_ADDRESS, amountUnits],
        });
        setApproveHash(nextApproveHash);
        await publicClient.waitForTransactionReceipt({ hash: nextApproveHash });
        await tokenReads.refetch();
      }

      setStep('creating');
      const nextCreateHash = await writeContractAsync({
        address: BREW_ESCROW_ADDRESS,
        abi: brewEscrowAbi,
        functionName: 'createTrust',
        chainId: sepolia.id,
        args: [
          resolvedBeneficiary,
          tokenAddress,
          amountUnits,
          BigInt(0),
          resolvedTemplateId,
        ],
      });
      setCreateHash(nextCreateHash);
      await publicClient.waitForTransactionReceipt({ hash: nextCreateHash });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['brew-status'] }),
        tokenReads.refetch(),
      ]);

      setStep('confirmed');
      router.push(`/?trustCreated=1&tx=${nextCreateHash}`);
    } catch (error) {
      setStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Transaction failed');
    }
  }

  return (
    <section className="sponsor-panel" aria-label="Create trust">
      <div className="form-grid input-panel">
        <label className="wide-field">
          Token
          <input
            autoComplete="off"
            placeholder={BREW_TOKEN_ADDRESS}
            value={tokenAddressInput}
            onChange={(event) => updateTokenAddress(event.target.value)}
          />
        </label>
        <label className="wide-field">
          Template
          <select
            disabled={!templates.length}
            value={resolvedTemplateId}
            onChange={(event) => updateTemplateId(event.target.value)}
          >
            {templates.length ? (
              templates.map((template) => (
                <option key={template.templateId} value={template.templateId}>
                  {getTemplateLabel(template)}
                </option>
              ))
            ) : (
              <option value="">No templates indexed</option>
            )}
          </select>
        </label>
        <label>
          Beneficiary
          <span className="beneficiary-field">
            <input
              autoComplete="off"
              placeholder={address ?? 'vitalik.eth or 0x...'}
              value={beneficiary}
              onChange={(event) => setBeneficiary(event.target.value)}
            />
            {shouldResolveEns && resolvedBeneficiary ? (
              <span className="beneficiary-suffix" title={resolvedBeneficiary}>
                {shortHash(resolvedBeneficiary)}
              </span>
            ) : null}
          </span>
        </label>
        <label>
          Amount
          <span className="amount-field">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <span className="amount-unit">{tokenSymbol}</span>
          </span>
        </label>
      </div>

      <div className="trust-summary">
        <div>
          <span className="data-label">Token</span>
          <strong>{tokenAddress ? tokenSymbol : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Metadata</span>
          <strong>{tokenMetadataReady ? `${tokenName} / ${tokenDecimals}` : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Template</span>
          {selectedTemplate ? (
            <CopyableValue
              display={getTemplateLabel(selectedTemplate)}
              label="template id"
              value={selectedTemplate.templateId}
            />
          ) : (
            <strong>-</strong>
          )}
        </div>
        <div>
          <span className="data-label">Schema UID</span>
          {selectedTemplate ? (
            <CopyableValue
              display={shortHash(selectedTemplate.schemaUid)}
              label="schema uid"
              value={selectedTemplate.schemaUid}
            />
          ) : (
            <strong>-</strong>
          )}
        </div>
        <div>
          <span className="data-label">Revocable</span>
          <strong>{schemaRecord ? (schemaRecord.revocable ? 'Yes' : 'No') : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Freshness</span>
          <strong>
            {selectedTemplate ? formatWindow(selectedTemplate.stalenessWindowSeconds) : '-'}
          </strong>
        </div>
        <div>
          <span className="data-label">Expiry</span>
          <strong>{selectedTemplate ? formatWindow(selectedTemplate.expiryWindowSeconds) : '-'}</strong>
        </div>
        <div>
          <span className="data-label">Balance</span>
          <strong>{formatBalance(balance, tokenDecimals, tokenSymbol, tokenBalanceLoading)}</strong>
        </div>
        <div>
          <span className="data-label">Allowance</span>
          <strong>
            {tokenReads.isLoading ? 'Loading' : hasEnoughAllowance ? 'Ready' : 'Approval needed'}
          </strong>
        </div>
        <div>
          <span className="data-label">Token address</span>
          {tokenAddress ? (
            <CopyableValue
              display={shortHash(tokenAddress)}
              label="token address"
              value={tokenAddress}
            />
          ) : (
            <strong>Invalid address</strong>
          )}
        </div>
        <div>
          <span className="data-label">Beneficiary</span>
          {resolvedBeneficiary ? (
            <CopyableValue
              display={shortHash(resolvedBeneficiary)}
              label="beneficiary address"
              value={resolvedBeneficiary}
            />
          ) : (
            <strong>{ensQuery.isLoading ? 'Resolving' : '-'}</strong>
          )}
        </div>
      </div>

      <div className="schema-fields" aria-label="Template field configuration">
        <div className="schema-fields-header">
          <span className="data-label">Schema fields</span>
          <strong>{schemaFields.length ? `${schemaFields.length} fields` : '-'}</strong>
        </div>
        {schemaFields.length ? (
          <div className="schema-field-list">
            {schemaFields.map((field) => (
              <div className="schema-field" key={`${field.type}-${field.name}`}>
                <span>{field.name}</span>
                <strong>{field.type}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="form-note">No schema fields loaded.</p>
        )}
      </div>

      <button className="primary-action" disabled={!canSubmit} onClick={submitTrust}>
        {needsNetworkSwitch
          ? 'Switch and create trust'
          : hasEnoughAllowance
            ? 'Create trust'
            : 'Approve and create trust'}
      </button>

      {!isConnected ? <p className="form-note">Connect a wallet to create a trust.</p> : null}
      {tokenAddressInput && !tokenAddress ? (
        <p className="form-note">Enter a valid ERC20 token address.</p>
      ) : null}
      {tokenAddress && metadataReads.isLoading ? (
        <p className="form-note">Reading ERC20 metadata on Sepolia.</p>
      ) : null}
      {tokenReads.error instanceof Error ? (
        <p className="data-error">{tokenReads.error.message}</p>
      ) : null}
      {statusQuery.isLoading ? <p className="form-note">Loading templates from the subgraph.</p> : null}
      {statusQuery.error instanceof Error ? (
        <p className="data-error">{statusQuery.error.message}</p>
      ) : null}
      {statusQuery.isFetched && !templates.length ? (
        <p className="form-note">No verifier templates are indexed yet.</p>
      ) : null}
      {selectedTemplate && schemaReads.isLoading ? (
        <p className="form-note">Reading EAS schema fields on Sepolia.</p>
      ) : null}
      {schemaReads.error instanceof Error ? (
        <p className="data-error">{schemaReads.error.message}</p>
      ) : null}
      {tokenMetadataFailed ? (
        <p className="form-note">Token decimals could not be read. This flow needs ERC20 metadata.</p>
      ) : null}
      {beneficiaryInputInvalid ? (
        <p className="form-note">Enter a beneficiary address or ENS name.</p>
      ) : null}
      {shouldResolveEns && ensQuery.isLoading ? (
        <p className="form-note">Resolving beneficiary ENS on mainnet.</p>
      ) : null}
      {beneficiaryEnsUnresolved ? (
        <p className="form-note">Beneficiary ENS name did not resolve to an address.</p>
      ) : null}
      {ensQuery.error instanceof Error ? (
        <p className="data-error">{ensQuery.error.message}</p>
      ) : null}
      {isConnected && balanceKnown && !tokenBalanceLoading && !hasEnoughBalance ? (
        <p className="form-note">Connected wallet does not have enough {tokenSymbol}.</p>
      ) : null}
      {step !== 'idle' ? <p className="form-note">Status: {step}</p> : null}
      {approveHash ? (
        <a className="tx-link" href={txLink(approveHash)} target="_blank" rel="noreferrer">
          Approval {shortHash(approveHash)}
        </a>
      ) : null}
      {createHash ? (
        <a className="tx-link" href={txLink(createHash)} target="_blank" rel="noreferrer">
          CreateTrust {shortHash(createHash)}
        </a>
      ) : null}
      {errorMessage ? <p className="data-error">{errorMessage}</p> : null}
    </section>
  );
}
