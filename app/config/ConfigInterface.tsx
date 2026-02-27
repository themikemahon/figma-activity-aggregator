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

      if (!response.ok) {
        const data = await response.json();
        setMessage(`Error: ${data.error || 'Failed to update'}`);
        return;
      }

      for (const teamId of teamIds) {
        try {
          await fetch('/api/webhooks/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId, accountName }),
          });
        } catch (webhookError) {
          console.error('Failed to register webhook:', webhookError);
        }
      }

      setMessage(`Team IDs updated and webhooks registered for ${accountName}!`);
      setTimeout(() => window.location.reload(), 1000);
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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-figma-sidebar border-r border-figma-border flex flex-col">
        <div className="p-4 border-b border-figma-border">
          <h2 className="text-sm font-semibold text-figma-text">Figma Aggregator</h2>
        </div>
        <nav className="flex-1 p-2">
          <div className="px-3 py-2 text-sm font-medium text-figma-text bg-white rounded">
            Accounts
          </div>
        </nav>
        <div className="p-4 border-t border-figma-border">
          <div className="text-xs text-figma-text-tertiary mb-2">{userName}</div>
          <div className="text-xs text-figma-text-tertiary mb-3 truncate">{userEmail}</div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full px-3 py-1.5 text-xs font-medium text-figma-text-secondary hover:bg-white rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          {message && (
            <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${
              message.includes('Error') 
                ? 'bg-red-50 text-red-800 border border-red-200' 
                : 'bg-green-50 text-green-800 border border-green-200'
            }`}>
              {message}
            </div>
          )}

          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold text-figma-text">Connected Accounts</h1>
              <a
                href="/api/link-figma-account"
                className="px-4 py-2 bg-figma-primary hover:bg-figma-primary-hover text-white text-sm font-medium rounded-lg transition-colors"
              >
                + Link Figma Account
              </a>
            </div>

            {accounts.length === 0 ? (
              <div className="bg-figma-panel border border-figma-border rounded-lg p-8 text-center">
                <p className="text-figma-text-secondary">No accounts connected yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map(account => (
                  <div
                    key={account.accountName}
                    className="bg-white border border-figma-border rounded-lg p-6"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-figma-text mb-1">
                          {account.accountName}
                        </h3>
                        <p className="text-sm text-figma-text-secondary mb-1">
                          {account.email}
                        </p>
                        <p className="text-xs text-figma-text-tertiary">
                          Connected {new Date(account.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteAccount(account.accountName)}
                        disabled={loading[account.accountName]}
                        className="px-3 py-1.5 bg-figma-danger hover:bg-figma-danger-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
                      >
                        {loading[account.accountName] ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>

                    <div className="bg-figma-panel border border-figma-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-figma-text mb-2">Team IDs</h4>
                      {account.teamIds && account.teamIds.length > 0 ? (
                        <p className="text-xs text-figma-text-secondary mb-3">
                          Current: {account.teamIds.join(', ')}
                        </p>
                      ) : (
                        <p className="text-xs text-figma-danger mb-3">
                          No team IDs configured - digest will not track activity
                        </p>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter team IDs (comma-separated)"
                          value={teamIdsInput[account.accountName] || ''}
                          onChange={(e) => setTeamIdsInput({ ...teamIdsInput, [account.accountName]: e.target.value })}
                          className="flex-1 px-3 py-2 text-sm border border-figma-border rounded focus:outline-none focus:ring-2 focus:ring-figma-primary"
                        />
                        <button
                          onClick={() => handleUpdateTeamIds(account.accountName)}
                          disabled={loading[account.accountName]}
                          className="px-4 py-2 bg-figma-primary hover:bg-figma-primary-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
                        >
                          {loading[account.accountName] ? 'Updating...' : 'Update'}
                        </button>
                      </div>
                      <p className="text-xs text-figma-text-tertiary mt-2">
                        Find team IDs in your Figma team URLs: figma.com/files/TEAM_ID/...
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-figma-text mb-4">How it works</h2>
            <ul className="space-y-2 text-sm text-figma-text-secondary">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>The digest runs automatically every 24 hours via cron job</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>It tracks file edits, comments, and version history across your configured teams</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Activity is filtered to show only what's relevant to you</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Summaries are posted to your configured Slack channel</span>
              </li>
            </ul>
          </div>

          <div className="bg-figma-panel border border-figma-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-figma-text mb-2">Manual Digest</h3>
            <p className="text-sm text-figma-text-secondary">
              Test the digest manually:{' '}
              <a 
                href="/api/run-figma-digest" 
                target="_blank" 
                className="text-figma-primary hover:underline"
              >
                /api/run-figma-digest
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
