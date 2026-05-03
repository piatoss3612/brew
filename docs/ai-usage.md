# AI Usage

This project uses AI in two separate ways: as part of the product workflow, and
as development assistance during the hackathon.

## Runtime AI

Brew uses AI agents in the release review path:

- **0G Compute** runs the Evidence, Policy, and Risk reviewers.
- The reviewers inspect the trust context, EAS attestation reference, and release
  state.
- Their outputs are aggregated into a review receipt.
- The receipt is stored on 0G Storage and signed before KeeperHub executes the
  onchain release.

The AI agents do not directly move funds. Smart contracts still validate the EAS
proof, receipt fields, coordinator signature, and release state.

## Development Assistance

We used OpenAI Codex as a pair-programming and review assistant during the
hackathon.

The initial Solidity interfaces and core contract structure were written
manually, then Codex helped review the design, improve implementation details,
add Foundry tests, and debug verifier configuration, receipt signatures, and
deployment scripts.

Codex also helped implement and iterate on the Next.js UI, including trust
creation, trust detail views, attestation issuance, KeeperHub release
triggering, local cache scoping, status displays, and demo polish. For
infrastructure, Codex helped with the receipt service, 0G Compute/Storage
integration, Railway/Vercel deployment setup, and environment documentation.

The team made the final architecture decisions, handled wallets, secrets,
deployments, and verified the live demo flow.

## Disclosure Boundary

This disclosure is intentionally category-level. It does not list every generated
line or file edit, because the relevant hackathon signal is where AI materially
assisted the project and which parts were human-controlled and verified.
