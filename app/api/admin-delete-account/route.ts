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

    const { accountName } = await request.json();
    
    if (!accountName) {
      return NextResponse.json({ error: 'accountName required' }, { status: 400 });
    }

    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    await storage.deleteUserAccount(session.user.email, accountName);

    return NextResponse.json({ 
      success: true, 
      message: `Account "${accountName}" deleted`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
