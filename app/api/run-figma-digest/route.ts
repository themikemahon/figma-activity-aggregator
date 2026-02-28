/**
 * Digest Endpoint - Triggers activity collection and posting to Slack
 * 
 * This API route orchestrates the entire digest process:
 * 1. Retrieve all user accounts from storage
 * 2. Process each account (fetch activity, normalize events)
 * 3. Check PAT expiration status
 * 4. Generate summaries and post to Slack
 * 5. Update digest timestamps
 */

import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';
import { FigmaClient, FigmaAPIError, FigmaUser, FigmaFile } from '@/lib/figmaClient';
import { ActivityNormalizer, ActivityEvent } from '@/lib/activity';
import { SummaryGenerator } from '@/lib/summary';
import { SlackPoster } from '@/lib/slack';
import { PATMonitor } from '@/lib/patMonitor';
import { createLogger } from '@/lib/logger';

const logger = createLogger('DigestEndpoint');

/**
 * Response structure for digest endpoint
 */
export interface DigestResponse {
  success: boolean;
  eventsProcessed: number;
  accountsProcessed: number;
  errors: string[];
  duration: number;  // milliseconds
}

/**
 * Result from processing a single account
 */
interface AccountResult {
  userId: string;
  accountName: string;
  events: ActivityEvent[];
  error?: string;
}

/**
 * GET /api/run-figma-digest
 * Triggers the digest generation process
 */
