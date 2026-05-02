import Link from 'next/link';

import { ConnectWalletButton } from '../connect-wallet-button';
import { WorkflowList } from '../workflow-list';
import { WorkspaceSidebar } from '../workspace-sidebar';

export default function WorkflowsPage() {
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="workflows"
        statusLabel="Workflow index"
        statusValue="All trust release paths"
      />

      <section className="workspace-main">
        <header className="top-bar workspace-top">
          <div className="brand-lockup">
            <h1>Workflows</h1>
            <p>Every indexed trust release path</p>
          </div>
          <div className="header-actions">
            <Link className="secondary-link" href="/workspace">
              Your workspace
            </Link>
            <Link className="secondary-link" href="/sponsor/new">
              New trust
            </Link>
            <ConnectWalletButton />
          </div>
        </header>

        <WorkflowList />
      </section>
    </main>
  );
}
