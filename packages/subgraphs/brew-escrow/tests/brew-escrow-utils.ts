import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  OwnershipTransferred,
  Refunded,
  Released,
  TrustCreated,
  VerifierUpdated
} from "../generated/BrewEscrow/BrewEscrow"

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createRefundedEvent(
  trustId: BigInt,
  sponsor: Address,
  amount: BigInt
): Refunded {
  let refundedEvent = changetype<Refunded>(newMockEvent())

  refundedEvent.parameters = new Array()

  refundedEvent.parameters.push(
    new ethereum.EventParam(
      "trustId",
      ethereum.Value.fromUnsignedBigInt(trustId)
    )
  )
  refundedEvent.parameters.push(
    new ethereum.EventParam("sponsor", ethereum.Value.fromAddress(sponsor))
  )
  refundedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return refundedEvent
}

export function createReleasedEvent(
  trustId: BigInt,
  beneficiary: Address,
  amount: BigInt
): Released {
  let releasedEvent = changetype<Released>(newMockEvent())

  releasedEvent.parameters = new Array()

  releasedEvent.parameters.push(
    new ethereum.EventParam(
      "trustId",
      ethereum.Value.fromUnsignedBigInt(trustId)
    )
  )
  releasedEvent.parameters.push(
    new ethereum.EventParam(
      "beneficiary",
      ethereum.Value.fromAddress(beneficiary)
    )
  )
  releasedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return releasedEvent
}

export function createTrustCreatedEvent(
  trustId: BigInt,
  sponsor: Address,
  beneficiary: Address,
  templateId: Bytes,
  token: Address,
  amount: BigInt,
  deadline: BigInt
): TrustCreated {
  let trustCreatedEvent = changetype<TrustCreated>(newMockEvent())

  trustCreatedEvent.parameters = new Array()

  trustCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "trustId",
      ethereum.Value.fromUnsignedBigInt(trustId)
    )
  )
  trustCreatedEvent.parameters.push(
    new ethereum.EventParam("sponsor", ethereum.Value.fromAddress(sponsor))
  )
  trustCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "beneficiary",
      ethereum.Value.fromAddress(beneficiary)
    )
  )
  trustCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "templateId",
      ethereum.Value.fromFixedBytes(templateId)
    )
  )
  trustCreatedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  trustCreatedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )
  trustCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "deadline",
      ethereum.Value.fromUnsignedBigInt(deadline)
    )
  )

  return trustCreatedEvent
}

export function createVerifierUpdatedEvent(verifier: Address): VerifierUpdated {
  let verifierUpdatedEvent = changetype<VerifierUpdated>(newMockEvent())

  verifierUpdatedEvent.parameters = new Array()

  verifierUpdatedEvent.parameters.push(
    new ethereum.EventParam("verifier", ethereum.Value.fromAddress(verifier))
  )

  return verifierUpdatedEvent
}