export async function GET(request: NextRequest): Promise<NextResponse<DigestResponse>> {
  const startTime = Date.now();
  
  logger.info('Digest process started', {
    operation: 'GET',
  });
  
  try {
    // Validate required environment variables
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!encryptionKey) {
      logger.fatalError(
        'Missing ENCRYPTION_KEY environment variable',
        new Error('Missing ENCRYPTION_KEY'),
        { operation: 'GET' }
      );
      
      return NextResponse.json(
        {
          success: false,
          eventsProcessed: 0,
          accountsProcessed: 0,
          errors: ['Missing ENCRYPTION_KEY environment variable'],
          duration: Date.now() - startTime,
        },
        { status: 500 }
      );
    }
    
    if (!slackWebhookUrl) {
      logger.fatalError(
        'Missing SLACK_WEBHOOK_URL environment variable',
        new Error('Missing SLACK_WEBHOOK_URL'),
        { operation: 'GET' }
      );
      
      return NextResponse.json(
        {
          success: false,
          eventsProcessed: 0,
          accountsProcessed: 0,
          errors: ['Missing SLACK_WEBHOOK_URL environment variable'],
          duration: Date.now() - startTime,
        },
        { status: 500 }
      );
    }
    
    // Initialize components
    const storage = new Storage(encryptionKey);
    const slackPoster = new SlackPoster({ webhookUrl: slackWebhookUrl });
    const patMonitor = new PATMonitor(storage, slackPoster);
    
    // Retrieve all user accounts
    const allAccounts = await storage.getAllUserAccounts();
    
    // DEBUG: Log what we actually got from storage
    console.log('[DIGEST DEBUG] Raw accounts from storage:', JSON.stringify(allAccounts, null, 2));
    
    logger.info(`Found ${allAccounts.length} accounts to process`, {
      operation: 'GET',
      accountCount: allAccounts.length,
    });
    
    if (allAccounts.length === 0) {
      logger.info('No accounts configured, digest completed', {
        operation: 'GET',
      });
      
      return NextResponse.json({
        success: true,
        eventsProcessed: 0,
        accountsProcessed: 0,
        errors: [],
        duration: Date.now() - startTime,
      });
    }
    
    // Process accounts with concurrency limit
    const results = await processAccountsWithConcurrency(
      allAccounts,
      storage,
      3  // Concurrency limit
    );
    
    // Check PAT expiration status
    const patStatuses = await patMonitor.checkAndNotify();
    
    // Aggregate all events
    const allEvents: ActivityEvent[] = [];
    const errors: string[] = [];
    let accountsProcessed = 0;
    
    for (const result of results) {
      if (result.error) {
        errors.push(`${result.accountName}: ${result.error}`);
        logger.partialFailure(
          'Account processing failed',
          new Error(result.error),
          {
            operation: 'GET',
            userId: result.userId,
            accountName: result.accountName,
          }
        );
      } else {
        allEvents.push(...result.events);
        accountsProcessed++;
        logger.info('Account processed successfully', {
          operation: 'GET',
          userId: result.userId,
          accountName: result.accountName,
          eventsFound: result.events.length,
        });
      }
    }
    
    // Generate and post summaries if we have events
    if (allEvents.length > 0) {
      logger.info('Generating and posting summaries', {
        operation: 'GET',
        eventCount: allEvents.length,
      });
      
      const summaries = SummaryGenerator.generatePerEventSummaries(allEvents);
      await slackPoster.postMessages(summaries);
    }
    
    // Update digest timestamps for successful accounts
    const now = new Date().toISOString();
    for (const result of results) {
      if (!result.error) {
        await storage.updateLastDigestTime(result.userId, result.accountName, now);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Log summary statistics
    logger.info('Digest completed successfully', {
      operation: 'GET',
      eventsProcessed: allEvents.length,
      accountsProcessed,
      totalAccounts: allAccounts.length,
      errors: errors.length,
      patWarnings: patStatuses.length,
      duration,
    });
    
    return NextResponse.json({
      success: errors.length === 0,
      eventsProcessed: allEvents.length,
      accountsProcessed,
      errors,
      duration,
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.fatalError(
      'Digest process failed',
      error instanceof Error ? error : new Error('Unknown error'),
      {
        operation: 'GET',
        duration,
      }
    );
    
    return NextResponse.json(
      {
        success: false,
        eventsProcessed: 0,
        accountsProcessed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        duration,
      },
      { status: 500 }
    );
  }
}

/**
 * Process accounts with concurrency limit
 * Processes accounts in parallel batches to avoid overwhelming the Figma API
 */
async function processAccountsWithConcurrency(
  accounts: any[],
  storage: Storage,
  concurrency: number
): Promise<AccountResult[]> {
  const results: AccountResult[] = [];
  
  // Process accounts in chunks
  for (let i = 0; i < accounts.length; i += concurrency) {
    const chunk = accounts.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map(account => processAccount(account, storage))
    );
    
    // Extract results from settled promises
    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Handle rejected promises
        results.push({
          userId: 'unknown',
          accountName: 'unknown',
          events: [],
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        });
      }
    }
  }
  
  return results;
}

/**
 * Process a single account
 * Fetches activity since last digest and normalizes events
 */
