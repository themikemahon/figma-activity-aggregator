import { loadConfig, ConfigError } from '@/lib/config';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load all required environment variables', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.KV_REST_API_URL = 'https://kv.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    const config = loadConfig();

    expect(config.slackWebhookUrl).toBe('https://hooks.slack.com/test');
    expect(config.encryptionKey).toBe('test-key');
    expect(config.kvRestApiUrl).toBe('https://kv.test');
    expect(config.kvRestApiToken).toBe('test-token');
    expect(config.nextAuthSecret).toBe('test-secret');
    expect(config.nextAuthUrl).toBe('http://localhost:3000');
  });

  it('should throw ConfigError when required variable is missing', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    // Missing other required variables

    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it('should parse optional ALLOWED_EMAILS as array', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.KV_REST_API_URL = 'https://kv.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.ALLOWED_EMAILS = 'user1@test.com,user2@test.com';

    const config = loadConfig();

    expect(config.allowedEmails).toEqual(['user1@test.com', 'user2@test.com']);
  });

  it('should use default value for DIGEST_LOOKBACK_HOURS', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.KV_REST_API_URL = 'https://kv.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    const config = loadConfig();

    expect(config.digestLookbackHours).toBe(24);
  });

  it('should parse custom DIGEST_LOOKBACK_HOURS', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.KV_REST_API_URL = 'https://kv.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.DIGEST_LOOKBACK_HOURS = '48';

    const config = loadConfig();

    expect(config.digestLookbackHours).toBe(48);
  });
});
