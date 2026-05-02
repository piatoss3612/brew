import { shortHash, shortenAddress, txLink } from '../../../format';
import type { EvidenceMode, SponsorEvidence } from '../../../sponsor-evidence';

const STORAGE_SCAN_GALILEO_URL = 'https://storagescan-galileo.0g.ai';

function storageScanSubmissionLink(sequence: number | undefined) {
  return typeof sequence === 'number'
    ? `${STORAGE_SCAN_GALILEO_URL}/submission/${sequence}`
    : STORAGE_SCAN_GALILEO_URL;
}

function formatMode(mode: EvidenceMode) {
  if (mode === 'live') return 'Live';
  if (mode === 'simulated') return 'Simulated';
  if (mode === 'planned') return 'Planned';
  return 'Skipped';
}

function EvidenceModeBadge({ mode }: { mode: EvidenceMode }) {
  return <span className={`evidence-mode evidence-mode-${mode}`}>{formatMode(mode)}</span>;
}

function EvidenceValue({
  label,
  value,
  title,
  link,
  onOpenStorageUri,
}: {
  label: string;
  value?: string;
  title?: string;
  link?: string;
  onOpenStorageUri?: (uri: string) => void;
}) {
  const displayValue = value ?? '-';
  const isStorageUri = value?.startsWith('0g://storage/') === true;

  return (
    <div>
      <span className="data-label">{label}</span>
      {link && value ? (
        <a className="tx-link" href={link} target="_blank" rel="noreferrer" title={title ?? value}>
          {displayValue}
        </a>
      ) : value && isStorageUri && onOpenStorageUri ? (
        <button
          type="button"
          className="receipt-uri-button"
          title={title ?? value}
          onClick={() => onOpenStorageUri(value)}
        >
          {displayValue}
        </button>
      ) : (
        <strong title={title ?? value}>{displayValue}</strong>
      )}
    </div>
  );
}

function shortenMaybeAddress(value?: string) {
  return value && value.startsWith('0x') && value.length === 42 ? shortenAddress(value) : value;
}

function shortMaybeHash(value?: string) {
  return value && value.startsWith('0x') && value.length > 18 ? shortHash(value) : value;
}

