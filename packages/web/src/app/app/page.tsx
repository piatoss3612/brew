import Link from 'next/link';

import { ConnectWalletButton } from '../connect-wallet-button';
import { OverviewToast } from '../overview-toast';
import { TrustDirectory } from '../trust-directory';
import { TrustWorkflow } from '../trust-workflow';
import { WorkspaceSidebar } from '../workspace-sidebar';

type AppOverviewProps = {
  searchParams?: Promise<{
    trustCreated?: string | string[];
    tx?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AppOverview({ searchParams }: AppOverviewProps) {
  const params = searchParams ? await searchParams : undefined;
  const trustCreated = firstParam(params?.trustCreated) === '1';
  const tx = firstParam(params?.tx);

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="overview"
        statusLabel="Network"
        statusValue="0G Galileo + Base Sepolia"
      />

      <section className="workspace-main">
        <OverviewToast created={trustCreated} tx={tx} />

        <header className="top-bar workspace-top">
          <div className="brand-lockup">
            <h1>Brew</h1>
            <p>Trust release workspace</p>
          </div>
          <div className="header-actions">
            <Link className="secondary-link" href="/">
              Landing
            </Link>
            <Link className="secondary-link" href="/workspace">
              Your workspace
            </Link>
            <Link className="secondary-link" href="/workflows">
              Workflows
            </Link>
            <Link className="secondary-link" href="/sponsor/new">
              New trust
            </Link>
            <ConnectWalletButton />
          </div>
        </header>

        <TrustWorkflow />
        <TrustDirectory />
      </section>
    </main>
  );
}
