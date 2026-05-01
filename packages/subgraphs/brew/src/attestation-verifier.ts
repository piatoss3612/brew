import {
  IssuerAllowlisted as IssuerAllowlistedEvent,
  ReviewCoordinatorAllowlisted as ReviewCoordinatorAllowlistedEvent,
  ReviewReceiptAccepted as ReviewReceiptAcceptedEvent,
  TemplateRegistered as TemplateRegisteredEvent,
  Verified as VerifiedEvent,
} from "../generated/AttestationVerifier/AttestationVerifier"
import {
  IssuerPermission,
  ReviewCoordinatorPermission,
  ReviewReceipt,
  Template,
  Trust,
  Verification,
} from "../generated/schema"

export function handleIssuerAllowlisted(event: IssuerAllowlistedEvent): void {
  let permission = new IssuerPermission(
    event.params.templateId.toHexString() + "-" + event.params.issuer.toHexString(),
  )
  permission.templateId = event.params.templateId
  permission.issuer = event.params.issuer
  permission.allowed = event.params.allowed
  permission.updatedAt = event.block.timestamp
  permission.updatedTx = event.transaction.hash
  permission.save()
}

export function handleReviewCoordinatorAllowlisted(
  event: ReviewCoordinatorAllowlistedEvent,
): void {
  let permission = new ReviewCoordinatorPermission(
    event.params.coordinator.toHexString(),
  )
  permission.coordinator = event.params.coordinator
  permission.allowed = event.params.allowed
  permission.updatedAt = event.block.timestamp
  permission.updatedTx = event.transaction.hash
  permission.save()
}

export function handleReviewReceiptAccepted(
  event: ReviewReceiptAcceptedEvent,
): void {
  let receipt = new ReviewReceipt(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  receipt.trust = event.params.trustId.toString()
  receipt.trustId = event.params.trustId
  receipt.attestationUid = event.params.attestationUid
  receipt.coordinator = event.params.coordinator
  receipt.receiptRoot = event.params.receiptRoot
  receipt.receiptUri = event.params.receiptUri
  receipt.blockNumber = event.block.number
  receipt.blockTimestamp = event.block.timestamp
  receipt.transactionHash = event.transaction.hash
  receipt.save()

  let trust = Trust.load(event.params.trustId.toString())
  if (trust == null) {
    return
  }

  trust.reviewReceiptRoot = event.params.receiptRoot
  trust.reviewReceiptUri = event.params.receiptUri
  trust.reviewCoordinator = event.params.coordinator
  trust.reviewedAt = event.block.timestamp
  trust.reviewedTx = event.transaction.hash
  trust.save()
}

export function handleTemplateRegistered(event: TemplateRegisteredEvent): void {
  let template = new Template(event.params.templateId.toHexString())
  template.templateId = event.params.templateId
  template.schemaUid = event.params.schemaUid
  template.expiryWindowSeconds = event.params.expiryWindowSeconds
  template.stalenessWindowSeconds = event.params.stalenessWindowSeconds
  template.registeredAt = event.block.timestamp
  template.registeredTx = event.transaction.hash
  template.save()
}

export function handleVerified(event: VerifiedEvent): void {
  let verification = new Verification(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  verification.trust = event.params.trustId.toString()
  verification.trustId = event.params.trustId
  verification.attestationUid = event.params.attestationUid
  verification.beneficiary = event.params.beneficiary
  verification.blockNumber = event.block.number
  verification.blockTimestamp = event.block.timestamp
  verification.transactionHash = event.transaction.hash
  verification.save()

  let trust = Trust.load(event.params.trustId.toString())
  if (trust == null) {
    return
  }

  trust.attestationUid = event.params.attestationUid
  trust.verifiedAt = event.block.timestamp
  trust.verifiedTx = event.transaction.hash
  trust.save()
}
