# Brew Receipt Service

Standalone service for the Brew release path.

For the full system flow, see [../../docs/workflow.md](../../docs/workflow.md).
For the live demo sequence, see
[../../docs/demo-runbook.md](../../docs/demo-runbook.md).

The service owns server-side secrets, runs the 0G review council, stores the
receipt artifact, signs the release receipt, and calls the KeeperHub workflow.
The web app should only call this service.

## Release Path

```text
Web UI
-> receipt-service /review-receipt
-> 0G Compute review swarm
-> 0G Storage receipt artifact
-> EIP-712 review receipt signature
-> KeeperHub workflow webhook
-> KeeperHub workflow web3 action: AttestationVerifier.verifyAndReleaseWithReceiptFields(...)
```

```bash
yarn install
cp .env.example .env.local
yarn start
```

Endpoints:

- `GET /health`: reports missing signing/storage config, optional 0G Compute review config, and optional KeeperHub webhook config.
- `POST /review-receipt`: optionally runs the 0G Compute review swarm, uploads the review artifact to 0G Storage, returns `reviewReceipt` plus `coordinatorSignature`, and when `executeRelease=true` posts the signed release payload to the KeeperHub workflow webhook.
- `GET /storage/:rootHash`: retrieves a persisted receipt artifact from 0G Storage.

0G Compute is called by this service, not by the KeeperHub Code node, because the KeeperHub sandbox can block direct external compute-network fetches. KeeperHub remains in the critical path as the workflow that receives the signed receipt and performs the web3 action.

The Brew swarm is a verifiable release council, not a P2P agent mesh. Evidence, Policy, and Risk agents receive the same trust context and run independent 0G Compute reviews in parallel. The coordinator applies a deterministic quorum rule:

```text
Evidence approve + Policy approve + Risk pass
```

Only a passing quorum can produce the signed `ReviewReceipt`. The AI agents do not move funds directly; `AttestationVerifier`, `BrewEscrow`, and the KeeperHub web3 action remain the release authority.

`POST /review-receipt` accepts precomputed votes, or it can run the live swarm when `runReviewSwarm` is `true`. If `agenticIds` are omitted from the request, the service uses `BREW_*_AGENTIC_*` environment variables. The stored artifact is a swarm bundle:

```json
{
  "trustId": "1",
  "beneficiary": "0x...",
  "attestationUid": "0x...",
  "templateId": "0x...",
  "runReviewSwarm": true,
  "agenticIds": [
    {
      "role": "evidence",
      "agenticId": "0g-galileo:0x.../1",
      "chain": "0g-galileo",
      "contract": "0x...",
      "tokenId": "1",
      "metadataHash": "0x...",
      "authorizedExecutor": "0x..."
    }
  ],
  "votes": [
    {
      "role": "evidence",
      "agenticId": "0g-galileo:0x.../1",
      "decision": "approve",
      "rationale": ["Attestation recipient matches the trust beneficiary."],
      "riskFlags": ["none"]
    }
  ],
  "aggregate": {
    "rule": "evidence approve + policy approve + risk no-veto",
    "verdict": "ReleaseRecommended",
    "releaseReady": true,
    "divergences": []
  },
  "swarm": {
    "name": "Brew Release Council",
    "coordinationMode": "parallel-independent-review",
    "quorumRule": "evidence approve + policy approve + risk no-veto",
    "sharedContextDigest": "0x...",
    "roles": ["evidence", "policy", "risk"],
    "rounds": [
      {
        "round": 1,
        "mode": "parallel-independent-review",
        "votes": [],
        "aggregate": {
          "verdict": "ReleaseRecommended",
          "releaseReady": true,
          "divergences": []
        }
      }
    ]
  }
}
```

The contract-facing `ReviewReceipt` remains unchanged. Its `receiptRoot` points to the uploaded `BrewSwarmReviewBundle`.
The service only returns a signed receipt when the aggregate review verdict is `ReleaseRecommended` and `releaseReady` is `true`.
If `executeRelease=true` but the KeeperHub webhook is not configured or rejects the request, the service still returns the signed receipt and includes `keeperHubExecutionError`.

## 0G Agentic ID

Brew treats Agentic ID as the identity layer for the three review agents: Evidence, Policy, and Risk. The minimal hackathon path is:

