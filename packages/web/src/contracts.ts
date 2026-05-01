import { getAddress, isAddress, type Address } from 'viem';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const DEFAULT_BREW_ESCROW_ADDRESS =
  '0xBB3e0B8f1F31e1dDac553A43F1fcEe305Cff38f2' as Address;
const DEFAULT_BREW_VERIFIER_ADDRESS =
  '0x0d0f391bFFd1611aC1Ae3675AdFAf47A72320062' as Address;
const DEFAULT_BREW_TOKEN_ADDRESS =
  '0x63c972a697dFc788EadC61d9Bdd4BcfEb2abdf7C' as Address;

function publicAddress(value: string | undefined, fallback: Address = ZERO_ADDRESS) {
  return value && isAddress(value, { strict: false }) ? getAddress(value) : fallback;
}

export const BREW_ESCROW_ADDRESS = publicAddress(
  process.env.NEXT_PUBLIC_BREW_ESCROW_ADDRESS,
  DEFAULT_BREW_ESCROW_ADDRESS,
);

export const BREW_VERIFIER_ADDRESS = publicAddress(
  process.env.NEXT_PUBLIC_BREW_VERIFIER_ADDRESS,
  DEFAULT_BREW_VERIFIER_ADDRESS,
);

export const BREW_TOKEN_ADDRESS = publicAddress(
  process.env.NEXT_PUBLIC_BREW_TOKEN_ADDRESS,
  DEFAULT_BREW_TOKEN_ADDRESS,
);

export const EAS_ADDRESS =
  '0x4200000000000000000000000000000000000021' as Address;

export const EAS_SCHEMA_REGISTRY_ADDRESS =
  '0x4200000000000000000000000000000000000020' as Address;

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
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'trustId', type: 'uint256' }],
    outputs: [],
  },
] as const;

export const attestationVerifierAbi = [
  {
    type: 'function',
    name: 'isIssuerAllowed',
    stateMutability: 'view',
    inputs: [
      { name: 'templateId', type: 'bytes32' },
      { name: 'issuer', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'verifyAndReleaseWithReceiptFields',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'trustId', type: 'uint256' },
      { name: 'beneficiary', type: 'address' },
      { name: 'attestationUid', type: 'bytes32' },
      { name: 'receiptRoot', type: 'bytes32' },
      { name: 'receiptUri', type: 'string' },
      { name: 'coordinator', type: 'address' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'coordinatorSignature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export const easAbi = [
  {
    type: 'function',
    name: 'attest',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'Attested',
    inputs: [
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'attester', type: 'address', indexed: true },
      { name: 'uid', type: 'bytes32', indexed: false },
      { name: 'schemaUID', type: 'bytes32', indexed: true },
    ],
  },
] as const;
