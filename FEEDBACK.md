# KeeperHub Feedback

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
