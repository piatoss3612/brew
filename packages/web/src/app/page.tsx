import { ConnectWalletButton } from './connect-wallet-button';
import { TrustWorkflow } from './trust-workflow';

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

      <TrustWorkflow />
    </main>
  );
}