async function processAccount(
  account: any,
  storage: Storage
): Promise<AccountResult> {
  const { userId, accountName, encryptedPAT, teamIds } = account;
  
  // DEBUG: Log the account object we received
  console.log('[PROCESS ACCOUNT DEBUG] Account object:', JSON.stringify({
    userId,
    accountName,
    hasEncryptedPAT: !!encryptedPAT,
    teamIds,
    teamIdsType: typeof teamIds,
    teamIdsIsArray: Array.isArray(teamIds),
    fullAccount: account,
  }, null, 2));
  
  logger.debug('Processing account', {
    operation: 'processAccount',
    userId,
    accountName,
    hasTeamIds: !!teamIds && teamIds.length > 0,
  });
  
  try {
    // Decrypt OAuth token (stored as encrypted "PAT")
    const accessToken = storage.decryptPAT(encryptedPAT);
    
    // Create Figma client with OAuth token
    const figmaClient = new FigmaClient({
      accessToken: accessToken,
      accountName,
    });
    
    // Get user info for filtering
    const figmaUser = await figmaClient.getMe();
    
    // Get last digest time (or default to 24 hours ago)
    const lastDigestTime = await storage.getLastDigestTime(userId, accountName);
    const since = lastDigestTime || getDefaultSinceTime();
    
    logger.debug('Fetching activity since last digest', {
      operation: 'processAccount',
      userId,
      accountName,
      since,
      figmaUserId: figmaUser.id,
    });
    
    // Fetch activity
    const events = await fetchAccountActivity(
      figmaClient,
      figmaUser,
      accountName,
      teamIds,
      since
    );
    
    logger.info('Account processing completed', {
      operation: 'processAccount',
      userId,
      accountName,
      eventsFound: events.length,
    });
    
    return {
      userId,
      accountName,
      events,
    };
    
  } catch (error) {
    // Log error with context
    logger.partialFailure(
      'Account processing failed',
      error instanceof Error ? error : new Error('Unknown error'),
      {
        operation: 'processAccount',
        userId,
        accountName,
      }
    );
    
    // Return error result
    return {
      userId,
      accountName,
      events: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch activity for a single account from webhook events
 * Reads stored webhook events instead of polling Figma API
 */
async function fetchAccountActivity(
  figmaClient: FigmaClient,
  figmaUser: FigmaUser,
  accountName: string,
  teamIds: string[] | undefined,
  since: string
): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];
  
  if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
    logger.warn('No team IDs configured for account', {
      operation: 'fetchAccountActivity',
      accountName,
      message: 'Please add team IDs to this account to enable activity tracking',
    });
    return events;
  }
  
  logger.info(`Processing webhook events for ${teamIds.length} team(s)`, {
    operation: 'fetchAccountActivity',
    accountName,
    teamCount: teamIds.length,
  });
  
  // Get webhook events since last digest
  const storage = new Storage(process.env.ENCRYPTION_KEY!);
  const sinceDate = new Date(since);
  const now = new Date();
  
  // Get events for each day since last digest
  const dates: string[] = [];
  for (let d = new Date(sinceDate); d <= now; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
  }
  
  logger.debug('Fetching webhook events for date range', {
    operation: 'fetchAccountActivity',
    accountName,
    dates: dates.length,
    since,
  });
  
  // Fetch all webhook events for these dates
  const allWebhookEvents: any[] = [];
  for (const date of dates) {
    const dayEvents = await storage.getWebhookEvents(date);
    allWebhookEvents.push(...dayEvents);
  }
  
  logger.info('Retrieved webhook events', {
    operation: 'fetchAccountActivity',
    accountName,
    totalEvents: allWebhookEvents.length,
  });
  
  // Filter events for this account's teams
  const teamIdSet = new Set(teamIds);
  const relevantWebhookEvents = allWebhookEvents.filter(event => 
    teamIdSet.has(event.teamId) && new Date(event.timestamp) > sinceDate
  );
  
  logger.info('Filtered webhook events for account teams', {
    operation: 'fetchAccountActivity',
    accountName,
    relevantEvents: relevantWebhookEvents.length,
  });
  
  // Convert webhook events to ActivityEvents
  for (const webhookEvent of relevantWebhookEvents) {
    try {
      // Fetch file metadata to get full context
      const fileMeta = await figmaClient.getFileMeta(webhookEvent.fileKey);
      
      // Create ActivityEvent from webhook
      const event: ActivityEvent = {
        action: 'FILE_UPDATED',
        ts: webhookEvent.timestamp,
        userId: webhookEvent.triggeredBy?.id || 'unknown',
        userName: webhookEvent.triggeredBy?.handle || 'Unknown User',
        fileKey: webhookEvent.fileKey,
        fileName: webhookEvent.fileName || fileMeta.name,
        projectId: 'unknown', // Webhook doesn't include project info
        projectName: 'Unknown Project', // Webhook doesn't include project info
        account: accountName,
        url: `https://www.figma.com/file/${webhookEvent.fileKey}`,
        metadata: {
          eventType: webhookEvent.eventType,
          teamId: webhookEvent.teamId,
        },
      };
      
      events.push(event);
    } catch (error) {
      logger.partialFailure(
        'Error processing webhook event',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          operation: 'fetchAccountActivity',
          accountName,
          fileKey: webhookEvent.fileKey,
        }
      );
    }
  }
  
  // Filter events to only those relevant to this user
  const relevantEvents = filterEventsForUser(events, figmaUser);
  
  logger.info('Activity fetching completed', {
    operation: 'fetchAccountActivity',
    accountName,
    totalEvents: events.length,
    relevantEvents: relevantEvents.length,
  });
  
  return relevantEvents;
}

