/**
 * Unit tests for SummaryGenerator
 */

import { SummaryGenerator } from '../lib/summary';
import { ActivityEvent } from '../lib/activity';

describe('SummaryGenerator', () => {
  // Sample test data
  const sampleEvents: ActivityEvent[] = [
    {
      ts: '2026-02-26T09:03:00Z',
      account: 'gen',
      projectId: 'proj1',
      projectName: 'Brand System Revamp',
      fileKey: 'file1',
      fileName: 'Homepage Concepts',
      userId: 'user1',
      userName: 'Mike Mahon',
      action: 'FILE_VERSION_CREATED',
      url: 'https://www.figma.com/file/file1?version-id=v1',
    },
    {
      ts: '2026-02-26T10:15:00Z',
      account: 'gen',
      projectId: 'proj1',
      projectName: 'Brand System Revamp',
      fileKey: 'file2',
      fileName: 'Design System',
      userId: 'user2',
      userName: 'Sarah Chen',
      action: 'COMMENT_ADDED',
      url: 'https://www.figma.com/file/file2?comment-id=c1',
    },
    {
      ts: '2026-02-26T11:30:00Z',
      account: 'clientA',
      projectId: 'proj2',
      projectName: 'Mobile App Redesign',
      fileKey: 'file3',
      fileName: 'App Screens',
      userId: 'user1',
      userName: 'Mike Mahon',
      action: 'FILE_VERSION_CREATED',
      url: 'https://www.figma.com/file/file3?version-id=v2',
    },
  ];

  describe('generatePerEventSummaries', () => {
    it('should generate formatted message for each event', () => {
      const summaries = SummaryGenerator.generatePerEventSummaries(sampleEvents);
      
      expect(summaries).toHaveLength(3);
      expect(summaries[0].text).toContain('[FIGMA][gen]');
      expect(summaries[0].text).toContain('Brand System Revamp');
      expect(summaries[0].text).toContain('Mike Mahon');
      expect(summaries[0].text).toContain('Published new version of');
      expect(summaries[0].text).toContain('"Homepage Concepts"');
      expect(summaries[0].text).toContain('https://www.figma.com/file/file1?version-id=v1');
    });

    it('should handle events with unknown users', () => {
      const eventWithoutUser: ActivityEvent = {
        ...sampleEvents[0],
        userName: undefined,
      };
      
      const summaries = SummaryGenerator.generatePerEventSummaries([eventWithoutUser]);
      
      expect(summaries[0].text).toContain('Unknown User');
    });

    it('should format different action types correctly', () => {
      const commentEvent = sampleEvents[1];
      const summaries = SummaryGenerator.generatePerEventSummaries([commentEvent]);
      
      expect(summaries[0].text).toContain('Commented on');
    });
  });

  describe('generateDailyRecap', () => {
    it('should generate recap with all sections', () => {
      const recap = SummaryGenerator.generateDailyRecap(sampleEvents, 'February 26, 2026');
      
      expect(recap.text).toContain('📊 Figma Activity Recap - February 26, 2026');
      expect(recap.text).toContain('Total Events: 3');
      expect(recap.text).toContain('By Person:');
      expect(recap.text).toContain('By Project:');
      expect(recap.text).toContain('By Account:');
    });

    it('should include per-person breakdown with action counts', () => {
      const recap = SummaryGenerator.generateDailyRecap(sampleEvents, 'February 26, 2026');
      
      expect(recap.text).toContain('Mike Mahon: 2 events');
      expect(recap.text).toContain('2 versions');
      expect(recap.text).toContain('Sarah Chen: 1 event');
      expect(recap.text).toContain('1 comment');
    });

    it('should include per-project breakdown', () => {
      const recap = SummaryGenerator.generateDailyRecap(sampleEvents, 'February 26, 2026');
      
      expect(recap.text).toContain('Brand System Revamp: 2 events');
      expect(recap.text).toContain('Mobile App Redesign: 1 event');
    });

    it('should include per-account breakdown', () => {
      const recap = SummaryGenerator.generateDailyRecap(sampleEvents, 'February 26, 2026');
      
      expect(recap.text).toContain('gen: 2 events');
      expect(recap.text).toContain('clientA: 1 event');
    });

    it('should sort entries by event count descending', () => {
      const recap = SummaryGenerator.generateDailyRecap(sampleEvents, 'February 26, 2026');
      
      // Mike Mahon (2 events) should appear before Sarah Chen (1 event)
      const mikeIndex = recap.text.indexOf('Mike Mahon');
      const sarahIndex = recap.text.indexOf('Sarah Chen');
      expect(mikeIndex).toBeLessThan(sarahIndex);
    });
  });

  describe('groupEvents', () => {
    it('should group events by user', () => {
      const grouped = SummaryGenerator.groupEvents(sampleEvents, 'user');
      
      expect(grouped.size).toBe(2);
      expect(grouped.get('Mike Mahon')).toHaveLength(2);
      expect(grouped.get('Sarah Chen')).toHaveLength(1);
    });

    it('should group events by project', () => {
      const grouped = SummaryGenerator.groupEvents(sampleEvents, 'project');
      
      expect(grouped.size).toBe(2);
      expect(grouped.get('Brand System Revamp')).toHaveLength(2);
      expect(grouped.get('Mobile App Redesign')).toHaveLength(1);
    });

    it('should group events by account', () => {
      const grouped = SummaryGenerator.groupEvents(sampleEvents, 'account');
      
      expect(grouped.size).toBe(2);
      expect(grouped.get('gen')).toHaveLength(2);
      expect(grouped.get('clientA')).toHaveLength(1);
    });

    it('should handle events with unknown users', () => {
      const eventsWithUnknown: ActivityEvent[] = [
        { ...sampleEvents[0], userName: undefined },
        { ...sampleEvents[1], userName: undefined },
      ];
      
      const grouped = SummaryGenerator.groupEvents(eventsWithUnknown, 'user');
      
      expect(grouped.size).toBe(1);
      expect(grouped.get('Unknown User')).toHaveLength(2);
    });
  });

  describe('countByAction', () => {
    it('should count events by action type', () => {
      const counts = SummaryGenerator.countByAction(sampleEvents);
      
      expect(counts.get('FILE_VERSION_CREATED')).toBe(2);
      expect(counts.get('COMMENT_ADDED')).toBe(1);
    });

    it('should handle empty event list', () => {
      const counts = SummaryGenerator.countByAction([]);
      
      expect(counts.size).toBe(0);
    });

    it('should handle multiple action types', () => {
      const mixedEvents: ActivityEvent[] = [
        { ...sampleEvents[0], action: 'FILE_VERSION_CREATED' },
        { ...sampleEvents[0], action: 'COMMENT_ADDED' },
        { ...sampleEvents[0], action: 'LIBRARY_PUBLISHED' },
        { ...sampleEvents[0], action: 'FILE_VERSION_CREATED' },
      ];
      
      const counts = SummaryGenerator.countByAction(mixedEvents);
      
      expect(counts.get('FILE_VERSION_CREATED')).toBe(2);
      expect(counts.get('COMMENT_ADDED')).toBe(1);
      expect(counts.get('LIBRARY_PUBLISHED')).toBe(1);
    });
  });
});
