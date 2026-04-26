import { ConnectWalletButton } from './connect-wallet-button';

const workflowSteps = [
  {
    label: 'Sponsor',
    state: 'Funded',
  },
  {
    label: 'Verify',
    state: 'Attestation pending',
  },
  {
    label: 'Release',
    state: 'Awaiting verification',
  },
];

export default function Home() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <h1>Brew</h1>
          <p>Trust release workspace</p>
        </div>
        <ConnectWalletButton />
      </header>

      <section className="workflow" aria-label="Trust workflow">
        {workflowSteps.map((step, index) => (
          <div className="workflow-row" key={step.label}>
            <span className="workflow-index">{String(index + 1).padStart(2, '0')}</span>
            <strong>{step.label}</strong>
            <span className="workflow-state">{step.state}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
