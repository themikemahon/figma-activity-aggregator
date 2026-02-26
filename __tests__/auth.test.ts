import { isEmailAllowed } from '../lib/auth';

describe('Authentication Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isEmailAllowed', () => {
    it('should allow all emails when no whitelist is configured', () => {
      delete process.env.ALLOWED_EMAILS;
      
      expect(isEmailAllowed('user@example.com')).toBe(true);
      expect(isEmailAllowed('anyone@anywhere.com')).toBe(true);
    });

    it('should allow whitelisted emails', () => {
      process.env.ALLOWED_EMAILS = 'user1@example.com,user2@example.com';
      
      expect(isEmailAllowed('user1@example.com')).toBe(true);
      expect(isEmailAllowed('user2@example.com')).toBe(true);
    });

    it('should deny non-whitelisted emails', () => {
      process.env.ALLOWED_EMAILS = 'user1@example.com,user2@example.com';
      
      expect(isEmailAllowed('user3@example.com')).toBe(false);
      expect(isEmailAllowed('hacker@evil.com')).toBe(false);
    });

    it('should be case-insensitive', () => {
      process.env.ALLOWED_EMAILS = 'User@Example.COM';
      
      expect(isEmailAllowed('user@example.com')).toBe(true);
      expect(isEmailAllowed('USER@EXAMPLE.COM')).toBe(true);
      expect(isEmailAllowed('UsEr@ExAmPlE.cOm')).toBe(true);
    });

    it('should handle whitespace in whitelist', () => {
      process.env.ALLOWED_EMAILS = ' user1@example.com , user2@example.com ';
      
      expect(isEmailAllowed('user1@example.com')).toBe(true);
      expect(isEmailAllowed('user2@example.com')).toBe(true);
    });

    it('should handle single email in whitelist', () => {
      process.env.ALLOWED_EMAILS = 'single@example.com';
      
      expect(isEmailAllowed('single@example.com')).toBe(true);
      expect(isEmailAllowed('other@example.com')).toBe(false);
    });

    it('should handle empty whitelist string', () => {
      process.env.ALLOWED_EMAILS = '';
      
      // Empty string means whitelist is configured but empty, so deny all
      expect(isEmailAllowed('user@example.com')).toBe(false);
    });
  });
});