1. Use the 0G Agentic ID testnet contract to mint one token per agent.
2. Store each agent's system prompt/capability metadata on 0G Storage.
3. Put the metadata root and token id into Railway variables.
4. Authorize the receipt-service executor address with `authorizeUsage(tokenId, executor)`.
5. Let `/review-receipt` include those identities in every swarm vote and persisted receipt bundle.

This does not require ERC-7857 transfer/re-encryption in the demo path. Transfer/re-encryption is a later extension; the current proof is identity-bound review provenance.

The mint helper uses the 0G Agentic ID example ABI deployed on Galileo:

```text
contract: 0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F
chain id: 16602
mint: iMint(address to, IntelligentData[] datas)
authorization: authorizeUsage(uint256 tokenId, address user)
```

Dry-run the metadata and env output:

```bash
yarn mint:agentic-ids --dry-run
```

Mint the three review agents, upload their metadata to 0G Storage, set each token URI, and authorize the configured executor:

```bash
yarn mint:agentic-ids
```

If 0G Storage finality is slow during a live demo setup, mint the Agentic IDs first and keep the metadata as on-chain intelligent-data hashes:

```bash
yarn mint:agentic-ids --skip-storage
```

The script prints the `BREW_*_AGENTIC_*` values that must be copied into `packages/receipt-service/.env` and Railway.

Current Brew review council Agentic IDs on 0G Galileo:

