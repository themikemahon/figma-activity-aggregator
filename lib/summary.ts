/**
 * Summary Generator
 * Aggregates ActivityEvents into human-readable summaries for Slack
 */

import { ActivityEvent, ActionType } from './activity';

/**
 * Summary format options
 */
export interface SummaryOptions {
  format: 'per-event' | 'daily-recap';
  groupBy?: 'user' | 'project' | 'account';
}

/**
 * Summary output structure
 */
export interface Summary {
  text: string;
  blocks?: any[];  // Slack Block Kit format (optional)
}

/**
 * Summary Generator class
 * Aggregates ActivityEvents into human-readable summaries for Slack
 */
export class SummaryGenerator {
  /**
   * Generate per-event messages
   * Format: [FIGMA][account] timestamp – project • user – action "file" <url>
   */
  static generatePerEventSummaries(events: ActivityEvent[]): Summary[] {
    return events.map(event => {
      const timestamp = this.formatTimestamp(event.ts);
      const user = event.userName || 'Unknown User';
      const action = this.formatAction(event.action);
      
      // Format with clickable link: <url|text>
      const text = `[FIGMA][${event.account}] ${timestamp} – ${event.projectName} • ${user} – ${action} <${event.url}|"${event.fileName}">`;
      
      return { text };
    });
  }

  /**
   * Generate daily recap with breakdowns
   * Includes per-person, per-project, and per-account statistics
   */
  static generateDailyRecap(events: ActivityEvent[], date: string): Summary {
    const totalEvents = events.length;
    
    // Group events by different criteria
    const byUser = this.groupEvents(events, 'user');
    const byProject = this.groupEvents(events, 'project');
    const byAccount = this.groupEvents(events, 'account');
    
    // Build the recap text
    let text = `📊 Figma Activity Recap - ${date}\n\n`;
    text += `Total Events: ${totalEvents} across ${byAccount.size} account${byAccount.size !== 1 ? 's' : ''}\n\n`;
    
    // By Person section
    text += `By Person:\n`;
    const userEntries = Array.from(byUser.entries())
      .sort((a, b) => b[1].length - a[1].length);  // Sort by event count descending
    
    for (const [userName, userEvents] of userEntries) {
      const actionCounts = this.countByAction(userEvents);
      const actionSummary = Array.from(actionCounts.entries())
        .map(([action, count]) => `${count} ${this.formatActionPlural(action, count)}`)
        .join(', ');
      
      text += `• ${userName}: ${userEvents.length} event${userEvents.length !== 1 ? 's' : ''} (${actionSummary})\n`;
    }
    
    // By Project section
    text += `\nBy Project:\n`;
    const projectEntries = Array.from(byProject.entries())
      .sort((a, b) => b[1].length - a[1].length);  // Sort by event count descending
    
    for (const [projectName, projectEvents] of projectEntries) {
      text += `• ${projectName}: ${projectEvents.length} event${projectEvents.length !== 1 ? 's' : ''}\n`;
    }
    
    // By Account section
    text += `\nBy Account:\n`;
    const accountEntries = Array.from(byAccount.entries())
      .sort((a, b) => b[1].length - a[1].length);  // Sort by event count descending
    
    for (const [accountName, accountEvents] of accountEntries) {
      text += `• ${accountName}: ${accountEvents.length} event${accountEvents.length !== 1 ? 's' : ''}\n`;
    }
    
    return { text };
  }

  /**
   * Group events by criteria (user, project, or account)
   */
  static groupEvents(
    events: ActivityEvent[],
    groupBy: 'user' | 'project' | 'account'
  ): Map<string, ActivityEvent[]> {
    const grouped = new Map<string, ActivityEvent[]>();
    
    for (const event of events) {
      let key: string;
      
      switch (groupBy) {
        case 'user':
          key = event.userName || 'Unknown User';
          break;
        case 'project':
          key = event.projectName;
          break;
        case 'account':
          key = event.account;
          break;
      }
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      
      grouped.get(key)!.push(event);
    }
    
    return grouped;
  }

  /**
   * Count events by action type
   */
  static countByAction(events: ActivityEvent[]): Map<ActionType, number> {
    const counts = new Map<ActionType, number>();
    
    for (const event of events) {
      const currentCount = counts.get(event.action) || 0;
      counts.set(event.action, currentCount + 1);
    }
    
    return counts;
  }

  /**
   * Format timestamp for display
   * Converts ISO 8601 to human-readable format
   */
  private static formatTimestamp(isoTimestamp: string): string {
    const date = new Date(isoTimestamp);
    
    // Format: YYYY-MM-DD HH:MM
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Format action type for display
   */
  private static formatAction(action: ActionType): string {
    const actionMap: Record<string, string> = {
      'FILE_VERSION_CREATED': 'Published new version of',
      'COMMENT_ADDED': 'Commented on',
      'LIBRARY_PUBLISHED': 'Published library',
      'FILE_CREATED': 'Created',
      'FILE_UPDATED': 'Updated',
    };
    
    return actionMap[action] || action;
  }

  /**
   * Format action type in plural form for summaries
   */
  private static formatActionPlural(action: ActionType, count: number): string {
    const pluralMap: Record<string, string> = {
      'FILE_VERSION_CREATED': count === 1 ? 'version' : 'versions',
      'COMMENT_ADDED': count === 1 ? 'comment' : 'comments',
      'LIBRARY_PUBLISHED': count === 1 ? 'library publish' : 'library publishes',
      'FILE_CREATED': count === 1 ? 'file created' : 'files created',
      'FILE_UPDATED': count === 1 ? 'file updated' : 'files updated',
    };
    
    return pluralMap[action] || action.toLowerCase();
  }
}
