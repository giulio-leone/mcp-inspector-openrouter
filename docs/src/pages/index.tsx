import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

export default function Home(): React.JSX.Element {
  return (
    <Layout title="Home" description="AI-powered browser assistant with hexagonal architecture">
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>OneGenUI Deep Agents</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--ifm-color-emphasis-700)', maxWidth: '600px', textAlign: 'center' }}>
          AI-powered Chrome Extension with hexagonal architecture for context-aware browser automation.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
          <Link className="button button--primary button--lg" to="/docs/">
            Get Started
          </Link>
          <Link className="button button--secondary button--lg" href="https://github.com/giulio-leone/mcp-inspector-openrouter">
            GitHub
          </Link>
        </div>
      </main>
    </Layout>
  );
}
