import Link from 'next/link';

import { ConnectWalletButton } from '../../connect-wallet-button';
import { WorkspaceSidebar } from '../../workspace-sidebar';
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
      <WorkspaceSidebar
        active="trust-detail"
        detailHref={`/trust/${trustId}`}
        detailLabel={`Trust #${trustId}`}
        statusLabel="Detail view"
        statusValue="Release control room"
      />

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
