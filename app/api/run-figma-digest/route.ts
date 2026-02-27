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
import { FigmaClient, FigmaAPIError } from '@/lib/figmaClient';
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
  const { userId, accountName, encryptedPAT } = account;
  
  logger.debug('Processing account', {
    operation: 'processAccount',
    userId,
    accountName,
  });
  
  try {
    // Decrypt PAT
    const pat = storage.decryptPAT(encryptedPAT);
    
    // Create Figma client
    const figmaClient = new FigmaClient({
      accessToken: pat,
      accountName,
    });
    
    // Get last digest time (or default to 24 hours ago)
    const lastDigestTime = await storage.getLastDigestTime(userId, accountName);
    const since = lastDigestTime || getDefaultSinceTime();
    
    logger.debug('Fetching activity since last digest', {
      operation: 'processAccount',
      userId,
      accountName,
      since,
    });
    
    // Fetch activity
    const events = await fetchAccountActivity(
      figmaClient,
      accountName,
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
 * Fetch activity for a single account
 * Retrieves teams, projects, files, versions, and comments
 */
async function fetchAccountActivity(
  figmaClient: FigmaClient,
  accountName: string,
  since: string
): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];
  
  logger.debug('Fetching account activity', {
    operation: 'fetchAccountActivity',
    accountName,
    since,
  });
  
  try {
    // Get user info to extract team IDs
    const user = await figmaClient.getMe();
    
    // Note: The Figma API /me endpoint structure varies
    // Team IDs may need to be configured separately or discovered through other means
    // For this implementation, we'll check if team IDs are available in the user object
    const userWithTeams = user as any;
    const teamIds: string[] = [];
    
    // Try to extract team IDs from various possible locations
    if (userWithTeams?.team_ids) {
      teamIds.push(...userWithTeams.team_ids);
    } else if (userWithTeams?.teams) {
      teamIds.push(...userWithTeams.teams.map((t: any) => t.id));
    }
    
    // If no team IDs found, check environment variable for configured team IDs
    const configuredTeamIds = process.env[`FIGMA_TEAM_IDS_${accountName.toUpperCase()}`];
    if (configuredTeamIds) {
      teamIds.push(...configuredTeamIds.split(',').map(id => id.trim()));
    }
    
    // If still no team IDs, log warning with helpful message and return empty events
    if (teamIds.length === 0) {
      logger.warn('No team IDs found for account - please configure FIGMA_TEAM_IDS environment variable', {
        operation: 'fetchAccountActivity',
        accountName,
        envVarName: `FIGMA_TEAM_IDS_${accountName.toUpperCase()}`,
        helpText: 'Set environment variable with comma-separated team IDs to enable activity tracking',
      });
      return events;
    }
    
    logger.debug(`Processing ${teamIds.length} teams`, {
      operation: 'fetchAccountActivity',
      accountName,
      teamCount: teamIds.length,
    });
    
    // Process each team
    for (const teamId of teamIds) {
      try {
        // Fetch projects for this team
        const projects = await figmaClient.listTeamProjects(teamId);
        
        // Process each project
        for (const project of projects) {
          try {
            // Fetch files in this project
            const files = await figmaClient.listProjectFiles(project.id);
            
            // Process each file
            for (const file of files) {
              try {
                // Fetch versions since last digest
                const versions = await figmaClient.listFileVersions(file.key, { since });
                
                // Normalize version events
                for (const version of versions) {
                  const event = ActivityNormalizer.normalizeVersion(
                    version,
                    file,
                    project,
                    accountName
                  );
                  events.push(event);
                }
                
                // Fetch comments on this file
                const comments = await figmaClient.listFileComments(file.key);
                
                // Filter comments by timestamp and normalize
                for (const comment of comments) {
                  const commentDate = new Date(comment.created_at);
                  const sinceDate = new Date(since);
                  
                  if (commentDate > sinceDate) {
                    const event = ActivityNormalizer.normalizeComment(
                      comment,
                      file,
                      project,
                      accountName
                    );
                    events.push(event);
                  }
                }
              } catch (fileError) {
                // Log file processing error but continue with other files
                logger.partialFailure(
                  'Error processing file',
                  fileError instanceof Error ? fileError : new Error('Unknown error'),
                  {
                    operation: 'fetchAccountActivity',
                    accountName,
                    projectId: project.id,
                    fileKey: file.key,
                  }
                );
              }
            }
          } catch (projectError) {
            // Log project processing error but continue with other projects
            logger.partialFailure(
              'Error processing project',
              projectError instanceof Error ? projectError : new Error('Unknown error'),
              {
                operation: 'fetchAccountActivity',
                accountName,
                teamId,
                projectId: project.id,
              }
            );
          }
        }
      } catch (teamError) {
        // Log team processing error but continue with other teams
        logger.partialFailure(
          'Error processing team',
          teamError instanceof Error ? teamError : new Error('Unknown error'),
          {
            operation: 'fetchAccountActivity',
            accountName,
            teamId,
          }
        );
      }
    }
    
    logger.info('Activity fetching completed', {
      operation: 'fetchAccountActivity',
      accountName,
      eventsFound: events.length,
    });
  } catch (error) {
    // Log top-level error
    logger.fatalError(
      'Error fetching activity for account',
      error instanceof Error ? error : new Error('Unknown error'),
      {
        operation: 'fetchAccountActivity',
        accountName,
      }
    );
    throw error;
  }
  
  return events;
}

/**
 * Get default "since" time (24 hours ago)
 */
function getDefaultSinceTime(): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return yesterday.toISOString();
}
