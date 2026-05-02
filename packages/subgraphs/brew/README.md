# Brew Subgraph

The Graph subgraph for Brew's Base Sepolia contracts.

For the full system flow, see [../../../docs/workflow.md](../../../docs/workflow.md).

It indexes:

- trusts created by `BrewEscrow`;
- releases and refunds;
- verifier template registration;
- issuer and review coordinator allowlists;
- EAS verification events;
- accepted review receipts and their 0G Storage roots.

## Current Endpoint

```text
https://api.studio.thegraph.com/query/71401/brew/version/latest
```

## Local Commands

```bash
yarn install
yarn codegen
yarn build
yarn test
```

Deploy to The Graph Studio:

```bash
yarn deploy
```

The indexed contract addresses and start blocks live in `subgraph.yaml`.
