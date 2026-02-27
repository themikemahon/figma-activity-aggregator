'use client';

import { signOut } from 'next-auth/react';

interface ConnectedAccount {
  accountName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface ConfigInterfaceProps {
  accounts: ConnectedAccount[];
  userEmail: string;
  userName: string;
}

export default function ConfigInterface({ accounts, userEmail, userName }: ConfigInterfaceProps) {
  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0' }}>Figma Activity Aggregator</h1>
          <p style={{ margin: 0, color: '#666' }}>Signed in as: {userName} ({userEmail})</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </div>

      <div style={{
        padding: '1.5rem',
        backgroundColor: '#e8f5e9',
        borderRadius: '4px',
        marginBottom: '2rem',
      }}>
        <h2 style={{ margin: '0 0 0.5rem 0', color: '#2e7d32' }}>✓ Connected to Figma</h2>
        <p style={{ margin: 0, color: '#1b5e20' }}>
          Your Figma account is connected and the digest will track activity across all teams you have access to.
        </p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>How it works</h2>
        <ul style={{ color: '#666', lineHeight: '1.8' }}>
          <li>The digest runs automatically every 24 hours via cron job</li>
          <li>It tracks file edits, comments, and version history across all your Figma teams</li>
          <li>Activity is filtered to show only what's relevant to you (your edits, comments on your work, replies to you)</li>
          <li>Summaries are posted to your configured Slack channel</li>
        </ul>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>Connected Account</h2>
        {accounts.length === 0 ? (
          <p style={{ color: '#666' }}>No account information available.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {accounts.map(account => (
              <div
                key={account.accountName}
                style={{
                  padding: '1rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{account.accountName}</h3>
                <p style={{ margin: '0.25rem 0', color: '#666', fontSize: '0.9rem' }}>
                  Email: {account.email}
                </p>
                <p style={{ margin: '0.25rem 0', color: '#999', fontSize: '0.85rem' }}>
                  Connected: {new Date(account.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        padding: '1.5rem',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        border: '1px solid #ddd',
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Need Help?</h3>
        <p style={{ margin: '0.5rem 0', color: '#666', fontSize: '0.9rem' }}>
          If you're not seeing activity in Slack, check:
        </p>
        <ul style={{ margin: '0.5rem 0', color: '#666', fontSize: '0.9rem' }}>
          <li>Your Slack webhook URL is configured correctly in Vercel environment variables</li>
          <li>The cron job is enabled (requires Vercel Pro plan)</li>
          <li>You have recent activity in your Figma files</li>
        </ul>
        <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
          You can manually trigger a digest by visiting: <code>/api/run-figma-digest</code>
        </p>
      </div>
    </div>
  );
}
