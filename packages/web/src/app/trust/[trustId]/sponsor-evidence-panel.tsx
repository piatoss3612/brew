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

function TrailStep({
  index,
  label,
  title,
  detail,
  mode,
}: {
  index: number;
  label: string;
  title: string;
  detail: string;
  mode: EvidenceMode;
}) {
  return (
    <div className={`evidence-trail-step evidence-trail-step-${mode}`}>
      <span className="evidence-trail-index">{String(index).padStart(2, '0')}</span>
      <div>
        <span className="data-label">{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function SponsorEvidencePanel({
  evidence,
  onOpenStorageUri,
}: {
  evidence: SponsorEvidence;
  onOpenStorageUri?: (uri: string) => void;
}) {
  const hasStorageSubmission = typeof evidence.storage.submissionSequence === 'number';
  const receiptStored =
    evidence.storage.storageStatus === 'live'
      ? 'Receipt artifact is available on 0G Storage'
      : 'Receipt artifact will be resolved after review';
  const keeperExecutionDetail =
    evidence.keeperHub.txHash
      ? `Release tx ${shortHash(evidence.keeperHub.txHash)}`
      : evidence.keeperHub.revertReason ?? evidence.keeperHub.nodeStatusSummary;
  const verifierMode: EvidenceMode =
    evidence.verifier.outcome === 'pending' ? 'simulated' : 'live';
  const verifierDetail =
    evidence.verifier.outcome === 'released'
      ? 'Verifier accepted the signed receipt and released funds'
      : evidence.verifier.outcome === 'refunded'
        ? 'Trust was recovered by sponsor refund'
        : 'Verifier is waiting for a valid release call';

  return (
    <section className="sponsor-panel" aria-label="Sponsor evidence">
      <div className="section-heading">
        <div>
          <span className="data-label">Sponsor evidence</span>
          <h2>Agent execution trail</h2>
        </div>
        <strong>{evidence.verifier.outcome}</strong>
      </div>

      <div className="evidence-trail-grid" aria-label="Agent execution steps">
        <TrailStep
          index={1}
          label="Review"
          title="0G agents inspect the proof"
          detail={evidence.agent.intervention.responsibility}
          mode={evidence.storage.storageStatus}
        />
        <TrailStep
          index={2}
          label="Store"
          title="Receipt is sealed"
          detail={receiptStored}
          mode={evidence.storage.storageStatus}
        />
        <TrailStep
          index={3}
          label="Execute"
          title="KeeperHub runs the release workflow"
          detail={keeperExecutionDetail}
          mode={evidence.keeperHub.executionMode}
        />
        <TrailStep
          index={4}
          label="Settle"
          title="Verifier controls fund movement"
          detail={verifierDetail}
          mode={verifierMode}
        />
      </div>

      <div className="evidence-grid">
        <article className="evidence-card">
          <div className="evidence-card-header">
            <div>
              <span className="data-label">0G Release Council</span>
              <h3>Agent review</h3>
            </div>
            <EvidenceModeBadge mode={evidence.storage.storageStatus} />
          </div>
          <div className="evidence-values">
            <EvidenceValue label="Agents" value="Evidence / Policy / Risk" />
            <EvidenceValue label="Output" value="Signed review receipt" />
            <EvidenceValue label="Handoff" value="KeeperHub release workflow" />
            <EvidenceValue label="Boundary" value="Verifier controls fund movement" />
            <EvidenceValue
              label="Workflow ID"
              value={evidence.agent.records['com.brew.keeperhub_workflow']}
            />
            <EvidenceValue label="0G root" value={evidence.agent.records['com.brew.0g_root']} />
          </div>
        </article>

        <article className="evidence-card">
          <div className="evidence-card-header">
            <div>
              <span className="data-label">KeeperHub</span>
              <h3>Workflow execution</h3>
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
              <h3>Receipt storage</h3>
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
