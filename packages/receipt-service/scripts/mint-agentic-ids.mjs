#!/usr/bin/env node
import { ethers } from 'ethers';

import { loadEnvFiles, readEnv } from '../src/config.mjs';
import { uploadJsonArtifactToZeroGStorage } from '../src/zero-g-storage.mjs';

const DEFAULT_AGENTIC_ID_CONTRACT = '0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F';
const DEFAULT_AGENTIC_ID_CHAIN = '0g-galileo';
const DEFAULT_AGENTIC_ID_CHAIN_ID = 16602;
const DEFAULT_ZERO_G_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const DEFAULT_STORAGE_INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';
const DEFAULT_STORAGE_URI_PREFIX = '0g://storage';

const AGENTIC_ID_ABI = [
  'function iMint(address to, tuple(string dataDescription, bytes32 dataHash)[] datas) payable returns (uint256)',
  'function mintFee() view returns (uint256)',
  'function setTokenURI(uint256 tokenId, string uri)',
  'function authorizeUsage(uint256 tokenId, address user)',
  'function isAuthorizedUser(uint256 tokenId, address user) view returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const METADATA_CREATED_AT = '2026-05-02T00:00:00.000Z';

const REVIEW_AGENTS = [
  {
    role: 'evidence',
    title: 'Brew Evidence Agent',
    capabilities: ['attestation-presence-check', 'trust-context-completeness'],
    systemPrompt:
      'Check whether the attestation UID, beneficiary, template ID, and trust fields are complete enough to hand off to the onchain verifier.',
  },
  {
    role: 'policy',
    title: 'Brew Policy Agent',
    capabilities: ['template-consistency-check', 'release-policy-review'],
    systemPrompt:
      'Check whether the trust template ID and release context are internally consistent before release.',
  },
  {
    role: 'risk',
    title: 'Brew Risk Agent',
    capabilities: ['terminal-state-check', 'beneficiary-mismatch-check', 'risk-veto'],
    systemPrompt:
      'Look for stale evidence, refunded or released state, beneficiary mismatch, or suspicious release conditions.',
  },
];

loadEnvFiles();

const dryRun = process.argv.includes('--dry-run');
const skipStorage = process.argv.includes('--skip-storage');
const config = readMintConfig();
const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
const wallet = new ethers.Wallet(config.privateKey, provider);
const contract = new ethers.Contract(config.contractAddress, AGENTIC_ID_ABI, wallet);
const envUpdates = [
  `BREW_AGENTIC_ID_CHAIN=${config.chain}`,
  `BREW_AGENTIC_ID_CONTRACT=${config.contractAddress}`,
  `BREW_AGENTIC_AUTHORIZED_EXECUTOR=${config.authorizedExecutor}`,
];

console.log(
  JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'live',
      metadataMode: skipStorage ? 'hash-only' : '0g-storage',
      chain: config.chain,
      chainId: config.chainId,
      contract: config.contractAddress,
      signer: wallet.address,
      authorizedExecutor: config.authorizedExecutor,
      roles: REVIEW_AGENTS.map((agent) => agent.role),
    },
    null,
    2,
  ),
);

for (const agent of REVIEW_AGENTS) {
  const metadata = buildAgentMetadata(agent, config);
  const metadataStorage = dryRun || skipStorage
    ? {
        rootHash: hashJson(metadata),
        uri: skipStorage ? undefined : `${config.storageUriPrefix}/${hashJson(metadata)}`,
        byteSize: Buffer.byteLength(JSON.stringify(metadata), 'utf8'),
        attempts: 0,
      }
    : await uploadJsonArtifactToZeroGStorage({
        artifact: metadata,
        privateKey: config.storagePrivateKey,
        rpcUrl: config.rpcUrl,
        indexerRpc: config.storageIndexerRpc,
        uriPrefix: config.storageUriPrefix,
        filePrefix: `brew-agentic-${agent.role}`,
        retries: config.storageRetries,
      });
  const datas = buildIntelligentData(agent, config, metadataStorage.rootHash);

  if (dryRun) {
    envUpdates.push(...envLines(agent.role, '<TOKEN_ID>', config, metadataStorage.rootHash));
    console.log(
      JSON.stringify(
        {
          role: agent.role,
          metadataUri: metadataStorage.uri ?? null,
          metadataHash: metadataStorage.rootHash,
          intelligentData: datas,
          skipped: 'dry-run',
        },
        null,
        2,
      ),
    );
    continue;
  }

  const mintFee = await contract.mintFee();
  const mintTx = await contract.iMint(wallet.address, datas, { value: mintFee });
  console.log(`${agent.role}: iMint ${mintTx.hash}`);
  const mintReceipt = await mintTx.wait();
  const tokenId = readMintedTokenId(mintReceipt, wallet.address);

  if (metadataStorage.uri) {
    const tokenUriTx = await contract.setTokenURI(tokenId, metadataStorage.uri);
    console.log(`${agent.role}: setTokenURI ${tokenUriTx.hash}`);
    await tokenUriTx.wait();
  }

  const alreadyAuthorized = await contract.isAuthorizedUser(tokenId, config.authorizedExecutor);
  if (!alreadyAuthorized) {
    const authorizeTx = await contract.authorizeUsage(tokenId, config.authorizedExecutor);
    console.log(`${agent.role}: authorizeUsage ${authorizeTx.hash}`);
    await authorizeTx.wait();
  }

  envUpdates.push(...envLines(agent.role, tokenId.toString(), config, metadataStorage.rootHash));
  console.log(
    JSON.stringify(
      {
        role: agent.role,
        tokenId: tokenId.toString(),
        agenticId: `${config.chain}:${config.contractAddress}/${tokenId.toString()}`,
        metadataUri: metadataStorage.uri ?? null,
        metadataHash: metadataStorage.rootHash,
      },
      null,
      2,
    ),
  );
}

