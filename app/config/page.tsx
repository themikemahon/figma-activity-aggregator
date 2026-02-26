import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';
import ConfigInterface from '@/app/config/ConfigInterface';

/**
 * Configuration page for managing Figma PATs
 * Protected by authentication - redirects to sign-in if not authenticated
 */
export default async function ConfigPage() {
  const session = await getServerSession(authOptions);

  // Redirect to sign-in if not authenticated
  if (!session || !session.user) {
    redirect('/auth/signin');
  }

  // Get user's configured accounts
  const storage = new Storage(process.env.ENCRYPTION_KEY!);
  const accounts = await storage.getUserAccounts(session.user.id);

  // Mask PAT values (show only last 4 characters)
  const maskedAccounts = accounts.map(account => ({
    accountName: account.accountName,
    maskedPAT: `****...${storage.decryptPAT(account.encryptedPAT).slice(-4)}`,
    expiresAt: account.expiresAt || null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }));

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Figma Account Configuration</h1>
      <p>Manage your Figma Personal Access Tokens (PATs) for activity tracking.</p>
      
      <ConfigInterface 
        initialAccounts={maskedAccounts}
        userEmail={session.user.email || ''}
      />
    </main>
  );
}
