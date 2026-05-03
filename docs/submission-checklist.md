# Submission Checklist

Use this as the final review pass before submitting Brew to ETHGlobal Open
Agents.

## Required Submission Items

- Project name: Brew.
- Short description: conditional trust release with agent-reviewed evidence and
  deterministic onchain execution.
- Public GitHub repo with README, setup instructions, architecture, and deployed
  config.
- Demo video under 3 minutes.
- Live demo link.
- Contract deployment addresses:
  - `BrewEscrow`
  - `AttestationVerifier`
  - demo ERC-20 token
  - 0G Agentic ID contract
- Team member names and contact info.
- Protocol features and SDKs used.
- AI/development-assistance disclosure: `docs/ai-usage.md`.
- Demo boundaries and production path: `docs/limitations-and-roadmap.md`.

## 0G Track Evidence

- Explain that Brew targets **Best Autonomous Agents, Swarms & iNFT
  Innovations**, not the framework/tooling track.
- Show the three-agent Release Council:
  - Evidence reviewer
  - Policy reviewer
  - Risk reviewer
- Explain swarm coordination:
  - all agents receive the same trust context;
  - each agent performs an independent role-specific 0G Compute review;
  - the receipt service aggregates the votes with a deterministic quorum rule;
  - the full bundle is stored on 0G Storage.
- Include 0G Agentic ID explorer links for the three reviewer identities.
- Show a 0G Storage artifact link containing:
  - trust context;
  - agentic IDs;
  - per-agent votes;
  - aggregate verdict;
  - 0G Compute response metadata.

## KeeperHub Track Evidence

- Explain that KeeperHub is the final onchain execution layer, not just a
  notification step.
- Show the KeeperHub workflow:
  - webhook trigger;
  - trust read / release gating;
  - `verifyAndReleaseWithReceiptFields(...)` write contract step;
  - successful execution ID or run page.
- Explain that the receipt service performs long-running 0G review and storage,
  then hands a signed release payload to KeeperHub.
- Link `FEEDBACK.md` for the KeeperHub builder feedback bounty.
- Demo proof to capture:
  - KeeperHub workflow enabled;
  - completed KeeperHub execution;
  - final release transaction on Base Sepolia.

## ENS / Uniswap Boundary

- ENS is not part of the primary submission path unless functional agent
  identity/discovery is added before submission.
- Uniswap is not part of the primary submission path.
- Do not claim sponsor eligibility for integrations that are not functional in
  the demo.

## ETHGlobal Rules Check

- Work is tracked through version control.
- Pre-existing planning/scaffolding is separated from the submitted Brew
  implementation.
- AI-assisted development is disclosed at category level.
- Demo uses public testnet contracts and non-sensitive sample evidence.
- Demo open issuer mode may be enabled for judging convenience; explain that a
  production-style deployment would disable it and use issuer allowlists.
- Public IPFS uploads are demo-safe only; sensitive real-world evidence would
  require encryption or a privacy-preserving storage path.
- Current 0G review is a structured release review, not full forensic analysis
  of every uploaded attachment.

## Demo Must Show

- Sponsor creates a funded trust.
- Issuer attaches an EAS attestation.
- Optional evidence file is uploaded to IPFS and fills attestation fields.
- 0G Release Council returns per-agent votes.
- 0G Storage receipt artifact opens in the explorer.
- KeeperHub executes the release workflow.
- Trust status becomes `Released`.

## Final Pre-Submit Commands

```bash
cd packages/contracts
forge test
```

```bash
cd packages/web
yarn test:ipfs-evidence
yarn lint
yarn build
```
