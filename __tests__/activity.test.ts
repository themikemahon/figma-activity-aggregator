/**
 * Unit tests for ActivityNormalizer
 */

import { ActivityNormalizer, ActivityEvent } from '../lib/activity';
import { FigmaVersion, FigmaComment, FigmaFile, FigmaProject } from '../lib/figmaClient';

describe('ActivityNormalizer', () => {
  const mockProject: FigmaProject = {
    id: 'proj-123',
    name: 'Test Project',
  };

  const mockFile: FigmaFile = {
    key: 'file-abc',
    name: 'Test File',
    thumbnail_url: 'https://example.com/thumb.png',
    last_modified: '2026-02-26T09:00:00Z',
  };

  describe('normalizeVersion', () => {
    it('should normalize a file version with complete user info', () => {
      const version: FigmaVersion = {
        id: 'v1',
        created_at: '2026-02-26T09:03:00Z',
        label: 'Initial design',
        description: 'First version',
        user: {
          id: 'user-1',
          handle: 'mike',
          img_url: 'https://example.com/avatar.png',
        },
      };

      const event = ActivityNormalizer.normalizeVersion(
        version,
        mockFile,
        mockProject,
        'gen'
      );

      expect(event.ts).toBe('2026-02-26T09:03:00Z');
      expect(event.account).toBe('gen');
      expect(event.projectId).toBe('proj-123');
      expect(event.projectName).toBe('Test Project');
      expect(event.fileKey).toBe('file-abc');
      expect(event.fileName).toBe('Test File');
      expect(event.userId).toBe('user-1');
      expect(event.userName).toBe('mike');
      expect(event.action).toBe('FILE_VERSION_CREATED');
      expect(event.url).toBe('https://www.figma.com/file/file-abc?version-id=v1');
      expect(event.metadata?.versionLabel).toBe('Initial design');
      expect(event.metadata?.versionDescription).toBe('First version');
    });

    it('should handle missing user information', () => {
      const version: FigmaVersion = {
        id: 'v2',
        created_at: '2026-02-26T10:00:00Z',
        label: 'Update',
        description: '',
        user: null as any,
      };

      const event = ActivityNormalizer.normalizeVersion(
        version,
        mockFile,
        mockProject,
        'clientA'
      );

      expect(event.userId).toBeUndefined();
      expect(event.userName).toBeUndefined();
      expect(event.userEmail).toBeUndefined();
      expect(event.action).toBe('FILE_VERSION_CREATED');
    });
  });

  describe('normalizeComment', () => {
    it('should normalize a comment with complete user info', () => {
      const comment: FigmaComment = {
        id: 'comment-1',
        file_key: 'file-abc',
        parent_id: '',
        user: {
          id: 'user-2',
          handle: 'sarah',
          img_url: 'https://example.com/avatar2.png',
        },
        created_at: '2026-02-26T11:00:00Z',
        resolved_at: null,
        message: 'Looks great!',
      };

      const event = ActivityNormalizer.normalizeComment(
        comment,
        mockFile,
        mockProject,
        'gen'
      );

      expect(event.ts).toBe('2026-02-26T11:00:00Z');
      expect(event.account).toBe('gen');
      expect(event.projectId).toBe('proj-123');
      expect(event.projectName).toBe('Test Project');
      expect(event.fileKey).toBe('file-abc');
      expect(event.fileName).toBe('Test File');
      expect(event.userId).toBe('user-2');
      expect(event.userName).toBe('sarah');
      expect(event.action).toBe('COMMENT_ADDED');
      expect(event.url).toBe('https://www.figma.com/file/file-abc?comment-id=comment-1');
      expect(event.metadata?.commentMessage).toBe('Looks great!');
    });

    it('should handle missing user information', () => {
      const comment: FigmaComment = {
        id: 'comment-2',
        file_key: 'file-abc',
        parent_id: 'comment-1',
        user: null as any,
        created_at: '2026-02-26T12:00:00Z',
        resolved_at: '2026-02-26T13:00:00Z',
        message: 'Fixed',
      };

      const event = ActivityNormalizer.normalizeComment(
        comment,
        mockFile,
        mockProject,
        'clientB'
      );

      expect(event.userId).toBeUndefined();
      expect(event.userName).toBeUndefined();
      expect(event.action).toBe('COMMENT_ADDED');
      expect(event.metadata?.resolvedAt).toBe('2026-02-26T13:00:00Z');
    });
  });

  describe('generateDeepLink', () => {
    it('should generate base file URL', () => {
      const url = ActivityNormalizer.generateDeepLink('file-123');
      expect(url).toBe('https://www.figma.com/file/file-123');
    });

    it('should generate version URL', () => {
      const url = ActivityNormalizer.generateDeepLink('file-123', {
        versionId: 'v1',
      });
      expect(url).toBe('https://www.figma.com/file/file-123?version-id=v1');
    });

    it('should generate comment URL', () => {
      const url = ActivityNormalizer.generateDeepLink('file-123', {
        commentId: 'comment-1',
      });
      expect(url).toBe('https://www.figma.com/file/file-123?comment-id=comment-1');
    });

    it('should generate node URL', () => {
      const url = ActivityNormalizer.generateDeepLink('file-123', {
        nodeId: 'node-1',
      });
      expect(url).toBe('https://www.figma.com/file/file-123?node-id=node-1');
    });

    it('should URL-encode parameters', () => {
      const url = ActivityNormalizer.generateDeepLink('file-123', {
        versionId: 'v1:special',
      });
      expect(url).toBe('https://www.figma.com/file/file-123?version-id=v1%3Aspecial');
    });

    it('should handle multiple parameters', () => {
      const url = ActivityNormalizer.generateDeepLink('file-123', {
        versionId: 'v1',
        nodeId: 'node-1',
      });
      expect(url).toContain('version-id=v1');
      expect(url).toContain('node-id=node-1');
      expect(url).toContain('&');
    });

    it('should return empty string for missing file key', () => {
      const url = ActivityNormalizer.generateDeepLink('');
      expect(url).toBe('');
    });
  });

  describe('filterByTimestamp', () => {
    const events: ActivityEvent[] = [
      {
        ts: '2026-02-26T08:00:00Z',
        account: 'gen',
        projectId: 'p1',
        projectName: 'Project 1',
        fileKey: 'f1',
        fileName: 'File 1',
        action: 'FILE_VERSION_CREATED',
        url: 'https://example.com',
      },
      {
        ts: '2026-02-26T10:00:00Z',
        account: 'gen',
        projectId: 'p1',
        projectName: 'Project 1',
        fileKey: 'f2',
        fileName: 'File 2',
        action: 'COMMENT_ADDED',
        url: 'https://example.com',
      },
      {
        ts: '2026-02-26T12:00:00Z',
        account: 'gen',
        projectId: 'p1',
        projectName: 'Project 1',
        fileKey: 'f3',
        fileName: 'File 3',
        action: 'FILE_VERSION_CREATED',
        url: 'https://example.com',
      },
    ];

    it('should filter events after timestamp', () => {
      const filtered = ActivityNormalizer.filterByTimestamp(
        events,
        '2026-02-26T09:00:00Z'
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].ts).toBe('2026-02-26T10:00:00Z');
      expect(filtered[1].ts).toBe('2026-02-26T12:00:00Z');
    });

    it('should return empty array if all events are before timestamp', () => {
      const filtered = ActivityNormalizer.filterByTimestamp(
        events,
        '2026-02-26T15:00:00Z'
      );

      expect(filtered).toHaveLength(0);
    });

    it('should return all events if timestamp is before all events', () => {
      const filtered = ActivityNormalizer.filterByTimestamp(
        events,
        '2026-02-26T07:00:00Z'
      );

      expect(filtered).toHaveLength(3);
    });

    it('should handle ISO 8601 format', () => {
      const filtered = ActivityNormalizer.filterByTimestamp(
        events,
        '2026-02-26T10:00:00.000Z'
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].ts).toBe('2026-02-26T12:00:00Z');
    });
  });

  describe('classifyActionType', () => {
    it('should map FILE_VERSION to FILE_VERSION_CREATED', () => {
      const action = ActivityNormalizer.classifyActionType('FILE_VERSION');
      expect(action).toBe('FILE_VERSION_CREATED');
    });

    it('should map COMMENT to COMMENT_ADDED', () => {
      const action = ActivityNormalizer.classifyActionType('COMMENT');
      expect(action).toBe('COMMENT_ADDED');
    });

    it('should map LIBRARY_PUBLISH to LIBRARY_PUBLISHED', () => {
      const action = ActivityNormalizer.classifyActionType('LIBRARY_PUBLISH');
      expect(action).toBe('LIBRARY_PUBLISHED');
    });

    it('should preserve unknown action types', () => {
      const action = ActivityNormalizer.classifyActionType('CUSTOM_ACTION');
      expect(action).toBe('CUSTOM_ACTION');
    });

    it('should preserve action types not in the map', () => {
      const action = ActivityNormalizer.classifyActionType('UNKNOWN_EVENT');
      expect(action).toBe('UNKNOWN_EVENT');
    });
  });
});
