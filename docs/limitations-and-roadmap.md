# Limitations And Roadmap

Brew is a hackathon demo of an agent-reviewed release path, not a production
trust or compliance product. The current build is designed to prove the core
architecture:

```text
escrowed funds
-> external attestation
-> 0G agent review
-> 0G Storage receipt
-> signed receipt
-> KeeperHub execution
-> deterministic onchain release
```

## Current Demo Boundaries

### Evidence review is intentionally narrow

The current 0G Release Council reviews structured trust and attestation context:

- `trustId`;
- beneficiary;
- selected template;
- attestation UID;
- token, amount, deadline, release/refund state;
- Agentic ID references;
- receipt and storage metadata.

It does not yet perform deep forensic analysis of every uploaded evidence file.
For example, if an issuer uploads an IPFS file while creating an attestation,
the demo can include that file URI/hash in the attestation, but the review
council does not currently fetch every file, parse long documents, run OCR, or
extract fine-grained claims from arbitrary attachments.

This is a practical testnet boundary. The live 0G Compute calls are useful for
role-specific review and quorum demonstration, but the current demo should not
be presented as a full document-understanding or compliance-analysis engine.

### The issuer model is demo-friendly

For judging convenience, Brew can enable `demoOpenIssuerMode`. In that mode, any
connected wallet can issue a demo EAS attestation for a registered template.
This keeps schema, recipient, freshness, receipt, signature, and escrow checks
intact, but bypasses the production-style issuer allowlist.

In a real deployment, Brew should disable open issuer mode and rely on
recognized issuers:

- schools or credential platforms for education proofs;
- employers or payroll/work platforms for workplace proofs;
- grant programs, DAOs, or accelerators for milestone proofs;
- service providers or marketplaces for completion proofs.

The long-term product value depends on those issuers participating directly, or
on integrations that let trusted services issue attestations through a clear
authorization flow.

### Public testnet data is not private

The current demo uses public testnet contracts, public EAS attestations, public
IPFS uploads, and public 0G Storage receipt artifacts. It is appropriate for
demo-safe sample evidence, but not for sensitive real-world identity,
employment, financial, or education records.

A production path should add privacy controls before handling sensitive data:

- encrypted evidence uploads;
- selective-disclosure attestations;
- redacted review receipts;
- private issuer APIs or user-consented evidence fetches;
- stronger access control around receipt retrieval.

### Operational limits still exist

The demo path has real external dependencies:

- 0G Compute can rate-limit concurrent review calls;
- 0G Storage indexing/finality can lag before artifacts are retrievable;
- The Graph can lag behind recent Base Sepolia transactions;
- KeeperHub workflows must be enabled and correctly configured;
- the receipt service owns server-side secrets and must stay online.

These are acceptable for a hackathon proof, but production would need retries,
monitoring, idempotency, and clearer recovery states.

## Why The Current Shape Is Still Useful

Brew deliberately keeps AI out of direct fund custody. The agents review
evidence and create an inspectable receipt. KeeperHub submits the final
transaction. The contracts enforce EAS validity, template configuration,
beneficiary matching, receipt fields, coordinator signature, expiry, and escrow
state.

That separation is the important proof:

```text
AI can produce review evidence,
but deterministic systems still decide whether money moves.
```

## Next Product Steps

1. Add richer evidence ingestion.
   Fetch uploaded files, extract text/metadata, and pass a bounded evidence
   summary into the 0G agents.

2. Add issuer onboarding.
   Replace demo open issuer mode with service-specific issuer registration,
   issuer metadata, and permissioned EAS issuance.

3. Improve privacy.
   Move sensitive evidence away from public plaintext storage and make the
   review receipt redacted or selectively shareable.

4. Harden execution.
   Add retry/idempotency around 0G Compute, 0G Storage, KeeperHub, and indexing
   delays.

5. Expand templates.
   Move beyond the current demo templates into partner-specific workflows such
   as grant milestones, work completion, educational credentials, and service
   delivery proofs.

