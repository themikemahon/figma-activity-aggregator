// Debug script to check what's actually in Redis
const { kv } = require('@vercel/kv');

async function debugStorage() {
  console.log('=== DEBUGGING STORAGE ===\n');
  
  // Get all users
  const users = await kv.smembers('users');
  console.log('Users:', users);
  
  for (const userId of users) {
    console.log(`\n--- User: ${userId} ---`);
    
    // Get accounts for this user
    const accounts = await kv.smembers(`user:${userId}:accounts`);
    console.log('Accounts:', accounts);
    
    for (const accountName of accounts) {
      console.log(`\n  Account: ${accountName}`);
      
      // Get all data for this account
      const pat = await kv.get(`user:${userId}:account:${accountName}:pat`);
      const teamIds = await kv.get(`user:${userId}:account:${accountName}:teamIds`);
      const createdAt = await kv.get(`user:${userId}:account:${accountName}:createdAt`);
      const updatedAt = await kv.get(`user:${userId}:account:${accountName}:updatedAt`);
      const expires = await kv.get(`user:${userId}:account:${accountName}:expires`);
      const lastDigest = await kv.get(`user:${userId}:account:${accountName}:lastDigest`);
      
      console.log('  - PAT:', pat ? `${pat.substring(0, 20)}...` : 'null');
      console.log('  - Team IDs:', teamIds);
      console.log('  - Created:', createdAt);
      console.log('  - Updated:', updatedAt);
      console.log('  - Expires:', expires);
      console.log('  - Last Digest:', lastDigest);
    }
  }
  
  console.log('\n=== END DEBUG ===');
}

debugStorage().catch(console.error);
