import {
  IssuerAllowlisted as IssuerAllowlistedEvent,
  TemplateRegistered as TemplateRegisteredEvent,
  Verified as VerifiedEvent,
} from "../generated/AttestationVerifier/AttestationVerifier"
import {
  IssuerPermission,
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
