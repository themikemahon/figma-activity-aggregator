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
import { FigmaClient, FigmaAPIError, FigmaUser } from '@/lib/figmaClient';
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
    
    // Get user info to know who we're filtering for
    const figmaUser = await figmaClient.getMe();
    
    logger.info('Fetched Figma user info for filtering', {
      operation: 'processAccount',
      userId,
      accountName,
      figmaUserId: figmaUser.id,
      figmaUserHandle: figmaUser.handle,
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
    const allEvents = await fetchAccountActivity(
      figmaClient,
      accountName,
      since
    );
    
    // Filter events to only those relevant to this user
    const relevantEvents = filterEventsForUser(allEvents, figmaUser);
    
    logger.info('Account processing completed', {
      operation: 'processAccount',
      userId,
      accountName,
      totalEvents: allEvents.length,
      relevantEvents: relevantEvents.length,
      filtered: allEvents.length - relevantEvents.length,
    });
    
    return {
      userId,
      accountName,
      events: relevantEvents,
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
    // Get team IDs from environment variable
    // Format: FIGMA_TEAM_IDS=team1,team2,team3 (applies to all accounts)
    // Or: FIGMA_TEAM_IDS_ACCOUNTNAME=team1,team2 (specific to account)
    const accountSpecificVar = process.env[`FIGMA_TEAM_IDS_${accountName.toUpperCase()}`];
    const globalVar = process.env.FIGMA_TEAM_IDS;
    
    const teamIdsString = accountSpecificVar || globalVar;
    
    if (!teamIdsString) {
      logger.warn('No team IDs configured - cannot fetch activity', {
        operation: 'fetchAccountActivity',
        accountName,
        helpText: 'Set FIGMA_TEAM_IDS environment variable with comma-separated team IDs',
        example: 'FIGMA_TEAM_IDS=123456789,987654321',
      });
      return events;
    }
    
    const teamIds = teamIdsString.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (teamIds.length === 0) {
      logger.warn('No valid team IDs found', {
        operation: 'fetchAccountActivity',
        accountName,
      });
      return events;
    }
    
    logger.info(`Processing ${teamIds.length} team(s)`, {
      operation: 'fetchAccountActivity',
      accountName,
      teamCount: teamIds.length,
    });
    
    // Process each team
    for (const teamId of teamIds) {
      try {
        logger.debug('Fetching projects for team', {
          operation: 'fetchAccountActivity',
          accountName,
          teamId,
        });
        
        // Fetch projects for this team
        const projects = await figmaClient.listTeamProjects(teamId);
        
        logger.debug(`Found ${projects.length} projects in team`, {
          operation: 'fetchAccountActivity',
          accountName,
          teamId,
          projectCount: projects.length,
        });
        
        // Process each project
        for (const project of projects) {
          try {
            // Fetch files in this project
            const files = await figmaClient.listProjectFiles(project.id);
            
            logger.debug(`Found ${files.length} files in project`, {
              operation: 'fetchAccountActivity',
              accountName,
              projectId: project.id,
              projectName: project.name,
              fileCount: files.length,
            });
            
            // Process each file
            for (const file of files) {
              try {
                // Check if file was modified since last digest
                const fileModifiedDate = new Date(file.last_modified);
                const sinceDate = new Date(since);
                
                if (fileModifiedDate <= sinceDate) {
                  // Skip files that haven't been modified since last digest
                  logger.debug('Skipping file - not modified since last digest', {
                    operation: 'fetchAccountActivity',
                    accountName,
                    fileKey: file.key,
                    fileName: file.name,
                    lastModified: file.last_modified,
                    since,
                  });
                  continue;
                }
                
                logger.debug('Processing file', {
                  operation: 'fetchAccountActivity',
                  accountName,
                  fileKey: file.key,
                  fileName: file.name,
                  lastModified: file.last_modified,
                });
                
                // Fetch versions since last digest
                const versions = await figmaClient.listFileVersions(file.key, { since });
                
                logger.debug(`Found ${versions.length} versions for file`, {
                  operation: 'fetchAccountActivity',
                  accountName,
                  fileKey: file.key,
                  versionCount: versions.length,
                });
                
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
                let newComments = 0;
                for (const comment of comments) {
                  const commentDate = new Date(comment.created_at);
                  
                  if (commentDate > sinceDate) {
                    const event = ActivityNormalizer.normalizeComment(
                      comment,
                      file,
                      project,
                      accountName
                    );
                    events.push(event);
                    newComments++;
                  }
                }
                
                logger.debug(`Found ${newComments} new comments for file`, {
                  operation: 'fetchAccountActivity',
                  accountName,
                  fileKey: file.key,
                  newCommentCount: newComments,
                });
                
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
  figmaUser: { id: string; handle: string; email: string }
): ActivityEvent[] {
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
    if (event.userId === figmaUser.id) {
      if (event.action === 'FILE_VERSION_CREATED') {
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
    // Include if user created the version
    if (event.action === 'FILE_VERSION_CREATED' && event.userId === figmaUser.id) {
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
