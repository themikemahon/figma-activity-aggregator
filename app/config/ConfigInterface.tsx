'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

interface MaskedAccount {
  accountName: string;
  maskedPAT: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConfigInterfaceProps {
  initialAccounts: MaskedAccount[];
  userEmail: string;
}

export default function ConfigInterface({ initialAccounts, userEmail }: ConfigInterfaceProps) {
  const [accounts, setAccounts] = useState<MaskedAccount[]>(initialAccounts);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newPAT, setNewPAT] = useState('');
  const [newTeamIds, setNewTeamIds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      // Parse team IDs from comma-separated string
      const teamIds = newTeamIds
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

      const response = await fetch('/api/config/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: newAccountName,
          pat: newPAT,
          teamIds: teamIds.length > 0 ? teamIds : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add account');
      }

      setSuccess(`Account "${newAccountName}" added successfully!`);
      setNewAccountName('');
      setNewPAT('');
      setNewTeamIds('');
      setIsAddingAccount(false);

      // Refresh accounts list
      const accountsResponse = await fetch('/api/config/accounts');
      const accountsData = await accountsResponse.json();
      setAccounts(accountsData.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async (accountName: string) => {
    if (!confirm(`Are you sure you want to delete account "${accountName}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/config/accounts/${encodeURIComponent(accountName)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      setSuccess(`Account "${accountName}" deleted successfully!`);

      // Refresh accounts list
      const accountsResponse = await fetch('/api/config/accounts');
      const accountsData = await accountsResponse.json();
      setAccounts(accountsData.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getExpirationStatus = (expiresAt: string | null) => {
    if (!expiresAt) return { text: 'Unknown', color: '#666' };

    const expirationDate = new Date(expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { text: 'Expired', color: '#d32f2f' };
    } else if (daysUntilExpiry <= 3) {
      return { text: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`, color: '#f57c00' };
    } else {
      return { text: `Expires ${expirationDate.toLocaleDateString()}`, color: '#388e3c' };
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: '#666' }}>Logged in as: {userEmail}</p>
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

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#e8f5e9',
          color: '#2e7d32',
          borderRadius: '4px',
        }}>
          {success}
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h2>Your Figma Accounts</h2>
        
        {accounts.length === 0 ? (
          <p style={{ color: '#666' }}>No accounts configured yet. Add your first account below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {accounts.map(account => {
              const expirationStatus = getExpirationStatus(account.expiresAt);
              
              return (
                <div
                  key={account.accountName}
                  style={{
                    padding: '1rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>{account.accountName}</h3>
                    <p style={{ margin: '0.25rem 0', color: '#666', fontSize: '0.9rem' }}>
                      PAT: <code>{account.maskedPAT}</code>
                    </p>
                    <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: expirationStatus.color }}>
                      {expirationStatus.text}
                    </p>
                    <p style={{ margin: '0.25rem 0', color: '#999', fontSize: '0.85rem' }}>
                      Added: {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteAccount(account.accountName)}
                    disabled={isLoading}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#d32f2f',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        {!isAddingAccount ? (
          <button
            onClick={() => setIsAddingAccount(true)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            + Add Figma Account
          </button>
        ) : (
          <div style={{
            padding: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            backgroundColor: '#f5f5f5',
          }}>
            <h3>Add New Figma Account</h3>
            <form onSubmit={handleAddAccount}>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="accountName" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Account Name
                </label>
                <input
                  id="accountName"
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g., gen, clientA, personal"
                  required
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '1rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="pat" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Personal Access Token (PAT)
                </label>
                <input
                  id="pat"
                  type="password"
                  value={newPAT}
                  onChange={(e) => setNewPAT(e.target.value)}
                  placeholder="figd_..."
                  required
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '1rem',
                  }}
                />
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                  Your PAT will be encrypted and stored securely. 
                  <a 
                    href="https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#1976d2', marginLeft: '0.25rem' }}
                  >
                    Learn how to create a PAT
                  </a>
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="teamIds" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Team IDs (comma-separated)
                </label>
                <textarea
                  id="teamIds"
                  value={newTeamIds}
                  onChange={(e) => setNewTeamIds(e.target.value)}
                  placeholder="1234567890123456789, 9876543210987654321"
                  disabled={isLoading}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                  }}
                />
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                  Find team IDs in Figma URLs: figma.com/files/team/[TEAM_ID]/...
                  <br />
                  Add multiple teams separated by commas to track activity across all of them.
                  <br />
                  <strong>Important:</strong> Copy team IDs exactly as they appear in the URL to preserve precision.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  {isLoading ? 'Validating...' : 'Add Account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingAccount(false);
                    setNewAccountName('');
                    setNewPAT('');
                    setNewTeamIds('');
                    setError(null);
                  }}
                  disabled={isLoading}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#666',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
