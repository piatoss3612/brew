# KeeperHub Feedback

## Code node external fetch is SSRF-blocked, even for sponsor/runtime endpoints

### Context

Brew uses KeeperHub as the workflow orchestration layer for an agentic release
flow:

```text
Webhook
  -> ReadTrust: read BrewEscrow trust state
  -> Code: prepare the agent review request
  -> HTTP Request: request a signed review receipt
  -> Write Contract: verifyAndRelease(...)
```

Initially, the Code node attempted to call the 0G Compute proxy endpoint:

```text
https://compute-network-6.integratenetwork.work/v1/proxy/chat/completions
```

After moving 0G Compute behind a Railway receipt service, the Code node also
attempted to call:

```text
https://receipt-service-production-189c.up.railway.app/review-receipt
```

### Observed behavior

The KeeperHub Code node cannot fetch these external endpoints. 0G Compute failed
with this shape:

```json
{
  "error": "sandbox fetch: SSRF blocked (compute-network-6.integratenetwork.work -> 64:ff9b::d912:3417)"
}
```

The Railway receipt-service endpoint failed similarly:

```text
Code execution failed: sandbox fetch: SSRF blocked (receipt-service-production-189c.up.railway.app -> 64:ff9b::9765:20f)
```

The important point is that this is specific to external `fetch` inside the Code
node. KeeperHub has a separate HTTP Request node, so the workable composition is
to use Code only to prepare the request body and use the HTTP Request node for
the outbound call.

### Why this is a problem

This makes the Code-node mental model easy to misunderstand:

```text
KeeperHub orchestrates the workflow
  -> Code node prepares data
  -> HTTP Request node calls an AI/agent service
  -> result is used by later workflow nodes
```

For Brew specifically, KeeperHub is the workflow layer and 0G is the agent
execution / inference layer. If Code node `fetch` is blocked, the product should
make it very clear that external calls belong in the HTTP Request node.

### Intermediate workaround

Brew moved the external call out of the Code node:

```text
KeeperHub Code node
  -> returns receiptServiceRequest
KeeperHub HTTP Request node
  -> calls Brew receipt-service on Railway
  -> receipt-service calls 0G Compute
  -> receipt-service uploads the review bundle to 0G Storage
  -> receipt-service returns a signed ReviewReceipt
```

This is the intended safe path, but it also exposed a second UX issue below.
Brew's current implementation uses receipt-service as the review/receipt
orchestrator and then calls a KeeperHub workflow webhook. The KeeperHub workflow
performs the `verifyAndRelease(...)` web3 action.

### Requested improvement

KeeperHub should make the boundary between Code node execution and HTTP Request
node execution explicit.

Possible options:

- If Code node `fetch` is intentionally restricted, document that external HTTP
  must use the HTTP Request node.
- In the Code node editor, warn when code contains `fetch(...)` that outbound
  requests may be SSRF-blocked.
- Offer a "Send this object to HTTP Request node" affordance or example.
- Provide sponsor-specific HTTP Request presets for hackathon integrations such
  as 0G Compute.
- If project-level outbound allowlisting is supported later, surface it directly
  in the Code node error.

The goal is not to disable SSRF protection. The goal is to make the intended
safe path obvious: Code node prepares data; HTTP Request node performs external
network I/O.

### Impact

This affects workflows that need to:

- Call an AI inference endpoint from a KeeperHub workflow.
- Combine KeeperHub orchestration with sponsor-provided agent runtimes.
- Keep the agent decision step visible in the KeeperHub execution graph.
- Avoid losing time trying to debug Code node `fetch` when the correct node is
  HTTP Request.

For Brew, this matters because the intended demo is:

```text
KeeperHub workflow
  -> 0G review swarm
  -> 0G Storage receipt
  -> onchain verifier release
```

The current SSRF block forces the `0G review swarm` and `0G Storage receipt`
parts out of the Code node. Brew now keeps those parts in receipt-service and
uses a KeeperHub workflow webhook as the handoff into the onchain execution
layer.

## HTTP Request node can silently default to GET while carrying a body

### Context

After the Code node prepared a request object for receipt-service, Brew wired a
KeeperHub HTTP Request node with this input shape:

```json
{
  "endpoint": "https://receipt-service-production-189c.up.railway.app/review-receipt",
  "httpBody": "{ ... }",
  "httpHeaders": "{ \"content-type\": \"application/json\", \"authorization\": \"Bearer ...\" }",
  "actionType": "HTTP Request",
  "_actionType": "HTTP Request"
}
```

The HTTP Request implementation expects a separate `httpMethod` field:

```ts
fetch(input.endpoint, {
  method: input.httpMethod,
  headers,
  body,
});
```

### Observed behavior

Because `httpMethod` was missing from the node input, `fetch` received
`method: undefined`. Runtime fetch then behaved as `GET` while a request body
was still present, causing:

```text
HTTP request failed: Request with GET/HEAD method cannot have body.
```

This was confusing because the KeeperHub UI was configured as a POST-style HTTP
Request node, and the receipt-service logs showed a separate successful `POST`
from a different fallback path. The run output did not make it clear that the
failing HTTP node payload lacked `httpMethod`.

### Requested improvement

- Make the HTTP method an explicit required field in the run payload shown to
  the user.
- If the UI action type is "HTTP Request" and body is non-empty, default to
  `POST` rather than allowing `method: undefined`.
- Validate before execution: `GET/HEAD + body` should fail with a configuration
  error that names the missing or incompatible method field.
