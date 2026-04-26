import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Bytes, Address, BigInt } from "@graphprotocol/graph-ts"
import { IssuerAllowlisted } from "../generated/schema"
import { IssuerAllowlisted as IssuerAllowlistedEvent } from "../generated/AttestationVerifier/AttestationVerifier"
import { handleIssuerAllowlisted } from "../src/attestation-verifier"
import { createIssuerAllowlistedEvent } from "./attestation-verifier-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let templateId = Bytes.fromI32(1234567890)
    let issuer = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let allowed = "boolean Not implemented"
    let newIssuerAllowlistedEvent = createIssuerAllowlistedEvent(
      templateId,
      issuer,
      allowed
    )
    handleIssuerAllowlisted(newIssuerAllowlistedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("IssuerAllowlisted created and stored", () => {
    assert.entityCount("IssuerAllowlisted", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "IssuerAllowlisted",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "templateId",
      "1234567890"
    )
    assert.fieldEquals(
      "IssuerAllowlisted",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "issuer",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "IssuerAllowlisted",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "allowed",
      "boolean Not implemented"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})
