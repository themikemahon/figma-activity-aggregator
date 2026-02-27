import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import ConfigInterface from './ConfigInterface';
import { Storage } from '@/lib/storage';

export default async function ConfigPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/auth/signin');
  }

  const storage = new Storage(process.env.ENCRYPTION_KEY!);
  const accounts = await storage.getUserAccounts(session.user.email);

  const connectedAccounts = accounts.map(account => ({
    accountName: account.accountName,
    email: account.accountName,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    teamIds: account.teamIds || [],
  }));

  return (
    <div className="min-h-screen bg-figma-bg">
      <ConfigInterface
        accounts={connectedAccounts}
        userEmail={session.user.email}
        userName={session.user.name || 'User'}
      />
    </div>
  );
}
