# Brew Receipt Service

Standalone service for KeeperHub to request a storage-backed signed review receipt.

```bash
yarn install
cp .env.example .env.local
yarn start
```

Endpoints:

- `GET /health`: reports missing configuration.
- `POST /review-receipt`: uploads the review artifact to 0G Storage and returns `reviewReceipt` plus `coordinatorSignature`.
- `GET /storage/:rootHash`: retrieves a persisted receipt artifact from 0G Storage.

KeeperHub should call `POST /review-receipt` after the 0G Compute review node returns `ready_for_verifier`.

`POST /review-receipt` accepts the existing single-review payload, but the stored artifact is now a swarm bundle:

```json
{
  "trustId": "1",
  "beneficiary": "0x...",
  "attestationUid": "0x...",
  "templateId": "0x...",
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
    "releaseReady": true
  }
}
```

The contract-facing `ReviewReceipt` remains unchanged. Its `receiptRoot` points to the uploaded `BrewSwarmReviewBundle`.

## Railway Deployment

Deploy this package as a standalone Railway service. The service must expose a public HTTPS URL because KeeperHub calls `POST /review-receipt` from its workflow.

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
  BREW_VERIFIER_ADDRESS=0xe5b3217407cee7F5cDa16946A257bC362D785b56 \
  BREW_REVIEW_RECEIPT_CHAIN_ID=11155111 \
  BREW_REVIEW_RECEIPT_TTL_SECONDS=604800 \
  BREW_0G_STORAGE_RPC_URL=https://evmrpc-testnet.0g.ai \
  BREW_0G_STORAGE_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai \
  BREW_0G_STORAGE_URI_PREFIX=0g://storage \
  BREW_0G_STORAGE_RETRIES=2 \
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
```

Set the coordinator address after deriving it from the private key:

```bash
railway variable set \
  BREW_REVIEW_COORDINATOR_ADDRESS=0x... \
  --service receipt-service \
  --environment production \
  --skip-deploys
```

Do not put `BREW_REVIEW_COORDINATOR_PRIVATE_KEY` into the web app or KeeperHub Code node. KeeperHub should only know `BREW_REVIEW_RECEIPT_URL` and `BREW_REVIEW_RECEIPT_API_KEY`.

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
  "missing": []
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

### 5. Connect KeeperHub and Web

Set the web app and KeeperHub Code node to call:

```env
BREW_REVIEW_RECEIPT_URL=https://receipt-service-production-189c.up.railway.app/review-receipt
BREW_REVIEW_RECEIPT_API_KEY=<same API key>
```

Then regenerate the KeeperHub Code node from `packages/web`:

```bash
yarn print:keeperhub-0g-code
```

For a controlled demo environment where the KeeperHub Code node should inline placeholders/secrets:

```bash
yarn print:keeperhub-0g-code --with-secret
```

Local kill-test:

```bash
yarn killtest:review-receipt \
  --trust-id 1 \
  --beneficiary 0x64dF96071ED800100E85B567add2B2e5190b0F0b \
  --template-id 0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251 \
  --attestation-uid 0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e
```
