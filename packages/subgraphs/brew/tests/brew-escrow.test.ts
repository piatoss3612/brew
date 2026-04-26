import { afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { TrustCreated } from "../generated/BrewEscrow/BrewEscrow"
import { handleRefunded, handleReleased, handleTrustCreated } from "../src/brew-escrow"
import { createRefundedEvent, createReleasedEvent, createTrustCreatedEvent } from "./brew-escrow-utils"

const TRUST_ID = "1"

describe("BrewEscrow mappings", () => {
  afterEach(() => {
    clearStore()
  })

  test("creates a UI trust state from TrustCreated", () => {
    handleTrustCreated(newTrustCreatedEvent())

    assert.entityCount("Trust", 1)
    assert.fieldEquals("Trust", TRUST_ID, "status", "PENDING")
    assert.fieldEquals("Trust", TRUST_ID, "trustId", TRUST_ID)
    assert.fieldEquals("Trust", TRUST_ID, "sponsor", "0x0000000000000000000000000000000000000001")
    assert.fieldEquals("Trust", TRUST_ID, "beneficiary", "0x0000000000000000000000000000000000000002")
    assert.fieldEquals("Trust", TRUST_ID, "token", "0x0000000000000000000000000000000000000003")
    assert.fieldEquals("Trust", TRUST_ID, "amount", "1000")
    assert.fieldEquals("Trust", TRUST_ID, "deadline", "0")
  })

  test("updates trust status on release", () => {
    handleTrustCreated(newTrustCreatedEvent())
    handleReleased(
      createReleasedEvent(
        BigInt.fromI32(1),
        Address.fromString("0x0000000000000000000000000000000000000002"),
        BigInt.fromI32(1000),
      ),
    )

    assert.fieldEquals("Trust", TRUST_ID, "status", "RELEASED")
  })

  test("updates trust status on refund", () => {
    handleTrustCreated(newTrustCreatedEvent())
    handleRefunded(
      createRefundedEvent(
        BigInt.fromI32(1),
        Address.fromString("0x0000000000000000000000000000000000000001"),
        BigInt.fromI32(1000),
      ),
    )

    assert.fieldEquals("Trust", TRUST_ID, "status", "REFUNDED")
  })
})

function newTrustCreatedEvent(): TrustCreated {
  return createTrustCreatedEvent(
    BigInt.fromI32(1),
    Address.fromString("0x0000000000000000000000000000000000000001"),
    Address.fromString("0x0000000000000000000000000000000000000002"),
    Bytes.fromHexString("0xa9d8d2ecfc304dc01f929851a2d337e70f772b9e87c59ef8809f01f29209d251"),
    Address.fromString("0x0000000000000000000000000000000000000003"),
    BigInt.fromI32(1000),
    BigInt.zero(),
  )
}