console.log('\n# Add these to packages/receipt-service/.env and Railway:');
console.log(envUpdates.join('\n'));

function readMintConfig() {
  const privateKey =
    readEnv(process.env, 'BREW_AGENTIC_ID_PRIVATE_KEY') ??
    readEnv(process.env, 'BREW_0G_STORAGE_PRIVATE_KEY') ??
    readEnv(process.env, 'ZERO_G_PRIVATE_KEY');
  const contractAddress =
    readEnv(process.env, 'BREW_AGENTIC_ID_CONTRACT') ?? DEFAULT_AGENTIC_ID_CONTRACT;
  const rpcUrl =
    readEnv(process.env, 'BREW_AGENTIC_ID_RPC_URL') ??
    readEnv(process.env, 'BREW_0G_STORAGE_RPC_URL') ??
    DEFAULT_ZERO_G_RPC_URL;
  const chain = readEnv(process.env, 'BREW_AGENTIC_ID_CHAIN') ?? DEFAULT_AGENTIC_ID_CHAIN;
  const chainId = Number(readEnv(process.env, 'BREW_AGENTIC_ID_CHAIN_ID') ?? DEFAULT_AGENTIC_ID_CHAIN_ID);
  const authorizedExecutor =
    readEnv(process.env, 'BREW_AGENTIC_AUTHORIZED_EXECUTOR') ??
    readEnv(process.env, 'BREW_REVIEW_COORDINATOR_ADDRESS');
  const storagePrivateKey =
    readEnv(process.env, 'BREW_0G_STORAGE_PRIVATE_KEY') ??
    readEnv(process.env, 'ZERO_G_PRIVATE_KEY') ??
    privateKey;
  const storageIndexerRpc =
    readEnv(process.env, 'BREW_0G_STORAGE_INDEXER_RPC') ?? DEFAULT_STORAGE_INDEXER_RPC;
  const storageUriPrefix =
    readEnv(process.env, 'BREW_0G_STORAGE_URI_PREFIX') ?? DEFAULT_STORAGE_URI_PREFIX;
  const storageRetries = Number(readEnv(process.env, 'BREW_0G_STORAGE_RETRIES') ?? 2);
  const model = readEnv(process.env, 'OG_COMPUTE_MODEL') ?? 'qwen/qwen-2.5-7b-instruct';

  if (!privateKey) throw new Error('Missing BREW_AGENTIC_ID_PRIVATE_KEY or 0G private key fallback');
  if (!ethers.isAddress(contractAddress)) throw new Error('BREW_AGENTIC_ID_CONTRACT must be an address');
  if (!Number.isSafeInteger(chainId)) throw new Error('BREW_AGENTIC_ID_CHAIN_ID must be an integer');
  if (!authorizedExecutor || !ethers.isAddress(authorizedExecutor)) {
    throw new Error('Missing BREW_AGENTIC_AUTHORIZED_EXECUTOR or BREW_REVIEW_COORDINATOR_ADDRESS');
  }
  if (!storagePrivateKey) throw new Error('Missing 0G Storage private key for metadata upload');

  return {
    privateKey,
    contractAddress,
    rpcUrl,
    chain,
    chainId,
    authorizedExecutor,
    storagePrivateKey,
    storageIndexerRpc,
    storageUriPrefix,
    storageRetries,
    model,
  };
}

function buildAgentMetadata(agent, config) {
  return {
    kind: 'brew.agentic-id.metadata.v1',
    name: agent.title,
    role: agent.role,
    chain: config.chain,
    contract: config.contractAddress,
    model: config.model,
    capabilities: agent.capabilities,
    systemPrompt: agent.systemPrompt,
    swarm: {
      name: 'Brew Release Council',
      coordinationMode: 'parallel-independent-review',
      quorumRule: 'evidence approve + policy approve + risk pass',
    },
    authorizedExecutor: config.authorizedExecutor,
    createdAt: METADATA_CREATED_AT,
  };
}

function buildIntelligentData(agent, config, metadataRoot) {
  return [
    ['agent_name', agent.title],
    ['role', agent.role],
    ['model', config.model],
    ['capabilities', agent.capabilities.join(',')],
    ['system_prompt', agent.systemPrompt],
    ['metadata_root', metadataRoot],
    ['authorized_executor', config.authorizedExecutor],
  ].map(([dataDescription, value]) => ({
    dataDescription,
    dataHash: hashString(value),
  }));
}

function readMintedTokenId(receipt, owner) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (
        parsed?.name === 'Transfer' &&
        parsed.args.from.toLowerCase() === ZERO_ADDRESS &&
        parsed.args.to.toLowerCase() === owner.toLowerCase()
      ) {
        return parsed.args.tokenId;
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  throw new Error('Could not decode minted Agentic ID tokenId from Transfer event');
}

function envLines(role, tokenId, config, metadataHash) {
  const prefix = `BREW_${role.toUpperCase()}_AGENTIC`;
  return [
    `${prefix}_TOKEN_ID=${tokenId}`,
    `${prefix}_METADATA_HASH=${metadataHash}`,
    `${prefix}_ID=${config.chain}:${config.contractAddress}/${tokenId}`,
  ];
}

function hashString(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function hashJson(value) {
  return hashString(stableStringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
