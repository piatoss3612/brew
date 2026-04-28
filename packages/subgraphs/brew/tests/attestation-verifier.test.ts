import { afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { TrustCreated } from "../generated/BrewEscrow/BrewEscrow"
import { handleTrustCreated } from "../src/brew-escrow"
import {
  handleIssuerAllowlisted,
  handleReviewCoordinatorAllowlisted,
  handleReviewReceiptAccepted,
  handleTemplateRegistered,
  handleVerified,
} from "../src/attestation-verifier"
import { createTrustCreatedEvent } from "./brew-escrow-utils"
import {
  createIssuerAllowlistedEvent,
  createReviewCoordinatorAllowlistedEvent,
  createReviewReceiptAcceptedEvent,
  createTemplateRegisteredEvent,
  createVerifiedEvent,
} from "./attestation-verifier-utils"

const TRUST_ID = "1"
const TEMPLATE_ID = "0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251"
const SCHEMA_UID = "0x6429c150638a057d5d4b034e6530c9f1b5f300fc96edc0461d25effd8bfda9d5"
const ATTESTATION_UID = "0x1111111111111111111111111111111111111111111111111111111111111111"
const RECEIPT_ROOT = "0x2222222222222222222222222222222222222222222222222222222222222222"
const RECEIPT_URI = "0g://receipt/brew/1"

describe("AttestationVerifier mappings", () => {
  afterEach(() => {
    clearStore()
  })

  test("stores template config", () => {
    handleTemplateRegistered(
      createTemplateRegisteredEvent(
        Bytes.fromHexString(TEMPLATE_ID),
        Bytes.fromHexString(SCHEMA_UID),
        BigInt.fromI32(604800),
        BigInt.fromI32(86400),
      ),
    )

    assert.entityCount("Template", 1)
    assert.fieldEquals("Template", TEMPLATE_ID, "schemaUid", SCHEMA_UID)
    assert.fieldEquals("Template", TEMPLATE_ID, "expiryWindowSeconds", "604800")
    assert.fieldEquals("Template", TEMPLATE_ID, "stalenessWindowSeconds", "86400")
  })

  test("stores issuer permission", () => {
    handleIssuerAllowlisted(
      createIssuerAllowlistedEvent(
        Bytes.fromHexString(TEMPLATE_ID),
        Address.fromString("0x0000000000000000000000000000000000000004"),
        true,
      ),
    )

    let id = TEMPLATE_ID + "-0x0000000000000000000000000000000000000004"
    assert.entityCount("IssuerPermission", 1)
    assert.fieldEquals("IssuerPermission", id, "allowed", "true")
  })

  test("stores review coordinator permission", () => {
    handleReviewCoordinatorAllowlisted(
      createReviewCoordinatorAllowlistedEvent(
        Address.fromString("0x0000000000000000000000000000000000000005"),
        true,
      ),
    )

    assert.entityCount("ReviewCoordinatorPermission", 1)
    assert.fieldEquals(
      "ReviewCoordinatorPermission",
      "0x0000000000000000000000000000000000000005",
      "allowed",
      "true",
    )
  })

  test("links verified attestation back to trust", () => {
    handleTrustCreated(newTrustCreatedEvent())
    handleVerified(
      createVerifiedEvent(
        BigInt.fromI32(1),
        Bytes.fromHexString(ATTESTATION_UID),
        Address.fromString("0x0000000000000000000000000000000000000002"),
      ),
    )

    assert.entityCount("Verification", 1)
    assert.fieldEquals("Trust", TRUST_ID, "attestationUid", ATTESTATION_UID)
  })

  test("links review receipt back to trust", () => {
    handleTrustCreated(newTrustCreatedEvent())
    handleReviewReceiptAccepted(
      createReviewReceiptAcceptedEvent(
        BigInt.fromI32(1),
        Bytes.fromHexString(ATTESTATION_UID),
        Address.fromString("0x0000000000000000000000000000000000000005"),
        Bytes.fromHexString(RECEIPT_ROOT),
        RECEIPT_URI,
      ),
    )

    assert.entityCount("ReviewReceipt", 1)
    assert.fieldEquals("Trust", TRUST_ID, "reviewReceiptRoot", RECEIPT_ROOT)
    assert.fieldEquals("Trust", TRUST_ID, "reviewReceiptUri", RECEIPT_URI)
    assert.fieldEquals(
      "Trust",
      TRUST_ID,
      "reviewCoordinator",
      "0x0000000000000000000000000000000000000005",
    )
  })
})

function newTrustCreatedEvent(): TrustCreated {
  return createTrustCreatedEvent(
    BigInt.fromI32(1),
    Address.fromString("0x0000000000000000000000000000000000000001"),
    Address.fromString("0x0000000000000000000000000000000000000002"),
    Bytes.fromHexString(TEMPLATE_ID),
    Address.fromString("0x0000000000000000000000000000000000000003"),
    BigInt.fromI32(1000),
    BigInt.zero(),
  )
}
