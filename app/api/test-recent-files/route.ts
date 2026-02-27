import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';
import { FigmaClient } from '@/lib/figmaClient';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const accounts = await storage.getUserAccounts(session.user.email);
    
    if (accounts.length === 0) {
      return NextResponse.json({ error: 'No accounts found' }, { status: 404 });
    }

    // Use the first account
    const account = accounts[0];
    const accessToken = storage.decryptPAT(account.encryptedPAT);
    
    const figmaClient = new FigmaClient({
      accessToken,
      accountName: account.accountName,
    });

    // Try different endpoints
    const results: any = {
      accountName: account.accountName,
      endpoints: {},
    };

    // Try /files/recent
    try {
      const recentFiles = await figmaClient.getRecentFiles();
      results.endpoints['/files/recent'] = {
        success: true,
        data: recentFiles,
      };
    } catch (error: any) {
      results.endpoints['/files/recent'] = {
        success: false,
        error: error.message,
        status: error.status,
      };
    }

    // Try /me/files/recent
    try {
      const response = await fetch('https://api.figma.com/v1/me/files/recent', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      const data = await response.json();
      results.endpoints['/me/files/recent'] = {
        success: response.ok,
        status: response.status,
        data: response.ok ? data : undefined,
        error: !response.ok ? data : undefined,
      };
    } catch (error: any) {
      results.endpoints['/me/files/recent'] = {
        success: false,
        error: error.message,
      };
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
