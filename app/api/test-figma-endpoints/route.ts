import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';

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

    const account = accounts[0];
    const accessToken = storage.decryptPAT(account.encryptedPAT);
    const teamId = account.teamIds?.[0];

    const results: any = {
      accountName: account.accountName,
      teamId,
      tests: {},
    };

    // Test /me
    try {
      const res = await fetch('https://api.figma.com/v1/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      results.tests['/me'] = {
        status: res.status,
        ok: res.ok,
        data: res.ok ? await res.json() : await res.text(),
      };
    } catch (e: any) {
      results.tests['/me'] = { error: e.message };
    }

    if (teamId) {
      // Test /teams/:id/projects
      try {
        const res = await fetch(`https://api.figma.com/v1/teams/${teamId}/projects`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        results.tests[`/teams/${teamId}/projects`] = {
          status: res.status,
          ok: res.ok,
          data: res.ok ? await res.json() : await res.text(),
        };
      } catch (e: any) {
        results.tests[`/teams/${teamId}/projects`] = { error: e.message };
      }

      // Test a known file
      const testFileKey = 'a6HXk2Axkvfcb5N5FpWmYD';
      try {
        const res = await fetch(`https://api.figma.com/v1/files/${testFileKey}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        results.tests[`/files/${testFileKey}`] = {
          status: res.status,
          ok: res.ok,
          data: res.ok ? 'File accessible' : await res.text(),
        };
      } catch (e: any) {
        results.tests[`/files/${testFileKey}`] = { error: e.message };
      }

      // Test file versions
      try {
        const res = await fetch(`https://api.figma.com/v1/files/${testFileKey}/versions`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        results.tests[`/files/${testFileKey}/versions`] = {
          status: res.status,
          ok: res.ok,
          data: res.ok ? 'Versions accessible' : await res.text(),
        };
      } catch (e: any) {
        results.tests[`/files/${testFileKey}/versions`] = { error: e.message };
      }

      // Test file comments
      try {
        const res = await fetch(`https://api.figma.com/v1/files/${testFileKey}/comments`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        results.tests[`/files/${testFileKey}/comments`] = {
          status: res.status,
          ok: res.ok,
          data: res.ok ? 'Comments accessible' : await res.text(),
        };
      } catch (e: any) {
        results.tests[`/files/${testFileKey}/comments`] = { error: e.message };
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
