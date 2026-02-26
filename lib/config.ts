/**
 * Configuration management and validation
 * Ensures all required environment variables are present
 */

interface Config {
  slackWebhookUrl: string;
  encryptionKey: string;
  kvRestApiUrl: string;
  kvRestApiToken: string;
  nextAuthSecret: string;
  nextAuthUrl: string;
  allowedEmails?: string[];
  digestLookbackHours: number;
}

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

export function loadConfig(): Config {
  return {
    slackWebhookUrl: getRequiredEnv('SLACK_WEBHOOK_URL'),
    encryptionKey: getRequiredEnv('ENCRYPTION_KEY'),
    kvRestApiUrl: getRequiredEnv('KV_REST_API_URL'),
    kvRestApiToken: getRequiredEnv('KV_REST_API_TOKEN'),
    nextAuthSecret: getRequiredEnv('NEXTAUTH_SECRET'),
    nextAuthUrl: getRequiredEnv('NEXTAUTH_URL'),
    allowedEmails: getOptionalEnv('ALLOWED_EMAILS')?.split(',').map(e => e.trim()),
    digestLookbackHours: parseInt(getOptionalEnv('DIGEST_LOOKBACK_HOURS', '24') || '24', 10),
  };
}

export { ConfigError };
export type { Config };
