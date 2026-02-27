/**
 * Storage layer for managing user accounts, PATs, and digest state
 * Uses Vercel KV (Redis-compatible) for persistence
 * Implements encryption for sensitive data (PATs)
 */

import { kv } from '@vercel/kv';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createLogger } from './logger';

const logger = createLogger('Storage');

/**
 * User account with encrypted PAT
 */
export interface UserAccount {
  userId: string;
  accountName: string;
  encryptedPAT: string;
  teamIds?: string[];  // Figma team IDs to track
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;  // PAT expiration date if known
}

/**
 * Digest state tracking
 */
export interface DigestState {
  userId: string;
  accountName: string;
  lastDigestAt: string;  // ISO 8601
}

/**
 * Storage class for managing persistent data
 * 
 * Key patterns:
 * - user:{userId}:accounts → Set of account names
 * - user:{userId}:account:{accountName}:pat → Encrypted PAT
 * - user:{userId}:account:{accountName}:expires → Expiration timestamp
 * - user:{userId}:account:{accountName}:lastDigest → Last digest timestamp
 * - user:{userId}:account:{accountName}:createdAt → Creation timestamp
 * - user:{userId}:account:{accountName}:updatedAt → Update timestamp
 * - users → Set of all user IDs
 */
export class Storage {
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor(encryptionKey: string) {
    // Ensure encryption key is 32 bytes for AES-256
    if (encryptionKey.length !== 64) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters)');
    }
    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
  }

  /**
   * Generate storage keys for user accounts
   */
  private keys = {
    users: () => 'users',
    userAccounts: (userId: string) => `user:${userId}:accounts`,
    accountPAT: (userId: string, accountName: string) => 
      `user:${userId}:account:${accountName}:pat`,
    accountTeamIds: (userId: string, accountName: string) => 
      `user:${userId}:account:${accountName}:teamIds`,
    accountExpires: (userId: string, accountName: string) => 
      `user:${userId}:account:${accountName}:expires`,
    accountLastDigest: (userId: string, accountName: string) => 
      `user:${userId}:account:${accountName}:lastDigest`,
    accountCreatedAt: (userId: string, accountName: string) => 
      `user:${userId}:account:${accountName}:createdAt`,
    accountUpdatedAt: (userId: string, accountName: string) => 
      `user:${userId}:account:${accountName}:updatedAt`,
  };

  /**
   * Encrypt a PAT using AES-256-GCM
   * Returns encrypted data with IV prepended: {iv}:{authTag}:{encrypted}
   */
  encryptPAT(pat: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv) as any;
    
    let encrypted = cipher.update(pat, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a PAT using AES-256-GCM
   */
  decryptPAT(encryptedPAT: string): string {
    const parts = encryptedPAT.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted PAT format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv) as any;
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Save or update a user account with encrypted PAT
   */
  async saveUserAccount(account: UserAccount): Promise<void> {
    const { userId, accountName, encryptedPAT, teamIds, createdAt, updatedAt, expiresAt } = account;

    logger.info('Saving user account', {
      operation: 'saveUserAccount',
      userId,
      accountName,
      hasTeamIds: !!teamIds && teamIds.length > 0,
    });

    try {
      // Add user to users set
      await kv.sadd(this.keys.users(), userId);

      // Add account to user's accounts set
      await kv.sadd(this.keys.userAccounts(userId), accountName);

      // Store encrypted PAT
      await kv.set(this.keys.accountPAT(userId, accountName), encryptedPAT);

      // Store team IDs if provided  
      // CRITICAL: Double-stringify to prevent Vercel KV from parsing numbers
      // Vercel KV does JSON.stringify on set and JSON.parse on get
      // So we pre-stringify to keep it as a string through the round-trip
      if (teamIds && teamIds.length > 0) {
        // Ensure teamIds is an array of strings
        const teamIdsArray = Array.isArray(teamIds) ? teamIds : [teamIds];
        const teamIdsStrings = teamIdsArray.map(id => String(id));
        
        // Double-stringify: first stringify creates the JSON array string,
        // second stringify (done by kv.set) wraps it in quotes
        const teamIdsValue = JSON.stringify(teamIdsStrings);
        await kv.set(this.keys.accountTeamIds(userId, accountName), teamIdsValue);
        
        console.log('[STORAGE SAVE DEBUG]', {
          accountName,
          originalTeamIds: teamIds,
          teamIdsStrings,
          storingValue: teamIdsValue,
        });
      }

      // Store timestamps
      await kv.set(this.keys.accountCreatedAt(userId, accountName), createdAt);
      await kv.set(this.keys.accountUpdatedAt(userId, accountName), updatedAt);

      // Store expiration if provided
      if (expiresAt) {
        await kv.set(this.keys.accountExpires(userId, accountName), expiresAt);
      }

      logger.info('User account saved successfully', {
        operation: 'saveUserAccount',
        userId,
        accountName,
        teamIdsCount: teamIds?.length || 0,
      });
    } catch (error) {
      logger.fatalError(
        'Failed to save user account',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          operation: 'saveUserAccount',
          userId,
          accountName,
        }
      );
      throw error;
    }
  }

  /**
   * Get all accounts for a specific user
   */
  async getUserAccounts(userId: string): Promise<UserAccount[]> {
    const accountNames = await kv.smembers(this.keys.userAccounts(userId));
    
    if (!accountNames || accountNames.length === 0) {
      return [];
    }

    const accounts: UserAccount[] = [];

    for (const accountName of accountNames) {
      const encryptedPAT = await kv.get<string>(this.keys.accountPAT(userId, accountName));
      const teamIdsJson = await kv.get<string>(this.keys.accountTeamIds(userId, accountName));
      const createdAt = await kv.get<string>(this.keys.accountCreatedAt(userId, accountName));
      const updatedAt = await kv.get<string>(this.keys.accountUpdatedAt(userId, accountName));
      const expiresAt = await kv.get<string>(this.keys.accountExpires(userId, accountName));

      // DEBUG: Log what Redis actually returned
      console.log('[STORAGE DEBUG] Raw from Redis:', {
        accountName,
        teamIdsJson,
        teamIdsJsonType: typeof teamIdsJson,
      });

      if (encryptedPAT && createdAt && updatedAt) {
        // CRITICAL: Vercel KV already returns parsed data
        // If it's already an array, don't parse again - just ensure strings
        let teamIds: string[] | undefined = undefined;
        if (teamIdsJson) {
          try {
            if (Array.isArray(teamIdsJson)) {
              // Already an array - just ensure all elements are strings
              teamIds = teamIdsJson.map((id: any) => String(id));
            } else if (typeof teamIdsJson === 'string') {
              // It's a string, parse it
              const parsed = JSON.parse(teamIdsJson);
              if (Array.isArray(parsed)) {
                teamIds = parsed.map((id: any) => String(id));
              } else {
                teamIds = [String(parsed)];
              }
            } else {
              // Single value
              teamIds = [String(teamIdsJson)];
            }
            
            console.log('[STORAGE DEBUG] Parsed teamIds:', teamIds);
          } catch (e) {
            logger.warn('Failed to parse team IDs', {
              operation: 'getUserAccounts',
              userId,
              accountName,
              error: e instanceof Error ? e.message : 'Unknown error',
            });
            teamIds = undefined;
          }
        }
        
        accounts.push({
          userId,
          accountName,
          encryptedPAT,
          teamIds,
          createdAt,
          updatedAt,
          expiresAt: expiresAt || undefined,
        });
      }
    }

    return accounts;
  }

  /**
   * Get all user accounts across all users
   */
  async getAllUserAccounts(): Promise<UserAccount[]> {
    const userIds = await kv.smembers(this.keys.users());
    
    if (!userIds || userIds.length === 0) {
      return [];
    }

    const allAccounts: UserAccount[] = [];

    for (const userId of userIds) {
      const userAccounts = await this.getUserAccounts(userId);
      allAccounts.push(...userAccounts);
    }

    return allAccounts;
  }

  /**
   * Delete a user account and all associated data
   */
  async deleteUserAccount(userId: string, accountName: string): Promise<void> {
    logger.info('Deleting user account', {
      operation: 'deleteUserAccount',
      userId,
      accountName,
    });

    try {
      // Remove account from user's accounts set
      await kv.srem(this.keys.userAccounts(userId), accountName);

      // Delete all account data
      await kv.del(this.keys.accountPAT(userId, accountName));
      await kv.del(this.keys.accountTeamIds(userId, accountName));
      await kv.del(this.keys.accountExpires(userId, accountName));
      await kv.del(this.keys.accountLastDigest(userId, accountName));
      await kv.del(this.keys.accountCreatedAt(userId, accountName));
      await kv.del(this.keys.accountUpdatedAt(userId, accountName));

      // If user has no more accounts, remove from users set
      const remainingAccounts = await kv.smembers(this.keys.userAccounts(userId));
      if (!remainingAccounts || remainingAccounts.length === 0) {
        await kv.srem(this.keys.users(), userId);
        await kv.del(this.keys.userAccounts(userId));
      }

      logger.info('User account deleted successfully', {
        operation: 'deleteUserAccount',
        userId,
        accountName,
      });
    } catch (error) {
      logger.fatalError(
        'Failed to delete user account',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          operation: 'deleteUserAccount',
          userId,
          accountName,
        }
      );
      throw error;
    }
  }

  /**
   * Get last digest timestamp for a user account
   */
  async getLastDigestTime(userId: string, accountName: string): Promise<string | null> {
    const timestamp = await kv.get<string>(this.keys.accountLastDigest(userId, accountName));
    return timestamp || null;
  }

  /**
   * Update last digest timestamp for a user account
   */
  async updateLastDigestTime(userId: string, accountName: string, timestamp: string): Promise<void> {
    await kv.set(this.keys.accountLastDigest(userId, accountName), timestamp);
  }
}

  /**
   * Store webhook event
   */
  async storeWebhookEvent(event: {
    key: string;
    eventType: string;
    fileKey: string;
    fileName: string;
    teamId: string;
    triggeredBy: any;
    timestamp: string;
    rawEvent: any;
  }): Promise<void> {
    // Store with 7 day TTL
    await kv.set(event.key, JSON.stringify(event), { ex: 7 * 24 * 60 * 60 });
    
    // Add to daily events set
    const dateKey = event.timestamp.split('T')[0]; // YYYY-MM-DD
    await kv.sadd(`webhook:events:${dateKey}`, event.key);
    await kv.expire(`webhook:events:${dateKey}`, 8 * 24 * 60 * 60); // 8 days TTL
  }

  /**
   * Get webhook events for a specific date
   */
  async getWebhookEvents(date: string): Promise<any[]> {
    const eventKeys = await kv.smembers(`webhook:events:${date}`);
    const events = [];
    
    for (const key of eventKeys) {
      const eventData = await kv.get(key);
      if (eventData) {
        events.push(typeof eventData === 'string' ? JSON.parse(eventData) : eventData);
      }
    }
    
    return events;
  }

  /**
   * Store webhook subscription
   */
  async storeWebhookSubscription(subscription: {
    webhookId: string;
    teamId: string;
    userId: string;
    accountName: string;
    createdAt: string;
  }): Promise<void> {
    await kv.set(
      `webhook:subscription:${subscription.webhookId}`,
      JSON.stringify(subscription)
    );
    
    // Track subscriptions by user
    await kv.sadd(
      `user:${subscription.userId}:webhooks`,
      subscription.webhookId
    );
  }

  /**
   * Get user's webhook subscriptions
   */
  async getUserWebhooks(userId: string): Promise<any[]> {
    const webhookIds = await kv.smembers(`user:${userId}:webhooks`);
    const webhooks = [];
    
    for (const id of webhookIds) {
      const webhook = await kv.get(`webhook:subscription:${id}`);
      if (webhook) {
        webhooks.push(typeof webhook === 'string' ? JSON.parse(webhook) : webhook);
      }
    }
    
    return webhooks;
  }

  /**
   * Delete webhook subscription
   */
  async deleteWebhookSubscription(webhookId: string, userId: string): Promise<void> {
    await kv.del(`webhook:subscription:${webhookId}`);
    await kv.srem(`user:${userId}:webhooks`, webhookId);
  }
}
