import type { Address } from 'viem';

export const BREW_ESCROW_ADDRESS =
  '0xED5160554F93138c7f537bC1C99BFa475c97E622' as Address;

export const BREW_TOKEN_ADDRESS =
  '0xee8f180727440e8068ec927ba181794a63b43741' as Address;

export const EAS_SCHEMA_REGISTRY_ADDRESS =
  '0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0' as Address;

export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

export const schemaRegistryAbi = [
  {
    type: 'function',
    name: 'getSchema',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'uid', type: 'bytes32' },
          { name: 'resolver', type: 'address' },
          { name: 'revocable', type: 'bool' },
          { name: 'schema', type: 'string' },
        ],
      },
    ],
  },
] as const;

export const brewEscrowAbi = [
  {
    type: 'function',
    name: 'createTrust',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'templateId', type: 'bytes32' },
    ],
    outputs: [{ name: 'trustId', type: 'uint256' }],
  },
] as const;