/**
 * Get default "since" time (24 hours ago)
 */
function getDefaultSinceTime(): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return yesterday.toISOString();
}

/**
 * Filter events to only those relevant to the specified user
 * 
 * An event is relevant if:
 * - The user created the version/edit
 * - The user made the comment
 * - Someone commented on a file the user recently edited
 * - Someone replied to the user's comment
 */
function filterEventsForUser(
  events: ActivityEvent[],
  figmaUser: { id: string; handle: string; email: string } | null
): ActivityEvent[] {
  // If no user info, return all events (fallback)
  if (!figmaUser || !figmaUser.id) {
    logger.warn('No Figma user info available for filtering - returning all events', {
      operation: 'filterEventsForUser',
      totalEvents: events.length,
    });
    return events;
  }
  
  logger.debug('Filtering events for user', {
    operation: 'filterEventsForUser',
    figmaUserId: figmaUser.id,
    figmaUserHandle: figmaUser.handle,
    totalEvents: events.length,
  });
  
  // Track files the user has edited (for comment filtering)
  const userEditedFiles = new Set<string>();
  const userCommentIds = new Set<string>();
  
  // First pass: identify user's edits and comments
  for (const event of events) {
    // Debug: log event details
    logger.debug('Examining event for user filtering', {
      operation: 'filterEventsForUser',
      action: event.action,
      userId: event.userId,
      userName: event.userName,
      fileKey: event.fileKey,
      targetUserId: figmaUser.id,
    });
    
    if (event.userId === figmaUser.id) {
      if (event.action === 'FILE_VERSION_CREATED' || event.action === 'FILE_UPDATED') {
        userEditedFiles.add(event.fileKey);
      } else if (event.action === 'COMMENT_ADDED') {
        // Store comment ID from metadata if available
        if (event.metadata?.commentId) {
          userCommentIds.add(event.metadata.commentId);
        }
      }
    }
  }
  
  logger.debug('User activity summary', {
    operation: 'filterEventsForUser',
    userEditedFiles: userEditedFiles.size,
    userComments: userCommentIds.size,
  });
  
  // Second pass: filter events
  const relevantEvents = events.filter(event => {
    // Include FILE_UPDATED events from webhooks (they don't have user info)
    // These are for files in teams the user configured, so they're relevant
    if (event.action === 'FILE_UPDATED' && event.userId === 'unknown') {
      return true;
    }
    
    // Include if user created the version or updated the file
    if ((event.action === 'FILE_VERSION_CREATED' || event.action === 'FILE_UPDATED') && event.userId === figmaUser.id) {
      return true;
    }
    
    // Include if user made the comment
    if (event.action === 'COMMENT_ADDED' && event.userId === figmaUser.id) {
      return true;
    }
    
    // Include if someone commented on a file the user edited
    if (event.action === 'COMMENT_ADDED' && userEditedFiles.has(event.fileKey)) {
      return true;
    }
    
    // Include if someone replied to the user's comment
    if (event.action === 'COMMENT_ADDED' && event.metadata?.parentId) {
      if (userCommentIds.has(event.metadata.parentId)) {
        return true;
      }
    }
    
    return false;
  });
  
  logger.info('Event filtering completed', {
    operation: 'filterEventsForUser',
    totalEvents: events.length,
    relevantEvents: relevantEvents.length,
    filtered: events.length - relevantEvents.length,
  });
  
  return relevantEvents;
}
