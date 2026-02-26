import { Storage, UserAccount } from '@/lib/storage';
import { kv } from '@vercel/kv';

// Mock Vercel KV
jest.mock('@vercel/kv', () => ({
  kv: {
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

describe('Storage', () => {
  let storage: Storage;
  const mockEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new Storage(mockEncryptionKey);
  });

  describe('Constructor', () => {
    it('should throw error if encryption key is not 64 hex characters', () => {
      expect(() => new Storage('short-key')).toThrow('Encryption key must be 32 bytes (64 hex characters)');
    });

    it('should create storage instance with valid encryption key', () => {
      expect(() => new Storage(mockEncryptionKey)).not.toThrow();
    });
  });

  describe('PAT Encryption and Decryption', () => {
    it('should encrypt and decrypt PAT correctly', () => {
      const originalPAT = 'figd_test_pat_12345';
      
      const encrypted = storage.encryptPAT(originalPAT);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(originalPAT);
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = storage.decryptPAT(encrypted);
      expect(decrypted).toBe(originalPAT);
    });

    it('should generate unique IV for each encryption', () => {
      const pat = 'figd_test_pat_12345';
      
      const encrypted1 = storage.encryptPAT(pat);
      const encrypted2 = storage.encryptPAT(pat);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // Both should decrypt to same value
      expect(storage.decryptPAT(encrypted1)).toBe(pat);
      expect(storage.decryptPAT(encrypted2)).toBe(pat);
    });

    it('should throw error for invalid encrypted PAT format', () => {
      expect(() => storage.decryptPAT('invalid-format')).toThrow('Invalid encrypted PAT format');
    });
  });

  describe('saveUserAccount', () => {
    it('should save user account with all data', async () => {
      const account: UserAccount = {
        userId: 'user1',
        accountName: 'test-account',
        encryptedPAT: 'encrypted-pat',
        createdAt: '2026-02-26T09:00:00Z',
        updatedAt: '2026-02-26T09:00:00Z',
        expiresAt: '2027-02-26T09:00:00Z',
      };

      await storage.saveUserAccount(account);

      expect(kv.sadd).toHaveBeenCalledWith('users', 'user1');
      expect(kv.sadd).toHaveBeenCalledWith('user:user1:accounts', 'test-account');
      expect(kv.set).toHaveBeenCalledWith('user:user1:account:test-account:pat', 'encrypted-pat');
      expect(kv.set).toHaveBeenCalledWith('user:user1:account:test-account:createdAt', '2026-02-26T09:00:00Z');
      expect(kv.set).toHaveBeenCalledWith('user:user1:account:test-account:updatedAt', '2026-02-26T09:00:00Z');
      expect(kv.set).toHaveBeenCalledWith('user:user1:account:test-account:expires', '2027-02-26T09:00:00Z');
    });

    it('should save user account without expiration date', async () => {
      const account: UserAccount = {
        userId: 'user1',
        accountName: 'test-account',
        encryptedPAT: 'encrypted-pat',
        createdAt: '2026-02-26T09:00:00Z',
        updatedAt: '2026-02-26T09:00:00Z',
      };

      await storage.saveUserAccount(account);

      expect(kv.set).not.toHaveBeenCalledWith(
        'user:user1:account:test-account:expires',
        expect.anything()
      );
    });
  });

  describe('getUserAccounts', () => {
    it('should return empty array when user has no accounts', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue([]);

      const accounts = await storage.getUserAccounts('user1');

      expect(accounts).toEqual([]);
    });

    it('should return all accounts for a user', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue(['account1', 'account2']);
      (kv.get as jest.Mock)
        .mockResolvedValueOnce('encrypted-pat-1')
        .mockResolvedValueOnce('2026-02-26T09:00:00Z')
        .mockResolvedValueOnce('2026-02-26T09:00:00Z')
        .mockResolvedValueOnce('2027-02-26T09:00:00Z')
        .mockResolvedValueOnce('encrypted-pat-2')
        .mockResolvedValueOnce('2026-02-26T10:00:00Z')
        .mockResolvedValueOnce('2026-02-26T10:00:00Z')
        .mockResolvedValueOnce(null);

      const accounts = await storage.getUserAccounts('user1');

      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toEqual({
        userId: 'user1',
        accountName: 'account1',
        encryptedPAT: 'encrypted-pat-1',
        createdAt: '2026-02-26T09:00:00Z',
        updatedAt: '2026-02-26T09:00:00Z',
        expiresAt: '2027-02-26T09:00:00Z',
      });
      expect(accounts[1]).toEqual({
        userId: 'user1',
        accountName: 'account2',
        encryptedPAT: 'encrypted-pat-2',
        createdAt: '2026-02-26T10:00:00Z',
        updatedAt: '2026-02-26T10:00:00Z',
        expiresAt: undefined,
      });
    });

    it('should skip accounts with missing data', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue(['account1', 'account2']);
      (kv.get as jest.Mock)
        .mockResolvedValueOnce('encrypted-pat-1')
        .mockResolvedValueOnce('2026-02-26T09:00:00Z')
        .mockResolvedValueOnce('2026-02-26T09:00:00Z')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null) // Missing PAT for account2
        .mockResolvedValueOnce('2026-02-26T10:00:00Z')
        .mockResolvedValueOnce('2026-02-26T10:00:00Z')
        .mockResolvedValueOnce(null);

      const accounts = await storage.getUserAccounts('user1');

      expect(accounts).toHaveLength(1);
      expect(accounts[0].accountName).toBe('account1');
    });
  });

  describe('getAllUserAccounts', () => {
    it('should return empty array when no users exist', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue([]);

      const accounts = await storage.getAllUserAccounts();

      expect(accounts).toEqual([]);
    });

    it('should return accounts from all users', async () => {
      (kv.smembers as jest.Mock)
        .mockResolvedValueOnce(['user1', 'user2'])
        .mockResolvedValueOnce(['account1'])
        .mockResolvedValueOnce(['account2']);
      
      (kv.get as jest.Mock)
        .mockResolvedValueOnce('encrypted-pat-1')
        .mockResolvedValueOnce('2026-02-26T09:00:00Z')
        .mockResolvedValueOnce('2026-02-26T09:00:00Z')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('encrypted-pat-2')
        .mockResolvedValueOnce('2026-02-26T10:00:00Z')
        .mockResolvedValueOnce('2026-02-26T10:00:00Z')
        .mockResolvedValueOnce(null);

      const accounts = await storage.getAllUserAccounts();

      expect(accounts).toHaveLength(2);
      expect(accounts[0].userId).toBe('user1');
      expect(accounts[1].userId).toBe('user2');
    });
  });

  describe('deleteUserAccount', () => {
    it('should delete account and all associated data', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue(['other-account']);

      await storage.deleteUserAccount('user1', 'test-account');

      expect(kv.srem).toHaveBeenCalledWith('user:user1:accounts', 'test-account');
      expect(kv.del).toHaveBeenCalledWith('user:user1:account:test-account:pat');
      expect(kv.del).toHaveBeenCalledWith('user:user1:account:test-account:expires');
      expect(kv.del).toHaveBeenCalledWith('user:user1:account:test-account:lastDigest');
      expect(kv.del).toHaveBeenCalledWith('user:user1:account:test-account:createdAt');
      expect(kv.del).toHaveBeenCalledWith('user:user1:account:test-account:updatedAt');
    });

    it('should remove user from users set if no accounts remain', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue([]);

      await storage.deleteUserAccount('user1', 'last-account');

      expect(kv.srem).toHaveBeenCalledWith('users', 'user1');
      expect(kv.del).toHaveBeenCalledWith('user:user1:accounts');
    });

    it('should not remove user from users set if other accounts remain', async () => {
      (kv.smembers as jest.Mock).mockResolvedValue(['other-account']);

      await storage.deleteUserAccount('user1', 'test-account');

      expect(kv.srem).not.toHaveBeenCalledWith('users', 'user1');
      expect(kv.del).not.toHaveBeenCalledWith('user:user1:accounts');
    });
  });

  describe('Digest State Management', () => {
    it('should return null when no digest timestamp exists', async () => {
      (kv.get as jest.Mock).mockResolvedValue(null);

      const timestamp = await storage.getLastDigestTime('user1', 'test-account');

      expect(timestamp).toBeNull();
      expect(kv.get).toHaveBeenCalledWith('user:user1:account:test-account:lastDigest');
    });

    it('should return last digest timestamp', async () => {
      (kv.get as jest.Mock).mockResolvedValue('2026-02-26T09:00:00Z');

      const timestamp = await storage.getLastDigestTime('user1', 'test-account');

      expect(timestamp).toBe('2026-02-26T09:00:00Z');
    });

    it('should update last digest timestamp', async () => {
      await storage.updateLastDigestTime('user1', 'test-account', '2026-02-26T10:00:00Z');

      expect(kv.set).toHaveBeenCalledWith(
        'user:user1:account:test-account:lastDigest',
        '2026-02-26T10:00:00Z'
      );
    });
  });
});
