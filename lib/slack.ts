/**
 * Slack Poster - Posts formatted messages to Slack via incoming webhook
 */

import { createLogger } from './logger';

const logger = createLogger('SlackPoster');

export interface SlackConfig {
  webhookUrl: string;
}

export interface SlackMessage {
  text: string;
  blocks?: any[];
}

/**
 * SlackPoster handles posting messages to Slack with retry logic and rate limiting
 */
export class SlackPoster {
  private webhookUrl: string;

  constructor(config: SlackConfig) {
    if (!config.webhookUrl) {
      throw new Error('Slack webhook URL is required');
    }
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * Post a single message to Slack with retry logic
   */
  async postMessage(message: SlackMessage): Promise<void> {
    await this.postWithRetry(message, 3);
  }

  /**
   * Post multiple messages with rate limiting (1 message per second)
   */
  async postMessages(messages: SlackMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i++) {
      await this.postMessage(messages[i]);
      
      // Rate limit: wait 1 second between messages (except after the last one)
      if (i < messages.length - 1) {
        await this.sleep(1000);
      }
    }
  }

  /**
   * Post PAT expiration warning to Slack
   */
  async postPATWarning(
    userName: string,
    accountName: string,
    expiresAt: string,
    daysUntilExpiry: number
  ): Promise<void> {
    const isExpired = daysUntilExpiry <= 0;
    const urgency = isExpired ? '🚨 URGENT' : '⚠️ WARNING';
    
    let message: string;
    if (isExpired) {
      message = `${urgency}: Figma PAT Expired\n\n` +
        `User: ${userName}\n` +
        `Account: ${accountName}\n` +
        `Expired: ${expiresAt}\n\n` +
        `Action required: Please update your PAT immediately to continue receiving activity updates.`;
    } else {
      message = `${urgency}: Figma PAT Expiring Soon\n\n` +
        `User: ${userName}\n` +
        `Account: ${accountName}\n` +
        `Expires: ${expiresAt}\n` +
        `Days remaining: ${daysUntilExpiry}\n\n` +
        `Action required: Please renew your PAT before it expires.`;
    }

    await this.postMessage({ text: message });
  }

  /**
   * Internal method to post with retry logic and exponential backoff
   */
  private async postWithRetry(message: SlackMessage, attempts: number): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        logger.debug('Posting message to Slack', {
          operation: 'postMessage',
          attempt: i + 1,
          maxAttempts: attempts,
        });

        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });

        if (response.ok) {
          logger.info('Slack message posted successfully', {
            operation: 'postMessage',
            attempt: i + 1,
          });
          return;
        }

        // Retry on 5xx errors
        if (response.status >= 500 && i < attempts - 1) {
          const backoffTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          
          logger.recoverableError(
            'Slack webhook server error, retrying',
            new Error(`Slack webhook failed with status ${response.status}`),
            {
              operation: 'postMessage',
              status: response.status,
              attempt: i + 1,
              backoffTime,
            }
          );
          
          await this.sleep(backoffTime);
          continue;
        }

        // Non-retryable error (4xx) or last attempt
        const responseText = await response.text();
        
        logger.fatalError(
          'Slack webhook failed',
          new Error(`Slack webhook failed: ${response.status} - ${responseText}`),
          {
            operation: 'postMessage',
            status: response.status,
            attempt: i + 1,
          }
        );
        
        throw new Error(`Slack webhook failed: ${response.status} - ${responseText}`);
      } catch (error) {
        // If the error is already our custom error (from the throw above), re-throw it
        if (error instanceof Error && error.message.startsWith('Slack webhook failed:')) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (i === attempts - 1) {
          logger.fatalError(
            'Slack webhook failed after all retries',
            error instanceof Error ? error : new Error('Unknown error'),
            {
              operation: 'postMessage',
              attempt: i + 1,
            }
          );
          throw error;
        }

        // Otherwise, retry with exponential backoff (for network errors)
        const backoffTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        
        logger.recoverableError(
          'Slack webhook network error, retrying',
          error instanceof Error ? error : new Error('Unknown error'),
          {
            operation: 'postMessage',
            attempt: i + 1,
            backoffTime,
          }
        );
        
        await this.sleep(backoffTime);
      }
    }
  }

  /**
   * Sleep utility for rate limiting and backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
