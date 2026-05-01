# Brew Web

Next.js app for the Brew demo on Ethereum Sepolia.

## KeeperHub Release Flow

KeeperHub is the release workflow boundary:

```text
UI trigger
-> KeeperHub webhook
-> ReadTrust
-> 0G Compute Evidence / Policy / Risk review swarm
-> receipt-service /review-receipt uploads ReviewReceipt artifact to 0G Storage
-> receipt-service signs EIP-712 ReviewReceipt over the storage root
-> UI receives reviewReceipt + coordinatorSignature
-> beneficiary calls verifyAndRelease
```

The coordinator private key stays in `packages/receipt-service`. Do not paste it into the KeeperHub Code node. The AI review is advisory; `AttestationVerifier` and `BrewEscrow` remain the release authority. `receiptRoot` is the 0G Storage root of the persisted review artifact.

## Setup

```bash
yarn install
cp .env.example .env.local
yarn dev
```

Generate the KeeperHub Code node snippet:

```bash
yarn print:keeperhub-0g-code
```

The generated Code node runs three 0G Compute review agents: `Evidence`, `Policy`, and `Risk`. It sends `agenticIds`, `votes`, and `aggregate` to `packages/receipt-service`, which stores a `BrewSwarmReviewBundle` on 0G Storage and signs the resulting root.

Inline configured secrets only for a controlled demo environment:

```bash
yarn print:keeperhub-0g-code --with-secret
```

Validate 0G Compute before wiring the KeeperHub workflow:

```bash
yarn killtest:0g-review --mode direct
yarn killtest:0g-review --mode sdk
```

Validate 0G Storage receipt persistence:

```bash
yarn test:0g-storage
yarn killtest:0g-storage-receipt --dry-run
yarn killtest:0g-storage-receipt \
  --trust-id 1 \
  --beneficiary 0x64dF96071ED800100E85B567add2B2e5190b0F0b \
  --template-id 0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251 \
  --attestation-uid 0x7db69265beea1b23038df24fc6fa3186dc60877fb21dae41fb9fd53a56666b6e

yarn killtest:0g-storage-retrieve \
  --root-hash 0x0c9ec63609f1594e2f7722ba0b71528c573d914868e5c59f401fd87f4beb9c82
```

## Required Environment

`KEEPERHUB_WEBHOOK_URL` and `KEEPERHUB_WEBHOOK_API_KEY` are used by `/api/keeperhub/trigger`.

`KEEPERHUB_API_KEY` and `KEEPERHUB_WORKFLOW_ID` are used by `/api/keeperhub/execution` to read execution status and logs.

`BREW_0G_STORAGE_PRIVATE_KEY` uploads review receipt artifacts to 0G Storage. If omitted, the app falls back to `ZERO_G_PRIVATE_KEY`.

`BREW_REVIEW_COORDINATOR_PRIVATE_KEY` should live in `packages/receipt-service` for the normal flow. The web env only needs it if you intentionally use the legacy Next API fallback. `BREW_REVIEW_COORDINATOR_ADDRESS` must be allowlisted in `AttestationVerifier`.

`BREW_REVIEW_RECEIPT_URL` should point to the public receipt service endpoint, usually:

```text
https://<receipt-service-origin>/review-receipt
```
