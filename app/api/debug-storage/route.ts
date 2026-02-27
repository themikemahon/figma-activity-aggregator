import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET() {
  try {
    const debug: any = {};
    
    // Get all users
    const users = await kv.smembers('users');
    debug.users = users;
    debug.accounts = [];
    
    for (const userId of users) {
      // Get accounts for this user
      const accounts = await kv.smembers(`user:${userId}:accounts`);
      
      for (const accountName of accounts) {
        // Get all data for this account
        const pat = await kv.get(`user:${userId}:account:${accountName}:pat`);
        const teamIds = await kv.get(`user:${userId}:account:${accountName}:teamIds`);
        const createdAt = await kv.get(`user:${userId}:account:${accountName}:createdAt`);
        const updatedAt = await kv.get(`user:${userId}:account:${accountName}:updatedAt`);
        const expires = await kv.get(`user:${userId}:account:${accountName}:expires`);
        const lastDigest = await kv.get(`user:${userId}:account:${accountName}:lastDigest`);
        
        debug.accounts.push({
          userId,
          accountName,
          hasPAT: !!pat,
          patPreview: pat ? `${String(pat).substring(0, 20)}...` : null,
          teamIds,
          teamIdsParsed: teamIds ? JSON.parse(String(teamIds)) : null,
          createdAt,
          updatedAt,
          expires,
          lastDigest,
        });
      }
    }
    
    return NextResponse.json(debug, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
