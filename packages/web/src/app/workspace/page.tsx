import Link from 'next/link';

import { ConnectWalletButton } from '../connect-wallet-button';
import { WorkspaceDashboard } from '../workspace-dashboard';
import { WorkspaceSidebar } from '../workspace-sidebar';

export default function WorkspacePage() {
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="workspace"
        statusLabel="Workspace"
        statusValue="Wallet-scoped trust work"
      />

      <section className="workspace-main">
        <header className="top-bar workspace-top">
          <div className="brand-lockup">
            <h1>Your workspace</h1>
            <p>Sponsor and beneficiary work for the connected wallet</p>
          </div>
          <div className="header-actions">
            <Link className="secondary-link" href="/workflows">
              Workflows
            </Link>
            <Link className="secondary-link" href="/sponsor/new">
              New trust
            </Link>
            <ConnectWalletButton />
          </div>
        </header>

        <WorkspaceDashboard />
      </section>
    </main>
  );
}