export function SponsorEvidencePanel({
  evidence,
  onOpenStorageUri,
}: {
  evidence: SponsorEvidence;
  onOpenStorageUri?: (uri: string) => void;
}) {
  const hasStorageSubmission = typeof evidence.storage.submissionSequence === 'number';

  return (
    <section className="sponsor-panel" aria-label="Sponsor evidence">
      <div className="section-heading">
        <div>
          <span className="data-label">Sponsor evidence</span>
          <h2>Agent execution trail</h2>
        </div>
        <strong>{evidence.verifier.outcome}</strong>
      </div>

      <div className="evidence-grid">
        <article className="evidence-card">
          <div className="evidence-card-header">
            <div>
              <span className="data-label">ENS</span>
              <h3>Agent identity</h3>
            </div>
            <EvidenceModeBadge mode={evidence.agent.resolverMode} />
          </div>
          <div className="evidence-values">
            <EvidenceValue label="Name" value={evidence.agent.ensName} />
            <EvidenceValue label="Role" value={evidence.agent.role} />
            <EvidenceValue label="Intervenes" value={evidence.agent.intervention.location} />
            <EvidenceValue
              label="Workflow"
              value={evidence.agent.records['com.brew.keeperhub_workflow']}
            />
            <EvidenceValue label="0G root" value={evidence.agent.records['com.brew.0g_root']} />
          </div>
        </article>

        <article className="evidence-card">
          <div className="evidence-card-header">
            <div>
              <span className="data-label">KeeperHub</span>
              <h3>Release execution</h3>
            </div>
            <EvidenceModeBadge mode={evidence.keeperHub.executionMode} />
          </div>
          <div className="evidence-values">
            <EvidenceValue label="Workflow" value={evidence.keeperHub.workflowId} />
            <EvidenceValue label="Execution" value={evidence.keeperHub.executionId} />
            <EvidenceValue label="Run" value={evidence.keeperHub.runId} />
            <EvidenceValue label="Status" value={evidence.keeperHub.status} />
            <EvidenceValue label="Action" value={evidence.keeperHub.action} />
            <EvidenceValue
              label="Tx"
              value={shortMaybeHash(evidence.keeperHub.txHash)}
              title={evidence.keeperHub.txHash}
              link={evidence.keeperHub.txHash ? txLink(evidence.keeperHub.txHash) : undefined}
            />
            <EvidenceValue label="Revert" value={evidence.keeperHub.revertReason} />
          </div>
          <ol className="evidence-phase-list">
            {evidence.keeperHub.phases.map((phase, index) => (
              <li key={`${phase.name}-${phase.status}-${index}`}>
                <span>{phase.name}</span>
                <strong>{phase.status}</strong>
                <p>{phase.summary}</p>
              </li>
            ))}
          </ol>
        </article>

        <article className="evidence-card">
          <div className="evidence-card-header">
            <div>
              <span className="data-label">0G</span>
              <h3>Evidence receipt</h3>
            </div>
            <EvidenceModeBadge mode={evidence.storage.storageStatus} />
          </div>
          <div className="evidence-values">
            <EvidenceValue label="Provider" value={evidence.storage.provider} />
            <EvidenceValue
              label="Manifest"
              value={evidence.storage.manifestUri}
              onOpenStorageUri={onOpenStorageUri}
            />
            <EvidenceValue
              label="StorageScan"
              value={
                hasStorageSubmission
                  ? `Submission ${evidence.storage.submissionSequence}`
                  : 'Resolving submission'
              }
              link={
                hasStorageSubmission
                  ? storageScanSubmissionLink(evidence.storage.submissionSequence)
                  : undefined
              }
            />
            <EvidenceValue
              label="Root"
              value={shortMaybeHash(evidence.storage.metadataRoot)}
              title={evidence.storage.metadataRoot}
            />
            <EvidenceValue
              label="Coordinator"
              value={shortenMaybeAddress(evidence.storage.coordinator)}
              title={evidence.storage.coordinator}
            />
            <EvidenceValue
              label="Review tx"
              value={shortMaybeHash(evidence.storage.reviewedTx)}
              title={evidence.storage.reviewedTx}
              link={evidence.storage.reviewedTx ? txLink(evidence.storage.reviewedTx) : undefined}
            />
            <EvidenceValue label="Receipt" value={evidence.storage.receiptKey} />
            <EvidenceValue label="Run status" value={evidence.receipt.keeperHubStatus} />
            <EvidenceValue label="Issued" value={evidence.receipt.issuedAt} />
          </div>
        </article>

        <article className="evidence-card">
          <div className="evidence-card-header">
            <div>
              <span className="data-label">Issuer</span>
              <h3>Proof source</h3>
            </div>
            <EvidenceModeBadge mode={evidence.issuer.resolverMode} />
          </div>
          <div className="evidence-values">
            <EvidenceValue
              label="Issuer"
              value={shortenMaybeAddress(evidence.issuer.address)}
              title={evidence.issuer.address}
            />
            <EvidenceValue label="ENS" value={evidence.issuer.ensName} />
            <EvidenceValue label="Authorization" value={evidence.issuer.authorizationSource} />
            <EvidenceValue
              label="Attestation"
              value={shortMaybeHash(evidence.verifier.input.attestationUid)}
              title={evidence.verifier.input.attestationUid}
            />
          </div>
        </article>
      </div>

      <div className="evidence-authority">
        <span className="data-label">Release authority</span>
        <strong>{evidence.verifier.authority}</strong>
      </div>
      <p className="form-note">
        Agent boundary: {evidence.agent.intervention.boundary}
      </p>
      <p className="form-note">{evidence.keeperHub.nodeStatusSummary}</p>
    </section>
  );
}