- Show the actual method, endpoint, headers redaction state, and body-present
  flag in the node debug panel.

### Impact

For agent workflows, this creates a high-friction failure mode at exactly the
handoff between "Code prepares agent request" and "HTTP Request calls agent
service." Brew moved the primary demo away from this node composition and uses:

```text
Web trigger
  -> receipt-service: 0G Compute + 0G Storage + signed receipt
  -> KeeperHub workflow webhook
  -> KeeperHub web3 action: verifyAndRelease(...)
```

## Read Contract output for tuple/struct return values

### Context

Brew uses KeeperHub to run an onchain release workflow on Sepolia.

The workflow reads `BrewEscrow.trusts(uint256)` before calling
`AttestationVerifier.verifyAndRelease(uint256,address,bytes32)`.

Contract:

```text
0xED5160554F93138c7f537bC1C99BFa475c97E622
```

Function:

```solidity
function trusts(uint256 trustId) external view returns (Trust memory)
```

Struct:

```solidity
struct Trust {
    address sponsor;
    address beneficiary;
    address token;
    uint256 amount;
    uint64 deadline;
    bytes32 templateId;
    bool released;
    bool refunded;
}
```

### Observed behavior with auto-fetched ABI

When KeeperHub auto-fetches the verified ABI, the `trusts` output is represented
as a single unnamed tuple:

```json
{
  "inputs": [
    { "internalType": "uint256", "name": "trustId", "type": "uint256" }
  ],
  "name": "trusts",
  "outputs": [
    {
      "components": [
        { "internalType": "address", "name": "sponsor", "type": "address" },
        { "internalType": "address", "name": "beneficiary", "type": "address" },
        { "internalType": "address", "name": "token", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "internalType": "uint64", "name": "deadline", "type": "uint64" },
        { "internalType": "bytes32", "name": "templateId", "type": "bytes32" },
        { "internalType": "bool", "name": "released", "type": "bool" },
        { "internalType": "bool", "name": "refunded", "type": "bool" }
      ],
      "internalType": "struct IBrewEscrow.Trust",
      "name": "",
      "type": "tuple"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
```

The KeeperHub Read Contract result was returned as a single value instead of the
decoded struct object:

```json
{
  "result": "0x965B0E63e00E7805569ee3B428Cf96330DFc57EF",
  "success": true,
  "addressLink": "https://sepolia.etherscan.io/address/0xed5160554f93138c7f537bc1c99bfa475c97e622"
}
```

This makes it difficult to reference fields in downstream nodes, for example:

```text
{{ReadTrust.result.beneficiary}}
{{ReadTrust.result.released}}
{{ReadTrust.result.refunded}}
```

### Workaround with a custom ABI

If the same function is configured with a custom ABI that flattens the tuple
return into named outputs, KeeperHub returns the expected object shape:

```json
{
  "result": {
    "token": "********7238",
    "amount": "10000000",
    "sponsor": "0x965B0E63e00E7805569ee3B428Cf96330DFc57EF",
    "deadline": "0",
    "refunded": false,
    "released": false,
    "templateId": "0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251",
    "beneficiary": "0x64dF96071ED800100E85B567add2B2e5190b0F0b"
  },
  "success": true,
  "addressLink": "https://sepolia.etherscan.io/address/0xed5160554f93138c7f537bc1c99bfa475c97e622"
}
```

This confirms that the underlying contract call succeeds and that KeeperHub can
represent the return data correctly when the output fields are explicit.

### Requested improvement

KeeperHub should explicitly decode single unnamed tuple outputs using the
tuple's component names.

Expected output for the auto-fetched ABI:

```json
{
  "success": true,
  "result": {
    "sponsor": "0x965B0E63e00E7805569ee3B428Cf96330DFc57EF",
    "beneficiary": "0x64dF96071ED800100E85B567add2B2e5190b0F0b",
    "token": "0x...",
    "amount": "10000000",
    "deadline": "0",
    "templateId": "0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251",
    "released": false,
    "refunded": false
  }
}
```

This would let downstream workflow nodes reference struct fields directly:

```text
{{ReadTrust.result.beneficiary}}
{{ReadTrust.result.released}}
{{ReadTrust.result.refunded}}
```

### Additional redaction issue

In the custom ABI workaround, the `token` field was redacted:

```json
"token": "********7238"
```

This appears to be a generic sensitive-key redaction rule treating any field
named `token` as a secret. In this case, `token` is an ERC-20 contract address,
not an API token or credential. I had to rename `token` to `erc20Token` in the custom ABI, and it worked correctly after that.

Suggested improvement:

- Avoid redacting ABI-decoded contract output fields solely because the field is
  named `token`.
- If redaction is necessary, consider redacting only known credential fields such
  as `accessToken`, `apiToken`, `authToken`, `secret`, or `password`.
- Alternatively, provide a way to disable redaction for onchain decoded outputs.

### Impact

This affects workflows that need to:

- Read a Solidity struct from a contract.
- Branch on individual struct fields in a Condition node.
- Pass struct fields into later Write Contract nodes.
- Display accurate run output for onchain state.

For Brew, this matters because the intended workflow is:

```text
Webhook
  -> ReadTrust: BrewEscrow.trusts(trustId)
  -> Condition: released == false && refunded == false
  -> Write Contract: verifyAndRelease(trustId, beneficiary, attestationUid)
```

Without explicit struct decoding from the auto-fetched ABI, the workflow either
needs a custom ABI workaround or must skip the Read/Condition step and rely only
on contract-level reverts.
