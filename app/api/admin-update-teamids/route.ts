import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { accountName, teamIds } = await request.json();
    
    if (!accountName || !Array.isArray(teamIds)) {
      return NextResponse.json({ error: 'accountName and teamIds array required' }, { status: 400 });
    }

    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const accounts = await storage.getUserAccounts(session.user.email);
    const account = accounts.find(a => a.accountName === accountName);
    
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await storage.saveUserAccount({
      ...account,
      teamIds: teamIds.map(String),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ 
      success: true, 
      message: `Team IDs updated for "${accountName}"`,
      teamIds,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
