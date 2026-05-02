# Demo Runbook

Use this as the short checklist for a recorded or live Brew demo.

## Preflight

- Web app is deployed and points to Base Sepolia.
- Railway receipt service health check is configured.
- KeeperHub workflow is enabled.
- The Graph subgraph is indexing the current contracts.
- Demo wallet has Base Sepolia ETH and demo token balance.
- Review coordinator address is allowlisted on `AttestationVerifier`.
- Evidence, Policy, and Risk Agentic IDs are set in receipt-service env.

Useful endpoints:

```text
Receipt service health:
https://receipt-service-production-189c.up.railway.app/health

Subgraph:
https://api.studio.thegraph.com/query/71401/brew/version/latest
```

## Primary Demo Path

1. Open the landing page.
2. Click `Launch app`.
3. Confirm Overview shows existing trusts and current status.
4. Go to `New trust`.
5. Select a template.
6. Enter beneficiary, token, amount, and deadline.
7. Approve token spend.
8. Create the trust.
9. Open the trust detail page.
10. Create or attach the EAS attestation.
11. Click `Run agent release`.
12. Wait for the 0G Release Council result.
13. Confirm KeeperHub execution completes the release.
14. Open the receipt JSON.
15. Open the 0G Storage artifact link.
16. Confirm the trust status is `Released`.

## What To Call Out

- Sponsor funds are locked before the review.
- EAS provides the external proof.
- 0G agents review the same trust context independently.
- 0G Storage keeps the review bundle inspectable.
- The receipt is signed and checked onchain.
- KeeperHub executes the final contract call.
- The AI agents do not directly move funds.

## Strongest Demo Sentence

```text
Brew lets AI agents recommend a release, but the money only moves after a
signed 0G receipt passes deterministic onchain checks and KeeperHub executes the
release workflow.
```

## If Something Lags

Subgraph indexing can lag. If a newly created trust or release does not appear
immediately, use the transaction link first, then refresh Overview or the trust
detail page.

0G Compute may rate-limit concurrent calls. If one council member returns a
429, retry the review after the active requests finish.

KeeperHub can fail if the workflow is disabled or the webhook secret is stale.
If that happens, show the receipt-service response first, then show the
KeeperHub execution/log panel.

0G Storage finality can be slower than the UI. If the artifact link is not
immediately available, use the displayed `receiptRoot` and retry the link after
a short wait.

## Fallback Demo Path

If the full release path is unavailable, still show the core proof chain:

```text
trust created
-> EAS attestation attached
-> 0G Release Council returns votes
-> 0G Storage receipt is created
-> EIP-712 receipt fields are visible
```

This proves the agent review and receipt layer even if KeeperHub or indexing is
temporarily unavailable.
