import Link from 'next/link';
import Image from 'next/image';

import { BrewMark } from './brew-mark';

const releaseSteps = [
  {
    label: 'Funded',
    detail: 'Sponsor locks a grant batch',
  },
  {
    label: 'Attested',
    detail: 'Beneficiary submits EAS proof',
  },
  {
    label: 'Reviewed',
    detail: '0G agents reach quorum',
  },
  {
    label: 'Released',
    detail: 'KeeperHub executes onchain',
  },
];

const councilAgents = [
  ['Evidence', '0G Agentic ID #88'],
  ['Policy', '0G Agentic ID #89'],
  ['Risk', '0G Agentic ID #90'],
];

export default function LandingPage() {
  return (
    <main className="landing-shell">
      <header className="landing-nav" aria-label="Brew navigation">
        <Link className="landing-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <BrewMark />
          </span>
          <strong>Brew</strong>
        </Link>
        <nav>
          <a href="#workflow">Workflow</a>
          <a href="#council">Agents</a>
          <a href="#receipt">Receipt</a>
        </nav>
        <Link className="launch-button" href="/app">
          Launch App
        </Link>
      </header>

      <section className="landing-hero" aria-label="Brew">
        <div className="hero-copy">
          <span className="eyebrow">Conditional trust. Verified release.</span>
          <h1 className="landing-title">Brew</h1>
          <p>
            Conditional grants reviewed by 0G agent identities, sealed into a
            storage receipt, and released by KeeperHub automation.
          </p>
          <div className="hero-actions">
            <Link className="launch-button launch-button-large" href="/app">
              Launch App
            </Link>
            <a className="secondary-link hero-link" href="#workflow">
              View workflow
            </a>
          </div>
        </div>

        <div className="release-console" aria-label="Release console preview">
          <div className="hero-visual-frame" aria-hidden="true">
            <Image
              className="hero-apparatus-image"
              src="/brew-hero-apparatus.png"
              alt=""
              fill
              priority
              sizes="(max-width: 760px) 100vw, 540px"
            />
            <span className="apparatus-flow apparatus-flow-one" />
            <span className="apparatus-flow apparatus-flow-two" />
            <span className="apparatus-seal-pulse" />
          </div>
          <div className="console-header">
            <span>TRUST-2026-0421</span>
            <strong className="console-status">
              <span aria-hidden="true" />
              Release rail cycling
            </strong>
          </div>
          <ol className="hero-release-rail">
            {releaseSteps.map((step, index) => (
              <li key={step.label}>
                <span>{index + 1}</span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </li>
            ))}
          </ol>
          <div className="console-grid">
            <div className="sealed-receipt" id="receipt">
              <span className="data-label">Sealed 0G receipt</span>
              <strong>0x3697...e01f</strong>
              <small>Stored on 0G Storage</small>
              <span className="seal-mark">SEALED</span>
            </div>
            <div className="keeperhub-rail">
              <span className="data-label">KeeperHub</span>
              <strong>Verified release executor</strong>
              <small>Workflow trigger ready</small>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="workflow" aria-label="Brew workflow">
        <div className="section-heading">
          <div>
            <span className="data-label">Release lifecycle</span>
            <h2>From funded batch to verified release.</h2>
          </div>
          <Link className="secondary-link" href="/sponsor/new">
            Create trust
          </Link>
        </div>
        <div className="landing-step-grid">
          {releaseSteps.map((step, index) => (
            <article key={step.label}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-split" id="council" aria-label="Review council">
        <div>
          <span className="data-label">0G review council</span>
          <h2>Three compact agents, one release decision.</h2>
          <p>
            Evidence, policy, and risk agents independently review the same trust
            context before a signed receipt can unlock the onchain verifier.
          </p>
        </div>
        <div className="landing-agent-stack">
          {councilAgents.map(([role, identity]) => (
            <div key={role}>
              <span className="data-label">{role}</span>
              <strong>{identity}</strong>
              <small>Registered on 0G Galileo</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
