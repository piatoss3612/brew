import Link from 'next/link';

import { BrewMark } from '../brew-mark';
import { ConnectWalletButton } from '../connect-wallet-button';
import { OverviewToast } from '../overview-toast';
import { TrustDirectory } from '../trust-directory';
import { TrustWorkflow } from '../trust-workflow';

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
      <aside className="workspace-sidebar" aria-label="Brew workspace navigation">
        <Link className="sidebar-brand" href="/app">
          <span className="brand-mark" aria-hidden="true">
            <BrewMark />
          </span>
          <strong>Brew</strong>
        </Link>
        <nav>
          <Link className="sidebar-link sidebar-link-active" href="/app">
            Overview
          </Link>
          <Link className="sidebar-link" href="/sponsor/new">
            New trust
          </Link>
          <a className="sidebar-link" href="#trusts">
            Trust batches
          </a>
        </nav>
        <div className="sidebar-status">
          <span className="data-label">Network</span>
          <strong>0G Galileo + Base Sepolia</strong>
        </div>
      </aside>

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
