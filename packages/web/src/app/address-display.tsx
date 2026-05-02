'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, isAddress, type Address } from 'viem';
import { mainnet } from 'viem/chains';

import { shortenAddress } from '../format';

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

type AddressDisplayProps = {
  address: string | null | undefined;
  className?: string;
  showLookupHint?: boolean;
};

export function AddressDisplay({
  address,
  className,
  showLookupHint = false,
}: AddressDisplayProps) {
  const normalizedAddress = address && isAddress(address) ? (address as Address) : undefined;
  const ensQuery = useQuery({
    queryKey: ['ens-name', normalizedAddress?.toLowerCase()],
    queryFn: async () => {
      if (!normalizedAddress) return null;
      return ensClient.getEnsName({ address: normalizedAddress });
    },
    enabled: Boolean(normalizedAddress),
    retry: false,
    staleTime: 60 * 60 * 1000,
  });

  if (!address) {
    return (
      <span className={['address-display', className].filter(Boolean).join(' ')}>
        <strong>-</strong>
      </span>
    );
  }

  const primary = ensQuery.data ?? shortenAddress(address);
  const secondary = ensQuery.data ? shortenAddress(address) : showLookupHint && ensQuery.isLoading ? 'ENS lookup' : null;

  return (
    <span className={['address-display', className].filter(Boolean).join(' ')} title={address}>
      <strong>{primary}</strong>
      {secondary ? <small>{secondary}</small> : null}
    </span>
  );
}
