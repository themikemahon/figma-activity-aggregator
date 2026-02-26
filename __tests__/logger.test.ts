import { createLogger, sanitize, Logger } from '../lib/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  
  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });
  
  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });
  
  describe('Structured Logging', () => {
    it('should log with JSON format', () => {
      const logger = createLogger('TestComponent');
      logger.info('Test message', { operation: 'test' });
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed).toMatchObject({
        level: 'INFO',
        message: 'Test message',
        context: {
          component: 'TestComponent',
          operation: 'test',
        },
      });
      expect(parsed.timestamp).toBeDefined();
    });
    
    it('should include component name in all logs', () => {
      const logger = createLogger('FigmaClient');
      logger.error('API failed');
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context.component).toBe('FigmaClient');
    });
    
    it('should include timestamp in ISO 8601 format', () => {
      const logger = createLogger('TestComponent');
      logger.info('Test');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
  
  describe('Sensitive Data Sanitization', () => {
    it('should redact Figma PATs', () => {
      const data = {
        token: 'figd_abc123def456',
        message: 'Using token figd_xyz789',
      };
      
      const sanitized = sanitize(data);
      
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.message).toBe('Using token [REDACTED]');
    });
    
    it('should redact Slack webhook URLs', () => {
      const data = {
        webhookUrl: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX',
        message: 'Posting to https://hooks.slack.com/services/T11111111/B11111111/YYYYYYYYYYYYYYYYYYYY',
      };
      
      const sanitized = sanitize(data);
      
      expect(sanitized.webhookUrl).toBe('[REDACTED]');
      expect(sanitized.message).toBe('Posting to [REDACTED]');
    });
    
    it('should redact authorization headers', () => {
      const data = {
        headers: {
          authorization: 'Bearer abc123',
          'content-type': 'application/json',
        },
      };
      
      const sanitized = sanitize(data);
      
      expect(sanitized.headers.authorization).toBe('[REDACTED]');
      expect(sanitized.headers['content-type']).toBe('application/json');
    });
    
    it('should redact sensitive keys', () => {
      const data = {
        pat: 'secret-token',
        password: 'secret-password',
        accessToken: 'secret-access',
        normalField: 'normal-value',
      };
      
      const sanitized = sanitize(data);
      
      expect(sanitized.pat).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.accessToken).toBe('[REDACTED]');
      expect(sanitized.normalField).toBe('normal-value');
    });
    
    it('should handle nested objects', () => {
      const data = {
        user: {
          email: 'test@example.com',
          token: 'figd_secret123',
        },
        config: {
          webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
        },
      };
      
      const sanitized = sanitize(data);
      
      expect(sanitized.user.email).toBe('test@example.com');
      expect(sanitized.user.token).toBe('[REDACTED]');
      expect(sanitized.config.webhookUrl).toBe('[REDACTED]');
    });
    
    it('should handle arrays', () => {
      const data = {
        tokens: ['figd_token1', 'figd_token2'],
        messages: ['normal message', 'token: figd_secret'],
      };
      
      const sanitized = sanitize(data);
      
      expect(sanitized.tokens).toEqual(['[REDACTED]', '[REDACTED]']);
      expect(sanitized.messages[0]).toBe('normal message');
      expect(sanitized.messages[1]).toBe('token: [REDACTED]');
    });
  });
  
  describe('Error Classification', () => {
    it('should log recoverable errors with classification', () => {
      const logger = createLogger('TestComponent');
      const error = new Error('Rate limit exceeded');
      
      logger.recoverableError('API rate limited', error, {
        operation: 'fetchData',
        status: 429,
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context.classification).toBe('recoverable');
      expect(parsed.context.error).toBe('Rate limit exceeded');
      expect(parsed.context.stack).toBeDefined();
      expect(parsed.context.operation).toBe('fetchData');
      expect(parsed.context.status).toBe(429);
    });
    
    it('should log fatal errors with classification', () => {
      const logger = createLogger('TestComponent');
      const error = new Error('Invalid PAT');
      
      logger.fatalError('Authentication failed', error, {
        operation: 'authenticate',
        accountName: 'test-account',
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context.classification).toBe('fatal');
      expect(parsed.context.error).toBe('Invalid PAT');
      expect(parsed.context.accountName).toBe('test-account');
    });
    
    it('should log partial failures with classification', () => {
      const logger = createLogger('TestComponent');
      const error = new Error('Account processing failed');
      
      logger.partialFailure('Some accounts failed', error, {
        operation: 'processAccounts',
        accountName: 'failed-account',
      });
      
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context.classification).toBe('partial');
      expect(parsed.context.error).toBe('Account processing failed');
    });
  });
  
  describe('Log Levels', () => {
    it('should log debug messages', () => {
      const logger = createLogger('TestComponent');
      logger.debug('Debug message', { detail: 'test' });
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleDebugSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('DEBUG');
    });
    
    it('should log info messages', () => {
      const logger = createLogger('TestComponent');
      logger.info('Info message');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('INFO');
    });
    
    it('should log warning messages', () => {
      const logger = createLogger('TestComponent');
      logger.warn('Warning message');
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('WARN');
    });
    
    it('should log error messages', () => {
      const logger = createLogger('TestComponent');
      logger.error('Error message');
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('ERROR');
    });
  });
  
  describe('Context Handling', () => {
    it('should include operation context', () => {
      const logger = createLogger('FigmaClient');
      logger.info('Fetching data', {
        operation: 'listFileVersions',
        fileKey: 'abc123',
      });
      
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.context.operation).toBe('listFileVersions');
      expect(parsed.context.fileKey).toBe('abc123');
    });
    
    it('should include error stack traces', () => {
      const logger = createLogger('TestComponent');
      const error = new Error('Test error');
      
      logger.error('Operation failed', {
        error: error.message,
        stack: error.stack,
      });
      
      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.context.error).toBe('Test error');
      expect(parsed.context.stack).toBeDefined();
    });
    
    it('should handle missing context', () => {
      const logger = createLogger('TestComponent');
      logger.info('Simple message');
      
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.context.component).toBe('TestComponent');
      expect(Object.keys(parsed.context).length).toBe(1);
    });
  });
});
