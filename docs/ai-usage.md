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

AI tools were used lightly during early exploration and more actively during the
final implementation push starting on May 1, 2026. Assistance focused on:

- sponsor and competitor research;
- product framing and workflow design;
- Solidity, Next.js, receipt-service, and subgraph implementation support;
- UI direction, copy, and interaction refinements;
- debugging, test planning, and documentation drafts.

Human decisions and verification covered:

- final product scope and demo narrative;
- sponsor integration choices;
- deployed contract and service configuration;
- wallet operations, secret management, and live workflow setup;
- final review of generated code, docs, tests, and demo behavior.

## Disclosure Boundary

This disclosure is intentionally category-level. It does not list every generated
line or file edit, because the relevant hackathon signal is where AI materially
assisted the project and which parts were human-controlled and verified.
