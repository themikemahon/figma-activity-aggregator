import { PATMonitor, PATStatus } from '@/lib/patMonitor';
import { Storage, UserAccount } from '@/lib/storage';
import { SlackPoster } from '@/lib/slack';
import { FigmaClient, FigmaUser } from '@/lib/figmaClient';

// Mock dependencies
jest.mock('@/lib/figmaClient');
jest.mock('@/lib/storage');
jest.mock('@/lib/slack');

describe('PATMonitor', () => {
  let patMonitor: PATMonitor;
  let mockStorage: jest.Mocked<Storage>;
  let mockSlackPoster: jest.Mocked<SlackPoster>;
  let mockFigmaClient: jest.Mocked<FigmaClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockStorage = {
      getAllUserAccounts: jest.fn(),
      decryptPAT: jest.fn(),
    } as any;

    mockSlackPoster = {
      postMessage: jest.fn(),
    } as any;

    // Mock FigmaClient constructor and methods
    mockFigmaClient = {
      getMe: jest.fn(),
    } as any;

    (FigmaClient as jest.MockedClass<typeof FigmaClient>).mockImplementation(() => mockFigmaClient);

    patMonitor = new PATMonitor(mockStorage, mockSlackPoster);
  });

  describe('extractExpiration', () => {
    it('should extract expiration from expires_at field', () => {
      const figmaUser = {
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expires_at: '2027-02-26T09:00:00Z',
      } as any;

      const expiration = PATMonitor.extractExpiration(figmaUser);
      expect(expiration).toBe('2027-02-26T09:00:00Z');
    });

    it('should extract expiration from expiresAt field', () => {
      const figmaUser = {
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expiresAt: '2027-02-26T09:00:00Z',
      } as any;

      const expiration = PATMonitor.extractExpiration(figmaUser);
      expect(expiration).toBe('2027-02-26T09:00:00Z');
    });

    it('should extract expiration from expiration field', () => {
      const figmaUser = {
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expiration: '2027-02-26T09:00:00Z',
      } as any;

      const expiration = PATMonitor.extractExpiration(figmaUser);
      expect(expiration).toBe('2027-02-26T09:00:00Z');
    });

    it('should return null when no expiration field exists', () => {
      const figmaUser: FigmaUser = {
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
      };

      const expiration = PATMonitor.extractExpiration(figmaUser);
      expect(expiration).toBeNull();
    });
  });

  describe('checkPATExpiration', () => {
    it('should return status for PAT expiring in 2 days', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      const expiresAt = futureDate.toISOString();

      mockFigmaClient.getMe.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expires_at: expiresAt,
      } as any);

      const status = await patMonitor.checkPATExpiration('user1', 'test-account', 'test-pat');

      expect(status.userId).toBe('user1');
      expect(status.accountName).toBe('test-account');
      expect(status.expiresAt).toBe(expiresAt);
      expect(status.daysUntilExpiry).toBe(2);
      expect(status.isExpired).toBe(false);
      expect(status.needsWarning).toBe(true);
    });

    it('should return status for expired PAT', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const expiresAt = pastDate.toISOString();

      mockFigmaClient.getMe.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expires_at: expiresAt,
      } as any);

      const status = await patMonitor.checkPATExpiration('user1', 'test-account', 'test-pat');

      expect(status.isExpired).toBe(true);
      expect(status.needsWarning).toBe(true);
      expect(status.daysUntilExpiry).toBeLessThanOrEqual(0);
    });

    it('should return status for PAT expiring in 5 days (no warning)', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const expiresAt = futureDate.toISOString();

      mockFigmaClient.getMe.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expires_at: expiresAt,
      } as any);

      const status = await patMonitor.checkPATExpiration('user1', 'test-account', 'test-pat');

      expect(status.isExpired).toBe(false);
      expect(status.needsWarning).toBe(false);
      expect(status.daysUntilExpiry).toBe(5);
    });

    it('should return status with null expiration when not available', async () => {
      mockFigmaClient.getMe.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
      });

      const status = await patMonitor.checkPATExpiration('user1', 'test-account', 'test-pat');

      expect(status.expiresAt).toBeNull();
      expect(status.daysUntilExpiry).toBeNull();
      expect(status.isExpired).toBe(false);
      expect(status.needsWarning).toBe(false);
    });

    it('should handle API errors and mark PAT as expired', async () => {
      mockFigmaClient.getMe.mockRejectedValue(new Error('API error'));

      const status = await patMonitor.checkPATExpiration('user1', 'test-account', 'test-pat');

      expect(status.isExpired).toBe(true);
      expect(status.needsWarning).toBe(true);
      expect(status.expiresAt).toBeNull();
    });
  });

  describe('checkAllPATs', () => {
    it('should return empty array when no accounts exist', async () => {
      mockStorage.getAllUserAccounts.mockResolvedValue([]);

      const statuses = await patMonitor.checkAllPATs();

      expect(statuses).toEqual([]);
    });

    it('should return only PATs that need warnings', async () => {
      const accounts: UserAccount[] = [
        {
          userId: 'user1',
          accountName: 'account1',
          encryptedPAT: 'encrypted1',
          createdAt: '2026-02-26T09:00:00Z',
          updatedAt: '2026-02-26T09:00:00Z',
        },
        {
          userId: 'user1',
          accountName: 'account2',
          encryptedPAT: 'encrypted2',
          createdAt: '2026-02-26T09:00:00Z',
          updatedAt: '2026-02-26T09:00:00Z',
        },
      ];

      mockStorage.getAllUserAccounts.mockResolvedValue(accounts);
      mockStorage.decryptPAT.mockReturnValue('decrypted-pat');

      // First account expires in 2 days (needs warning)
      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 2);
      
      // Second account expires in 10 days (no warning)
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + 10);

      mockFigmaClient.getMe
        .mockResolvedValueOnce({
          id: 'user1',
          email: 'test@example.com',
          handle: 'testuser',
          img_url: 'https://example.com/img.png',
          expires_at: futureDate1.toISOString(),
        } as any)
        .mockResolvedValueOnce({
          id: 'user1',
          email: 'test@example.com',
          handle: 'testuser',
          img_url: 'https://example.com/img.png',
          expires_at: futureDate2.toISOString(),
        } as any);

      const statuses = await patMonitor.checkAllPATs();

      expect(statuses).toHaveLength(1);
      expect(statuses[0].accountName).toBe('account1');
      expect(statuses[0].needsWarning).toBe(true);
    });
  });

  describe('postConsolidatedWarnings', () => {
    it('should not post message when no statuses provided', async () => {
      await patMonitor.postConsolidatedWarnings([]);

      expect(mockSlackPoster.postMessage).not.toHaveBeenCalled();
    });

    it('should post consolidated message for expired PATs', async () => {
      const statuses: PATStatus[] = [
        {
          userId: 'user1',
          accountName: 'account1',
          expiresAt: '2026-02-25T09:00:00Z',
          daysUntilExpiry: -1,
          isExpired: true,
          needsWarning: true,
        },
      ];

      await patMonitor.postConsolidatedWarnings(statuses);

      expect(mockSlackPoster.postMessage).toHaveBeenCalledTimes(1);
      const message = mockSlackPoster.postMessage.mock.calls[0][0].text;
      expect(message).toContain('🚨 URGENT: Expired Figma PATs');
      expect(message).toContain('User: user1');
      expect(message).toContain('Account: account1');
      expect(message).toContain('Expired: 2026-02-25T09:00:00Z');
    });

    it('should post consolidated message for expiring PATs', async () => {
      const statuses: PATStatus[] = [
        {
          userId: 'user1',
          accountName: 'account1',
          expiresAt: '2026-02-28T09:00:00Z',
          daysUntilExpiry: 2,
          isExpired: false,
          needsWarning: true,
        },
      ];

      await patMonitor.postConsolidatedWarnings(statuses);

      expect(mockSlackPoster.postMessage).toHaveBeenCalledTimes(1);
      const message = mockSlackPoster.postMessage.mock.calls[0][0].text;
      expect(message).toContain('⚠️ WARNING: Figma PATs Expiring Soon');
      expect(message).toContain('User: user1');
      expect(message).toContain('Account: account1');
      expect(message).toContain('Expires: 2026-02-28T09:00:00Z');
      expect(message).toContain('2 days remaining');
    });

    it('should consolidate both expired and expiring PATs in single message', async () => {
      const statuses: PATStatus[] = [
        {
          userId: 'user1',
          accountName: 'account1',
          expiresAt: '2026-02-25T09:00:00Z',
          daysUntilExpiry: -1,
          isExpired: true,
          needsWarning: true,
        },
        {
          userId: 'user2',
          accountName: 'account2',
          expiresAt: '2026-02-28T09:00:00Z',
          daysUntilExpiry: 2,
          isExpired: false,
          needsWarning: true,
        },
      ];

      await patMonitor.postConsolidatedWarnings(statuses);

      expect(mockSlackPoster.postMessage).toHaveBeenCalledTimes(1);
      const message = mockSlackPoster.postMessage.mock.calls[0][0].text;
      expect(message).toContain('🚨 URGENT: Expired Figma PATs');
      expect(message).toContain('⚠️ WARNING: Figma PATs Expiring Soon');
      expect(message).toContain('user1');
      expect(message).toContain('user2');
    });
  });

  describe('checkAndNotify', () => {
    it('should check all PATs and post warnings', async () => {
      const accounts: UserAccount[] = [
        {
          userId: 'user1',
          accountName: 'account1',
          encryptedPAT: 'encrypted1',
          createdAt: '2026-02-26T09:00:00Z',
          updatedAt: '2026-02-26T09:00:00Z',
        },
      ];

      mockStorage.getAllUserAccounts.mockResolvedValue(accounts);
      mockStorage.decryptPAT.mockReturnValue('decrypted-pat');

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      mockFigmaClient.getMe.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/img.png',
        expires_at: futureDate.toISOString(),
      } as any);

      const statuses = await patMonitor.checkAndNotify();

      expect(statuses).toHaveLength(1);
      expect(mockSlackPoster.postMessage).toHaveBeenCalledTimes(1);
    });

    it('should not post warnings when no PATs need warnings', async () => {
      mockStorage.getAllUserAccounts.mockResolvedValue([]);

      const statuses = await patMonitor.checkAndNotify();

      expect(statuses).toEqual([]);
      expect(mockSlackPoster.postMessage).not.toHaveBeenCalled();
    });
  });
});
