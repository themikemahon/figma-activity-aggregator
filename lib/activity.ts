/**
 * Activity Normalizer
 * Transforms Figma API responses into standardized ActivityEvent objects
 */

import {
  FigmaVersion,
  FigmaComment,
  FigmaFile,
  FigmaProject,
} from './figmaClient';

/**
 * Account name identifier
 */
export type AccountName = string;

/**
 * Action types for Figma events
 */
export type ActionType =
  | 'FILE_VERSION_CREATED'
  | 'COMMENT_ADDED'
  | 'LIBRARY_PUBLISHED'
  | 'FILE_CREATED'
  | 'FILE_UPDATED'
  | string;  // Allow unknown action types

/**
 * Normalized activity event
 */
export interface ActivityEvent {
  ts: string;            // ISO 8601 timestamp
  account: AccountName;  // Which Figma account
  projectId: string;
  projectName: string;
  fileKey: string;
  fileName: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: ActionType;
  url: string;           // Deep link to Figma
  metadata?: Record<string, any>;  // Additional context
}

/**
 * Options for deep link generation
 */
export interface DeepLinkOptions {
  versionId?: string;
  commentId?: string;
  nodeId?: string;
}

/**
 * Activity Normalizer class
 * Transforms Figma API responses into standardized ActivityEvent objects
 */
export class ActivityNormalizer {
  /**
   * Normalize a Figma file version into an ActivityEvent
   */
  static normalizeVersion(
    version: FigmaVersion,
    file: FigmaFile,
    project: FigmaProject,
    account: AccountName
  ): ActivityEvent {
    const event: ActivityEvent = {
      ts: version.created_at,
      account,
      projectId: project.id,
      projectName: project.name,
      fileKey: file.key,
      fileName: file.name,
      action: 'FILE_VERSION_CREATED',
      url: this.generateDeepLink(file.key, { versionId: version.id }),
      metadata: {
        versionLabel: version.label,
        versionDescription: version.description,
      },
    };

    // Add user information if available
    if (version.user) {
      event.userId = version.user.id;
      event.userName = version.user.handle;
      // Note: Figma version API doesn't provide email
    }

    return event;
  }

  /**
   * Normalize a Figma comment into an ActivityEvent
   */
  static normalizeComment(
    comment: FigmaComment,
    file: FigmaFile,
    project: FigmaProject,
    account: AccountName
  ): ActivityEvent {
    const event: ActivityEvent = {
      ts: comment.created_at,
      account,
      projectId: project.id,
      projectName: project.name,
      fileKey: file.key,
      fileName: file.name,
      action: 'COMMENT_ADDED',
      url: this.generateDeepLink(file.key, { commentId: comment.id }),
      metadata: {
        commentMessage: comment.message,
        parentId: comment.parent_id,
        resolvedAt: comment.resolved_at,
      },
    };

    // Add user information if available
    if (comment.user) {
      event.userId = comment.user.id;
      event.userName = comment.user.handle;
      // Note: Figma comment API doesn't provide email
    }

    return event;
  }

  /**
   * Generate a deep link URL to Figma
   * 
   * Formats:
   * - Base file: https://www.figma.com/file/{fileKey}
   * - Version: https://www.figma.com/file/{fileKey}?version-id={versionId}
   * - Comment: https://www.figma.com/file/{fileKey}?comment-id={commentId}
   * - Node: https://www.figma.com/file/{fileKey}?node-id={nodeId}
   */
  static generateDeepLink(
    fileKey: string,
    options?: DeepLinkOptions
  ): string {
    if (!fileKey) {
      return '';
    }

    const baseUrl = `https://www.figma.com/file/${encodeURIComponent(fileKey)}`;

    if (!options) {
      return baseUrl;
    }

    const params: string[] = [];

    if (options.versionId) {
      params.push(`version-id=${encodeURIComponent(options.versionId)}`);
    }

    if (options.commentId) {
      params.push(`comment-id=${encodeURIComponent(options.commentId)}`);
    }

    if (options.nodeId) {
      params.push(`node-id=${encodeURIComponent(options.nodeId)}`);
    }

    if (params.length === 0) {
      return baseUrl;
    }

    return `${baseUrl}?${params.join('&')}`;
  }

  /**
   * Filter events by timestamp
   * Returns only events after the specified timestamp
   */
  static filterByTimestamp(
    events: ActivityEvent[],
    since: string
  ): ActivityEvent[] {
    const sinceDate = new Date(since);

    return events.filter(event => {
      const eventDate = new Date(event.ts);
      return eventDate > sinceDate;
    });
  }

  /**
   * Classify action type from Figma event
   * Maps Figma events to standardized action types
   */
  static classifyActionType(
    eventType: string,
    eventData?: any
  ): ActionType {
    // Map known Figma event types to our action types
    const actionMap: Record<string, ActionType> = {
      'FILE_VERSION': 'FILE_VERSION_CREATED',
      'COMMENT': 'COMMENT_ADDED',
      'LIBRARY_PUBLISH': 'LIBRARY_PUBLISHED',
      'FILE_CREATE': 'FILE_CREATED',
      'FILE_UPDATE': 'FILE_UPDATED',
    };

    // Return mapped action type or preserve original
    return actionMap[eventType] || eventType;
  }
}
