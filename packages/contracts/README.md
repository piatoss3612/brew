# Brew Contracts

Brew contracts enforce the release boundary for the demo. The 0G review council
can recommend release, but `AttestationVerifier` and `BrewEscrow` decide whether
funds can move.

For the full system flow, see [../../docs/workflow.md](../../docs/workflow.md).

## Build And Test

```sh
forge build
forge test
forge fmt
```

## Deploy Order

Run these commands from `packages/contracts`.

### 0. Prepare Local Env

```sh
cp .env.example .env
```

Load the env values:

```sh
source .env
```

Import the deployer key into Foundry's encrypted keystore once. The private key
is entered into Foundry's prompt and must not be stored in `.env`.

```sh
cast wallet import "$BREW_DEPLOYER_ACCOUNT" --interactive
cast wallet list
```

### 1. Core Contracts

Deploy `BrewEscrow`, deploy `AttestationVerifier`, and wire
`BrewEscrow.setVerifier(verifier)`.

```sh
forge script script/DeployBrewCore.s.sol:DeployBrewCore \
  --rpc-url base_sepolia \
  --account "$BREW_DEPLOYER_ACCOUNT" \
  --broadcast \
  --slow \
  --verify
```

Copy the printed values into `.env`:

- `BREW_ESCROW_ADDRESS`
- `BREW_VERIFIER_ADDRESS`

Reload `.env` after filling those addresses:

```sh
source .env
```

Base Sepolia deployment output:

```
BREW_ESCROW_ADDRESS=0xBB3e0B8f1F31e1dDac553A43F1fcEe305Cff38f2
BREW_VERIFIER_ADDRESS=0x0d0f391bFFd1611aC1Ae3675AdFAf47A72320062
```

### 2. EAS Schemas

Register or reuse Brew's four public-audit schemas on EAS.

```sh
forge script script/RegisterBrewSchemas.s.sol:RegisterBrewSchemas \
  --rpc-url base_sepolia \
  --account "$BREW_DEPLOYER_ACCOUNT" \
  --broadcast \
  --slow
```

The schema UIDs are deterministic, so the configure script derives them from
the registered Base Sepolia UIDs stored in `BrewConfig`.

result:

```
WORKPLACE_SCHEMA_UID=0x01a3629d02136181035c01693fc6fa5e868061456b8865f56ba9c51a4b36b5c1
DEGREE_SCHEMA_UID=0xd9d697d74ca8ad8f0ee967b724eccadee7695b8f9a12f0ddb580e6aa6bbb3325
DAO_GRANT_SCHEMA_UID=0x6429c150638a057d5d4b034e6530c9f1b5f300fc96edc0461d25effd8bfda9d5
FELLOWSHIP_SCHEMA_UID=0xcd32f560f8ee50bc49024b8d847d4dabb9bf3672d88c6a64207e83dfde4f6a6a
```

### 3. Verifier Templates And Issuers

Register verifier templates and allowlist the selected keystore signer as the
demo issuer for all templates.

```sh
forge script script/ConfigureBrewVerifier.s.sol:ConfigureBrewVerifier \
  --rpc-url base_sepolia \
  --account "$BREW_DEPLOYER_ACCOUNT" \
  --broadcast \
  --slow
```

For the hackathon demo, the deployer account can act as both verifier owner and
demo issuer. Later, the app can expose `setIssuerAllowed` if separate issuer
accounts are needed.

result:

```
registered template workplace_verified
allowlisted issuer for workplace_verified: 0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251
registered template degree_verified
allowlisted issuer for degree_verified: 0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
0x7bdcb7d5f0d23fd2c4dcdc925fd5f1c4b9eea38d2907d352ead1fdfc9441feeb
registered template dao_grant
allowlisted issuer for dao_grant: 0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
0xf67d547d8e713f410ce70bba56bc67d2b2371ece6803db184ec50e47a99b7d73
registered template fellowship_milestone
allowlisted issuer for fellowship_milestone: 0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
0x92bdb8ca14551d4f3d29e067f01c52ba083495f325dbd55b31c0b9d810688faa
BREW_CONFIG_SENDER=0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
DEMO_ISSUER_ADDRESS=0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
```

### 4. Review Coordinator

Allowlist the agent/coordinator address that signs Brew review receipts.

```sh
forge script script/ConfigureReviewCoordinator.s.sol:ConfigureReviewCoordinator \
  --rpc-url base_sepolia \
  --account "$BREW_DEPLOYER_ACCOUNT" \
  --broadcast \
  --slow
```

By default, the script uses `BREW_REVIEW_COORDINATOR_ADDRESS`.
If that env var is missing or empty, it falls back to the first loaded Foundry
keystore signer: `vm.getWallets()[0]`.

For the demo, this can be the deployer wallet. If the 0G agent or local agent
producer signs receipts with a separate key, set:

```sh
BREW_REVIEW_COORDINATOR_ADDRESS=0x...
```

The configured coordinator must match the `coordinator` field and EIP-712
signature used in `verifyAndReleaseWithReceiptFields`.

result:

```
BREW_VERIFIER_ADDRESS 0x0d0f391bFFd1611aC1Ae3675AdFAf47A72320062
BREW_REVIEW_COORDINATOR_ADDRESS 0x965B0E63e00E7805569ee3B428Cf96330DFc57EF
```

### 5. Demo Token (Optional)

Use this only when you want a local demo ERC-20 instead of a known Base Sepolia token.
Set `DEMO_TOKEN_RECIPIENT` before running it.

```sh
forge script script/DeployDemoUSDC.s.sol:DeployDemoUSDC \
  --rpc-url base_sepolia \
  --account "$BREW_DEPLOYER_ACCOUNT" \
  --broadcast \
  --slow \
  --verify
```

Copy the printed `DEMO_TOKEN_ADDRESS` into `.env`.

result:

```
DEMO_TOKEN_ADDRESS=0x63c972a697dFc788EadC61d9Bdd4BcfEb2abdf7C
```

### 6. Demo Token Happy Path Simulation

Do not pass `--broadcast`; this simulates the full flow on a Base Sepolia fork.

logs for the full process:

- mint demo token
- approve escrow
- create trust
- issue EAS attestation
- sign a review receipt with the configured coordinator
- verify the flat review receipt fields, verify the EAS attestation, and release

```sh
forge script script/SimulateBrewHappyPath.s.sol:SimulateBrewHappyPath \
  --rpc-url base_sepolia \
  --account "$BREW_DEPLOYER_ACCOUNT"
```

The simulation needs a coordinator private key only to produce the local
EIP-712 signature:

```sh
BREW_REVIEW_COORDINATOR_PRIVATE_KEY=0x...
```

This private key must resolve to the allowlisted
`BREW_REVIEW_COORDINATOR_ADDRESS`. For local fork simulation, using the same
keystore/deployer key is acceptable.

Expected final marker:

```
BREW_HAPPY_PATH_SIMULATED=true
```
