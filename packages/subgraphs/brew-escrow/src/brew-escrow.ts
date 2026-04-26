import {
  OwnershipTransferred as OwnershipTransferredEvent,
  Refunded as RefundedEvent,
  Released as ReleasedEvent,
  TrustCreated as TrustCreatedEvent,
  VerifierUpdated as VerifierUpdatedEvent
} from "../generated/BrewEscrow/BrewEscrow"
import {
  OwnershipTransferred,
  Refunded,
  Released,
  TrustCreated,
  VerifierUpdated
} from "../generated/schema"

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

export function handleRefunded(event: RefundedEvent): void {
  let entity = new Refunded(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.trustId = event.params.trustId
  entity.sponsor = event.params.sponsor
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleReleased(event: ReleasedEvent): void {
  let entity = new Released(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.trustId = event.params.trustId
  entity.beneficiary = event.params.beneficiary
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTrustCreated(event: TrustCreatedEvent): void {
  let entity = new TrustCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.trustId = event.params.trustId
  entity.sponsor = event.params.sponsor
  entity.beneficiary = event.params.beneficiary
  entity.templateId = event.params.templateId
  entity.token = event.params.token
  entity.amount = event.params.amount
  entity.deadline = event.params.deadline

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleVerifierUpdated(event: VerifierUpdatedEvent): void {
  let entity = new VerifierUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.verifier = event.params.verifier

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
