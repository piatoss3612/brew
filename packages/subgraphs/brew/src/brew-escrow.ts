import {
  Refunded as RefundedEvent,
  Released as ReleasedEvent,
  TrustCreated as TrustCreatedEvent,
  VerifierUpdated as VerifierUpdatedEvent
} from "../generated/BrewEscrow/BrewEscrow"
import { Trust, VerifierConfig } from "../generated/schema"

const STATUS_PENDING = "PENDING"
const STATUS_RELEASED = "RELEASED"
const STATUS_REFUNDED = "REFUNDED"
const VERIFIER_CONFIG_ID = "current"

export function handleRefunded(event: RefundedEvent): void {
  let trust = Trust.load(event.params.trustId.toString())
  if (trust == null) {
    return
  }

  trust.status = STATUS_REFUNDED
  trust.refundedAt = event.block.timestamp
  trust.refundedTx = event.transaction.hash
  trust.save()
}

export function handleReleased(event: ReleasedEvent): void {
  let trust = Trust.load(event.params.trustId.toString())
  if (trust == null) {
    return
  }

  trust.status = STATUS_RELEASED
  trust.releasedAt = event.block.timestamp
  trust.releasedTx = event.transaction.hash
  trust.save()
}

export function handleTrustCreated(event: TrustCreatedEvent): void {
  let trust = new Trust(event.params.trustId.toString())
  trust.trustId = event.params.trustId
  trust.sponsor = event.params.sponsor
  trust.beneficiary = event.params.beneficiary
  trust.templateId = event.params.templateId
  trust.token = event.params.token
  trust.amount = event.params.amount
  trust.deadline = event.params.deadline
  trust.status = STATUS_PENDING
  trust.createdAt = event.block.timestamp
  trust.createdBlock = event.block.number
  trust.createdTx = event.transaction.hash
  trust.save()
}

export function handleVerifierUpdated(event: VerifierUpdatedEvent): void {
  let config = new VerifierConfig(VERIFIER_CONFIG_ID)
  config.verifier = event.params.verifier
  config.updatedAt = event.block.timestamp
  config.updatedTx = event.transaction.hash
  config.save()
}
