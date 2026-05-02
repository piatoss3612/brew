import { baseSepolia } from 'viem/chains';

export const BREW_CHAIN = baseSepolia;
export const BREW_CHAIN_NAME = 'Base Sepolia';

export function txExplorerUrl(hash: string) {
  return `https://sepolia.basescan.org/tx/${hash}`;
}
