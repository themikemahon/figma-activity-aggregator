'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';

interface ConnectedAccount {
  accountName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  teamIds?: string[];
}

interface ConfigInterfaceProps {
  accounts: ConnectedAccount[];
  userEmail: string;
  userName: string;
}

export default function ConfigInterface({ accounts, userEmail, userName }: ConfigInterfaceProps) {
  const [teamIdsInput, setTeamIdsInput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string>('');

  const handleUpdateTeamIds = async (accountName: string) => {
    const teamIdsStr = teamIdsInput[accountName] || '';
    const teamIds = teamIdsStr.split(',').map(id => id.trim()).filter(id => id);

    if (teamIds.length === 0) {
      setMessage('Please enter at least one team ID');
      return;
    }

    setLoading({ ...loading, [accountName]: true });
    setMessage('');

    try {
      const response = await fetch(`/api/config/accounts/${encodeURIComponent(accountName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds }),
      });

      if (response.ok) {
        setMessage(`Team IDs updated for ${accountName}!`);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const data = await response.json();
        setMessage(`Error: ${data.error || 'Failed to update'}`);
      }
    } catch (error) {
      setMessage('Error updating team IDs');
    } finally {
      setLoading({ ...loading, [accountName]: false });
    }
  };

  const handleDeleteAccount = async (accountName: string) => {
    if (!confirm(`Delete account "${accountName}"?`)) return;

    setLoading({ ...loading, [accountName]: true });
    setMessage('');

    try {
      const response = await fetch(`/api/config/accounts/${encodeURIComponent(accountName)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setMessage(`Account "${accountName}" deleted!`);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const data = await response.json();
        setMessage(`Error: ${data.error || 'Failed to delete'}`);
      }
    } catch (error) {
      setMessage('Error deleting account');
    } finally {
      setLoading({ ...loading, [accountName]: false });
    }
  };

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

      {message && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: message.includes('Error') ? '#ffebee' : '#e8f5e9',
          color: message.includes('Error') ? '#c62828' : '#2e7d32',
          borderRadius: '4px',
        }}>
          {message}
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Connected Accounts</h2>
          <a
            href="/api/link-figma-account"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#1976d2',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '0.9rem',
            }}
          >
            + Link Another Figma Account
          </a>
        </div>
        {accounts.length === 0 ? (
          <p style={{ color: '#666' }}>No accounts connected.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {accounts.map(account => (
              <div
                key={account.accountName}
                style={{
                  padding: '1.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>{account.accountName}</h3>
                    <p style={{ margin: '0.25rem 0', color: '#666', fontSize: '0.9rem' }}>
                      Email: {account.email}
                    </p>
                    <p style={{ margin: '0.25rem 0', color: '#999', fontSize: '0.85rem' }}>
                      Connected: {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteAccount(account.accountName)}
                    disabled={loading[account.accountName]}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#d32f2f',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    {loading[account.accountName] ? 'Deleting...' : 'Delete'}
                  </button>
                </div>

                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Team IDs</h4>
                  {account.teamIds && account.teamIds.length > 0 ? (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#666' }}>
                        Current: {account.teamIds.join(', ')}
                      </p>
                    </div>
                  ) : (
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#d32f2f' }}>
                      No team IDs configured - digest will not track activity
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Enter team IDs (comma-separated)"
                      value={teamIdsInput[account.accountName] || ''}
                      onChange={(e) => setTeamIdsInput({ ...teamIdsInput, [account.accountName]: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                      }}
                    />
                    <button
                      onClick={() => handleUpdateTeamIds(account.accountName)}
                      disabled={loading[account.accountName]}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                    >
                      {loading[account.accountName] ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#999' }}>
                    Find team IDs in your Figma team URLs: figma.com/files/TEAM_ID/...
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>How it works</h2>
        <ul style={{ color: '#666', lineHeight: '1.8' }}>
          <li>The digest runs automatically every 24 hours via cron job</li>
          <li>It tracks file edits, comments, and version history across your configured teams</li>
          <li>Activity is filtered to show only what's relevant to you</li>
          <li>Summaries are posted to your configured Slack channel</li>
        </ul>
      </div>

      <div style={{
        padding: '1.5rem',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        border: '1px solid #ddd',
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Manual Digest</h3>
        <p style={{ margin: '0.5rem 0', color: '#666', fontSize: '0.9rem' }}>
          Test the digest manually: <a href="/api/run-figma-digest" target="_blank" style={{ color: '#1976d2' }}>/api/run-figma-digest</a>
        </p>
      </div>
    </div>
  );
}
