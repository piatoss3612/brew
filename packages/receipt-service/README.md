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

Local kill-test:

```bash
yarn killtest:review-receipt \
  --trust-id 1 \
  --beneficiary 0x64dF96071ED800100E85B567add2B2e5190b0F0b \
  --template-id 0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251 \
  --attestation-uid 0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e
```
