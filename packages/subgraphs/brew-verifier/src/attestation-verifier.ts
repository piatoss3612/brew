import {
  IssuerAllowlisted as IssuerAllowlistedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  TemplateRegistered as TemplateRegisteredEvent,
  Verified as VerifiedEvent
} from "../generated/AttestationVerifier/AttestationVerifier"
import {
  IssuerAllowlisted,
  OwnershipTransferred,
  TemplateRegistered,
  Verified
} from "../generated/schema"

export function handleIssuerAllowlisted(event: IssuerAllowlistedEvent): void {
  let entity = new IssuerAllowlisted(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.templateId = event.params.templateId
  entity.issuer = event.params.issuer
  entity.allowed = event.params.allowed

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let entity = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTemplateRegistered(event: TemplateRegisteredEvent): void {
  let entity = new TemplateRegistered(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.templateId = event.params.templateId
  entity.schemaUid = event.params.schemaUid
  entity.expiryWindowSeconds = event.params.expiryWindowSeconds
  entity.stalenessWindowSeconds = event.params.stalenessWindowSeconds

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleVerified(event: VerifiedEvent): void {
  let entity = new Verified(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.trustId = event.params.trustId
  entity.attestationUid = event.params.attestationUid
  entity.beneficiary = event.params.beneficiary

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
