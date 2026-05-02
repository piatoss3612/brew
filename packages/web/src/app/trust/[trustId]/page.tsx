import Link from 'next/link';

import { BrewMark } from '../../brew-mark';
import { ConnectWalletButton } from '../../connect-wallet-button';
import { TrustDetail } from './trust-detail';

type TrustPageProps = {
  params: Promise<{
    trustId: string;
  }>;
};

export default async function TrustPage({ params }: TrustPageProps) {
  const { trustId } = await params;

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
          <Link className="sidebar-link" href="/app">
            Overview
          </Link>
          <Link className="sidebar-link" href="/sponsor/new">
            New trust
          </Link>
          <Link className="sidebar-link sidebar-link-active" href={`/trust/${trustId}`}>
            Trust #{trustId}
          </Link>
        </nav>
        <div className="sidebar-status">
          <span className="data-label">Detail view</span>
          <strong>Release control room</strong>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="top-bar workspace-top">
          <div className="brand-lockup">
            <h1>Trust #{trustId}</h1>
            <p>Evidence, review, and release status</p>
          </div>
          <div className="header-actions">
            <Link className="secondary-link" href="/app">
              Overview
            </Link>
            <Link className="secondary-link" href="/sponsor/new">
              New trust
            </Link>
            <ConnectWalletButton />
          </div>
        </header>

        <TrustDetail trustId={trustId} />
      </section>
    </main>
  );
}
