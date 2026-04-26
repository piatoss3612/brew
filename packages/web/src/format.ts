import { formatUnits } from 'viem';

export const statusLabels = {
  PENDING: 'Pending',
  RELEASED: 'Released',
  REFUNDED: 'Refunded',
} as const;

export function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export function readDecimals(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'bigint' && value >= BigInt(0) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  return null;
}

export function formatTrustAmount(
  amount: string,
  decimals: number | null,
  symbol: string,
  loading: boolean,
) {
  if (loading) return 'Loading';
  if (decimals === null) return `${amount} raw`;

  try {
    return `${formatUnits(BigInt(amount), decimals)} ${symbol}`;
  } catch {
    return `${amount} raw`;
  }
}

export function formatTimestamp(seconds: string | null) {
  if (!seconds) return '-';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '-';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value * 1000));
}

export function isSameAddress(left: string, right?: string) {
  return Boolean(right && left.toLowerCase() === right.toLowerCase());
}

export function getWalletTrustRole(sponsor: string, beneficiary: string, address?: string) {
  const roles = [];

  if (isSameAddress(sponsor, address)) roles.push('Sponsor');
  if (isSameAddress(beneficiary, address)) roles.push('Beneficiary');

  return roles.length ? roles.join(' + ') : 'Observer';
}

export function txLink(hash: string) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}
