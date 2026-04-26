import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
});

export function isEnsName(value: string) {
  const trimmed = value.trim();
  return trimmed.includes('.') && !trimmed.startsWith('0x');
}

export async function resolveEnsAddress(value: string): Promise<Address | null> {
  const normalized = normalize(value.trim());
  return ensClient.getEnsAddress({ name: normalized });
}
