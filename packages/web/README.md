# Brew Web

Next.js app for the Brew demo on Base Sepolia.

The web app is the user surface only. It never owns signer keys, 0G Compute
secrets, 0G Storage keys, or KeeperHub webhook secrets. It calls the deployed
receipt service, and the receipt service hands the signed release payload to
KeeperHub.

For the full system flow, see [../../docs/workflow.md](../../docs/workflow.md).
For the demo sequence, see
[../../docs/demo-runbook.md](../../docs/demo-runbook.md).

## Pages

- `/`: landing page.
- `/app`: overview and trust list.
- `/sponsor/new`: create a funded trust.
- `/trust/[trustId]`: attach attestation, run review/release, inspect receipt.

## Local Setup

```bash
yarn install
cp .env.example .env.local
yarn dev
```

## Build Checks

```bash
yarn lint
yarn build
```

## Environment

Required for normal demo use:

```env
NEXT_PUBLIC_BREW_ESCROW_ADDRESS=
NEXT_PUBLIC_BREW_VERIFIER_ADDRESS=
NEXT_PUBLIC_BREW_TOKEN_ADDRESS=
NEXT_PUBLIC_BREW_SUBGRAPH_URL=
BREW_REVIEW_RECEIPT_URL=
BREW_REVIEW_RECEIPT_API_KEY=
```

Optional KeeperHub execution log lookup:

```env
KEEPERHUB_WORKFLOW_ID=
KEEPERHUB_API_KEY=
KEEPERHUB_API_BASE_URL=
```

Keep these out of the web app:

```text
BREW_REVIEW_COORDINATOR_PRIVATE_KEY
BREW_0G_STORAGE_PRIVATE_KEY
ZERO_G_PRIVATE_KEY
OG_COMPUTE_APP_SECRET
KEEPERHUB_WEBHOOK_URL
KEEPERHUB_WEBHOOK_API_KEY
```
