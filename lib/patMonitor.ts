/**
 * PAT Monitor - Checks PAT expiration status and generates notifications
 */

import { FigmaClient, FigmaUser } from './figmaClient';
import { Storage, UserAccount } from './storage';
import { SlackPoster } from './slack';
import { createLogger } from './logger';

const logger = createLogger('PATMonitor');

/**
 * PAT status information
 */
export interface PATStatus {
  userId: string;
  accountName: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  needsWarning: boolean;  // true if expires within 3 days
}

/**
 * PATMonitor checks PAT expiration status and generates notifications
 */
export class PATMonitor {
  private storage: Storage;
  private slackPoster: SlackPoster;
  private warningThresholdDays: number = 3;

  constructor(storage: Storage, slackPoster: SlackPoster) {
    this.storage = storage;
    this.slackPoster = slackPoster;
  }

  /**
   * Check expiration for a single PAT
   */
  async checkPATExpiration(
    userId: string,
    accountName: string,
    pat: string
  ): Promise<PATStatus> {
    logger.debug('Checking PAT expiration', {
      operation: 'checkPATExpiration',
      userId,
      accountName,
    });

    try {
      // Create Figma client and fetch user info
      const figmaClient = new FigmaClient({
        accessToken: pat,
        accountName,
      });

      const figmaUser = await figmaClient.getMe();
      const expiresAt = PATMonitor.extractExpiration(figmaUser);

      // Calculate days until expiry
      let daysUntilExpiry: number | null = null;
      let isExpired = false;
      let needsWarning = false;

      if (expiresAt) {
        const expirationDate = new Date(expiresAt);
        const now = new Date();
        const diffMs = expirationDate.getTime() - now.getTime();
        daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        isExpired = daysUntilExpiry <= 0;
        needsWarning = daysUntilExpiry <= this.warningThresholdDays;

        if (needsWarning) {
          logger.warn('PAT expiration warning', {
            operation: 'checkPATExpiration',
            userId,
            accountName,
            expiresAt,
            daysUntilExpiry,
            isExpired,
          });
        }
      }

      logger.info('PAT expiration check completed', {
        operation: 'checkPATExpiration',
        userId,
        accountName,
        expiresAt,
        daysUntilExpiry,
        needsWarning,
      });

      return {
        userId,
        accountName,
        expiresAt,
        daysUntilExpiry,
        isExpired,
        needsWarning,
      };
    } catch (error) {
      logger.partialFailure(
        'Failed to check PAT expiration, assuming expired',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          operation: 'checkPATExpiration',
          userId,
          accountName,
        }
      );

      // If we can't check the PAT, assume it's expired
      return {
        userId,
        accountName,
        expiresAt: null,
        daysUntilExpiry: null,
        isExpired: true,
        needsWarning: true,
      };
    }
  }

  /**
   * Check all PATs and return those needing warnings
   */
  async checkAllPATs(): Promise<PATStatus[]> {
    logger.info('Checking all PATs for expiration', {
      operation: 'checkAllPATs',
    });

    const allAccounts = await this.storage.getAllUserAccounts();
    const statuses: PATStatus[] = [];

    logger.info(`Found ${allAccounts.length} accounts to check`, {
      operation: 'checkAllPATs',
      accountCount: allAccounts.length,
    });

    for (const account of allAccounts) {
      const decryptedPAT = this.storage.decryptPAT(account.encryptedPAT);
      const status = await this.checkPATExpiration(
        account.userId,
        account.accountName,
        decryptedPAT
      );

      // Only include statuses that need warnings
      if (status.needsWarning) {
        statuses.push(status);
      }
    }

    logger.info('PAT expiration check completed', {
      operation: 'checkAllPATs',
      totalAccounts: allAccounts.length,
      warningsNeeded: statuses.length,
    });

    return statuses;
  }

  /**
   * Post consolidated warnings for all expiring/expired PATs
   * Consolidates multiple warnings into a single message
   */
  async postConsolidatedWarnings(statuses: PATStatus[]): Promise<void> {
    if (statuses.length === 0) {
      return;
    }

    // Separate expired and expiring PATs
    const expired = statuses.filter(s => s.isExpired);
    const expiring = statuses.filter(s => !s.isExpired && s.needsWarning);

    // Build consolidated message
    let message = '';

    if (expired.length > 0) {
      message += '🚨 URGENT: Expired Figma PATs\n\n';
      for (const status of expired) {
        message += `• User: ${status.userId}, Account: ${status.accountName}\n`;
        if (status.expiresAt) {
          message += `  Expired: ${status.expiresAt}\n`;
        }
      }
      message += '\nAction required: Please update these PATs immediately to continue receiving activity updates.\n';
    }

    if (expiring.length > 0) {
      if (message.length > 0) {
        message += '\n\n';
      }
      message += '⚠️ WARNING: Figma PATs Expiring Soon\n\n';
      for (const status of expiring) {
        message += `• User: ${status.userId}, Account: ${status.accountName}\n`;
        if (status.expiresAt) {
          message += `  Expires: ${status.expiresAt}`;
          if (status.daysUntilExpiry !== null) {
            message += ` (${status.daysUntilExpiry} days remaining)`;
          }
          message += '\n';
        }
      }
      message += '\nAction required: Please renew these PATs before they expire.\n';
    }

    // Post consolidated message to Slack
    await this.slackPoster.postMessage({ text: message });
  }

  /**
   * Check all PATs and post warnings if needed
   * This is the main method to be called during digest runs
   */
  async checkAndNotify(): Promise<PATStatus[]> {
    const statuses = await this.checkAllPATs();
    
    if (statuses.length > 0) {
      await this.postConsolidatedWarnings(statuses);
    }

    return statuses;
  }

  /**
   * Extract expiration date from Figma API response
   * Note: Figma API may not always include expiration information
   */
  static extractExpiration(figmaUser: FigmaUser): string | null {
    // The Figma API response structure may vary
    // Check if the user object has an expiration field
    const userWithExpiration = figmaUser as any;
    
    // Common field names that might contain expiration info
    if (userWithExpiration.expires_at) {
      return userWithExpiration.expires_at;
    }
    
    if (userWithExpiration.expiresAt) {
      return userWithExpiration.expiresAt;
    }
    
    if (userWithExpiration.expiration) {
      return userWithExpiration.expiration;
    }

    // If no expiration information is available, return null
    return null;
  }
}
