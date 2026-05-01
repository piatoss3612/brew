# Brew Web

Next.js app for the Brew demo on Ethereum Sepolia.

## Release Flow

The web app triggers the deployed receipt service. KeeperHub stays in the release path as the workflow that performs the web3 action:

```text
UI trigger
-> receipt-service /review-receipt
-> receipt-service runs 0G Compute Evidence / Policy / Risk review swarm
-> receipt-service uploads ReviewReceipt artifact to 0G Storage
-> receipt-service signs EIP-712 ReviewReceipt over the storage root
-> receipt-service calls KeeperHub workflow webhook with the signed receipt
-> KeeperHub workflow calls AttestationVerifier.verifyAndRelease
-> UI receives reviewReceipt, coordinatorSignature, and KeeperHub workflow result
```

The coordinator private key stays in `packages/receipt-service`. Do not put signer keys, 0G Compute secrets, 0G Storage keys, or KeeperHub webhook secrets in the browser. The AI review is advisory; `AttestationVerifier` and `BrewEscrow` remain the release authority. `receiptRoot` is the 0G Storage root of the persisted review artifact.

## Setup

```bash
yarn install
cp .env.example .env.local
yarn dev
```

Validate 0G Compute before enabling live release:

```bash
cd ../receipt-service
yarn killtest:review-receipt --run-review-swarm
```

Validate 0G Storage receipt persistence:

```bash
cd ../receipt-service
yarn killtest:review-receipt
```

## Required Environment

`BREW_REVIEW_RECEIPT_URL` and `BREW_REVIEW_RECEIPT_API_KEY` are used by `/api/keeperhub/trigger`.

`KEEPERHUB_API_KEY` and `KEEPERHUB_WORKFLOW_ID` are used by `/api/keeperhub/execution` to read execution status and logs.

`KEEPERHUB_WEBHOOK_URL` and `KEEPERHUB_WEBHOOK_API_KEY` belong in `packages/receipt-service`, not in Vercel.

`BREW_0G_STORAGE_PRIVATE_KEY`, `BREW_REVIEW_COORDINATOR_PRIVATE_KEY`, and `OG_COMPUTE_APP_SECRET` also belong in `packages/receipt-service`, not in Vercel.

`BREW_REVIEW_RECEIPT_URL` should point to the public receipt service endpoint, usually:

```text
https://<receipt-service-origin>/review-receipt
```
