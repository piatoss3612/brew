import { newMockEvent } from "matchstick-as"
import { ethereum, Bytes, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  IssuerAllowlisted,
  OwnershipTransferred,
  ReviewCoordinatorAllowlisted,
  ReviewReceiptAccepted,
  TemplateRegistered,
  Verified
} from "../generated/AttestationVerifier/AttestationVerifier"

export function createIssuerAllowlistedEvent(
  templateId: Bytes,
  issuer: Address,
  allowed: boolean
): IssuerAllowlisted {
  let issuerAllowlistedEvent = changetype<IssuerAllowlisted>(newMockEvent())

  issuerAllowlistedEvent.parameters = new Array()

  issuerAllowlistedEvent.parameters.push(
    new ethereum.EventParam(
      "templateId",
      ethereum.Value.fromFixedBytes(templateId)
    )
  )
  issuerAllowlistedEvent.parameters.push(
    new ethereum.EventParam("issuer", ethereum.Value.fromAddress(issuer))
  )
  issuerAllowlistedEvent.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  )

  return issuerAllowlistedEvent
}

export function createReviewCoordinatorAllowlistedEvent(
  coordinator: Address,
  allowed: boolean
): ReviewCoordinatorAllowlisted {
  let reviewCoordinatorAllowlistedEvent =
    changetype<ReviewCoordinatorAllowlisted>(newMockEvent())

  reviewCoordinatorAllowlistedEvent.parameters = new Array()

  reviewCoordinatorAllowlistedEvent.parameters.push(
    new ethereum.EventParam(
      "coordinator",
      ethereum.Value.fromAddress(coordinator)
    )
  )
  reviewCoordinatorAllowlistedEvent.parameters.push(
    new ethereum.EventParam("allowed", ethereum.Value.fromBoolean(allowed))
  )

  return reviewCoordinatorAllowlistedEvent
}

export function createReviewReceiptAcceptedEvent(
  trustId: BigInt,
  attestationUid: Bytes,
  coordinator: Address,
  receiptRoot: Bytes,
  receiptUri: string
): ReviewReceiptAccepted {
  let reviewReceiptAcceptedEvent =
    changetype<ReviewReceiptAccepted>(newMockEvent())

  reviewReceiptAcceptedEvent.parameters = new Array()

  reviewReceiptAcceptedEvent.parameters.push(
    new ethereum.EventParam(
      "trustId",
      ethereum.Value.fromUnsignedBigInt(trustId)
    )
  )
  reviewReceiptAcceptedEvent.parameters.push(
    new ethereum.EventParam(
      "attestationUid",
      ethereum.Value.fromFixedBytes(attestationUid)
    )
  )
  reviewReceiptAcceptedEvent.parameters.push(
    new ethereum.EventParam(
      "coordinator",
      ethereum.Value.fromAddress(coordinator)
    )
  )
  reviewReceiptAcceptedEvent.parameters.push(
    new ethereum.EventParam(
      "receiptRoot",
      ethereum.Value.fromFixedBytes(receiptRoot)
    )
  )
  reviewReceiptAcceptedEvent.parameters.push(
    new ethereum.EventParam("receiptUri", ethereum.Value.fromString(receiptUri))
  )

  return reviewReceiptAcceptedEvent
}

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

export function createTemplateRegisteredEvent(
  templateId: Bytes,
  schemaUid: Bytes,
  expiryWindowSeconds: BigInt,
  stalenessWindowSeconds: BigInt
): TemplateRegistered {
  let templateRegisteredEvent = changetype<TemplateRegistered>(newMockEvent())

  templateRegisteredEvent.parameters = new Array()

  templateRegisteredEvent.parameters.push(
    new ethereum.EventParam(
      "templateId",
      ethereum.Value.fromFixedBytes(templateId)
    )
  )
  templateRegisteredEvent.parameters.push(
    new ethereum.EventParam(
      "schemaUid",
      ethereum.Value.fromFixedBytes(schemaUid)
    )
  )
  templateRegisteredEvent.parameters.push(
    new ethereum.EventParam(
      "expiryWindowSeconds",
      ethereum.Value.fromUnsignedBigInt(expiryWindowSeconds)
    )
  )
  templateRegisteredEvent.parameters.push(
    new ethereum.EventParam(
      "stalenessWindowSeconds",
      ethereum.Value.fromUnsignedBigInt(stalenessWindowSeconds)
    )
  )

  return templateRegisteredEvent
}

export function createVerifiedEvent(
  trustId: BigInt,
  attestationUid: Bytes,
  beneficiary: Address
): Verified {
  let verifiedEvent = changetype<Verified>(newMockEvent())

  verifiedEvent.parameters = new Array()

  verifiedEvent.parameters.push(
    new ethereum.EventParam(
      "trustId",
      ethereum.Value.fromUnsignedBigInt(trustId)
    )
  )
  verifiedEvent.parameters.push(
    new ethereum.EventParam(
      "attestationUid",
      ethereum.Value.fromFixedBytes(attestationUid)
    )
  )
  verifiedEvent.parameters.push(
    new ethereum.EventParam(
      "beneficiary",
      ethereum.Value.fromAddress(beneficiary)
    )
  )

  return verifiedEvent
}