| Role | Token ID | Agentic ID | Mint tx | Authorization tx |
| --- | ---: | --- | --- | --- |
| Evidence | 88 | `0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/88` | [0x9188...ae56](https://chainscan-galileo.0g.ai/tx/0x9188b7bb6657e061971a1d7084916e2bfb5ae0fd9fc3944e2bba2740f69aae56) | [0xb079...f605](https://chainscan-galileo.0g.ai/tx/0xb07985b5dd9f76bbcf1e1c7f34f3ef07e391fa50444c92a231a98b1ed8e7f605) |
| Policy | 89 | `0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/89` | [0x8601...6027](https://chainscan-galileo.0g.ai/tx/0x8601b649e626f35c049a222c2a4fc28b42ff12580ebf07ee173a515478466027) | [0x7625...e93](https://chainscan-galileo.0g.ai/tx/0x76251a674faf8f253acf9d154a13dadae590d89df044fbeb233449fbc02fae93) |
| Risk | 90 | `0g-galileo:0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F/90` | [0x9ea3...5c6f](https://chainscan-galileo.0g.ai/tx/0x9ea3257b1c64403b72d0a3bda53d28bf6c496da3caa148f09d2aa4df8ea15c6f) | [0x7be3...e54](https://chainscan-galileo.0g.ai/tx/0x7be3e5ab05952ca42a7338c012acf2363cc519e63a09fe8018ce57cfea06ae54) |

Agentic ID contract explorer:

```text
https://chainscan-galileo.0g.ai/address/0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F
```

## Railway Deployment

Deploy this package as a standalone Railway service. The service must expose a public HTTPS URL because the Next.js app calls `POST /review-receipt` and this service then calls the KeeperHub workflow webhook.

### 1. CLI setup

Authenticate and check the target project:

```bash
railway login
railway whoami
railway list --json
```

Link the Brew Railway project and production environment:

```bash
railway link \
  --project eefe5aab-8746-4e66-a3b6-161b6c5ea7d2 \
  --environment production
```

Create and link the receipt service if it does not already exist:

```bash
railway add --service receipt-service --json
railway status
```

The expected linked target is:

```text
Project: powerful-consideration
Environment: production
Service: receipt-service
```

Current generated Railway domain:

```text
https://receipt-service-production-189c.up.railway.app
```

If the domain needs to be regenerated:

```bash
railway domain --service receipt-service --json
```

### 2. Deployment shape

The service is deployed from `packages/receipt-service`, not from the Next.js app. `railway.json` in this package sets:

- builder: `RAILPACK`
- start command: `yarn start`
- healthcheck: `/health`
- restart policy: `ON_FAILURE`

Leave `PORT` unset in Railway. Railway injects `PORT` at runtime, and this service reads it automatically. Set only:

```env
HOST=0.0.0.0
```

For CLI deployment from the Brew repo root:

```bash
railway up packages/receipt-service \
  --path-as-root \
  --service receipt-service \
  --environment production
```

For CI deployment, use the same command with `--ci`:

```bash
railway up packages/receipt-service \
  --path-as-root \
  --service receipt-service \
  --environment production \
  --ci
```

### 3. Add Railway variables

Set these variables on the Railway service:

```bash
railway variable set \
  HOST=0.0.0.0 \
  BREW_VERIFIER_ADDRESS=0xe9aD090798B0CEDb2aaCA48d202f02071ccfb7e5 \
  BREW_REVIEW_RECEIPT_CHAIN_ID=84532 \
  BREW_REVIEW_RECEIPT_TTL_SECONDS=604800 \
  BREW_0G_STORAGE_RPC_URL=https://evmrpc-testnet.0g.ai \
  BREW_0G_STORAGE_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai \
  BREW_0G_STORAGE_URI_PREFIX=0g://storage \
  BREW_0G_STORAGE_RETRIES=2 \
  OG_COMPUTE_SERVICE_URL=https://compute-network-6.integratenetwork.work \
  OG_COMPUTE_MODEL=qwen/qwen-2.5-7b-instruct \
  OG_COMPUTE_TIMEOUT_MS=120000 \
  OG_COMPUTE_MAX_TOKENS=512 \
  KEEPERHUB_WEBHOOK_TIMEOUT_MS=60000 \
  BREW_AGENTIC_ID_CHAIN=0g-galileo \
  BREW_AGENTIC_ID_CONTRACT=0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F \
  --service receipt-service \
  --environment production \
  --skip-deploys
```

Set secrets through stdin so they do not appear in shell history:

```bash
railway variable set BREW_REVIEW_COORDINATOR_PRIVATE_KEY \
  --stdin \
  --service receipt-service \
  --environment production \
  --skip-deploys

railway variable set BREW_0G_STORAGE_PRIVATE_KEY \
  --stdin \
  --service receipt-service \
  --environment production \
  --skip-deploys

railway variable set BREW_REVIEW_RECEIPT_API_KEY \
  --stdin \
  --service receipt-service \
  --environment production \
  --skip-deploys

railway variable set OG_COMPUTE_APP_SECRET \
  --stdin \
  --service receipt-service \
  --environment production \
  --skip-deploys

railway variable set KEEPERHUB_WEBHOOK_URL \
  --stdin \
  --service receipt-service \
  --environment production \
  --skip-deploys

railway variable set KEEPERHUB_WEBHOOK_API_KEY \
  --stdin \
  --service receipt-service \
  --environment production \
  --skip-deploys
```

Set the coordinator address after deriving it from the private key:

```bash
railway variable set \
  BREW_REVIEW_COORDINATOR_ADDRESS=0x... \
  --service receipt-service \
  --environment production \
  --skip-deploys
```

Do not put `BREW_REVIEW_COORDINATOR_PRIVATE_KEY` into the web app or KeeperHub Code node. The web app should only know `BREW_REVIEW_RECEIPT_URL` and `BREW_REVIEW_RECEIPT_API_KEY`; the receipt-service owns the signer key, 0G Compute secret, 0G Storage key, and KeeperHub webhook secret.

Set Agentic ID variables after minting the three agent tokens:

```bash
railway variable set \
  BREW_AGENTIC_AUTHORIZED_EXECUTOR=0x... \
  BREW_EVIDENCE_AGENTIC_TOKEN_ID=1 \
  BREW_EVIDENCE_AGENTIC_METADATA_HASH=0x... \
  BREW_POLICY_AGENTIC_TOKEN_ID=2 \
  BREW_POLICY_AGENTIC_METADATA_HASH=0x... \
  BREW_RISK_AGENTIC_TOKEN_ID=3 \
  BREW_RISK_AGENTIC_METADATA_HASH=0x... \
  --service receipt-service \
  --environment production \
  --skip-deploys
```

### 4. Check the deployment

Health check:

```bash
curl https://receipt-service-production-189c.up.railway.app/health
```

Expected result:

```json
{
  "ok": true,
  "service": "brew-receipt-service",
  "configured": true,
  "missing": [],
  "reviewConfigured": true,
  "reviewMissing": [],
  "keeperHubWebhookConfigured": true,
  "keeperHubWebhookMissing": []
}
```

If `configured` is `false`, inspect only the missing keys:

```bash
curl https://receipt-service-production-189c.up.railway.app/health
```

Smoke test `POST /review-receipt` only after `/health` is configured:

```bash
curl -X POST https://receipt-service-production-189c.up.railway.app/review-receipt \
  -H "content-type: application/json" \
  -H "authorization: Bearer <BREW_REVIEW_RECEIPT_API_KEY>" \
  -d '{
    "trustId": "1",
    "beneficiary": "0x64dF96071ED800100E85B567add2B2e5190b0F0b",
    "templateId": "0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251",
    "attestationUid": "0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e",
    "source": "railway-smoke-test",
    "executeRelease": false,
    "votes": [],
    "aggregate": {
      "verdict": "ReleaseRecommended",
      "releaseReady": true
    }
  }'
```

The response must include:

```text
configured=true
reviewReceipt.receiptRoot
reviewReceipt.receiptUri
reviewReceipt.coordinator
coordinatorSignature
receiptStorage.rootHash
```

Retrieve the stored artifact:

```bash
curl -H "authorization: Bearer <BREW_REVIEW_RECEIPT_API_KEY>" \
  "https://receipt-service-production-189c.up.railway.app/storage/<receiptStorage.rootHash>"
```

### 5. Connect Web

Set the web app to call:

```env
BREW_REVIEW_RECEIPT_URL=https://receipt-service-production-189c.up.railway.app/review-receipt
BREW_REVIEW_RECEIPT_API_KEY=<same API key>
```

Configure the KeeperHub workflow webhook for the primary demo path. The web trigger asks receipt-service to run the review, store the receipt, sign it, and hand the signed payload to KeeperHub. KeeperHub performs the `verifyAndReleaseWithReceiptFields` web3 action inside the workflow.

KeeperHub should treat `ReadTrust` as the source of truth for every value that
already exists in escrow state. The webhook trigger only carries the values that
cannot be read from `BrewEscrow.trusts(trustId)`: the attestation UID, the signed
receipt fields, and the coordinator signature.

KeeperHub Trigger fields:

```text
trustId: {{Trigger.trustId}}
attestationUid: {{Trigger.attestationUid}}
receiptRoot: {{Trigger.receiptRoot}}
receiptUri: {{Trigger.receiptUri}}
coordinator: {{Trigger.coordinator}}
createdAt: {{Trigger.createdAt}}
expiresAt: {{Trigger.expiresAt}}
coordinatorSignature: {{Trigger.coordinatorSignature}}
```

KeeperHub ReadTrust node:

```text
contract: <BREW_ESCROW_ADDRESS>
function: trusts
trustId: {{Trigger.trustId}}
```

KeeperHub CanRelease code node:

```js
const trust = {{ReadTrust.result}};

return {
  canRelease: trust.released === false && trust.refunded === false,
  beneficiary: trust.beneficiary,
  templateId: trust.templateId,
  token: trust.token,
  amount: trust.amount,
  deadline: trust.deadline,
};
```

KeeperHub Write Contract node:

```text
contract: <BREW_VERIFIER_ADDRESS>
function: verifyAndReleaseWithReceiptFields
trustId: {{Trigger.trustId}}
beneficiary: {{ReadTrust.result.beneficiary}}
attestationUid: {{Trigger.attestationUid}}
receiptRoot: {{Trigger.receiptRoot}}
receiptUri: {{Trigger.receiptUri}}
coordinator: {{Trigger.coordinator}}
createdAt: {{Trigger.createdAt}}
expiresAt: {{Trigger.expiresAt}}
coordinatorSignature: {{Trigger.coordinatorSignature}}
```

Do not use the legacy tuple-shaped `verifyAndRelease` action in KeeperHub. The
flat function exists specifically because KeeperHub cannot reliably inject
`{{...}}` expressions into tuple fields.

Local kill-test:

```bash
yarn killtest:review-receipt \
  --trust-id 1 \
  --beneficiary 0x64dF96071ED800100E85B567add2B2e5190b0F0b \
  --template-id 0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251 \
  --attestation-uid 0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e
```

Live 0G Compute swarm kill-test:

```bash
yarn killtest:review-receipt \
  --url https://receipt-service-production-189c.up.railway.app/review-receipt \
  --trust-id 1 \
  --beneficiary 0x64dF96071ED800100E85B567add2B2e5190b0F0b \
  --template-id 0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251 \
  --attestation-uid 0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e \
  --run-review-swarm
```

Trigger the KeeperHub workflow webhook after the receipt is generated:

```bash
yarn killtest:review-receipt \
  --url https://receipt-service-production-189c.up.railway.app/review-receipt \
  --trust-id 1 \
  --beneficiary 0x64dF96071ED800100E85B567add2B2e5190b0F0b \
  --template-id 0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251 \
  --attestation-uid 0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e \
  --run-review-swarm \
  --execute-release
```
