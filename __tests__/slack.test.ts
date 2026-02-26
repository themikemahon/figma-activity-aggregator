import { SlackPoster, SlackMessage } from '@/lib/slack';

// Mock fetch globally
global.fetch = jest.fn();

describe('SlackPoster', () => {
  let slackPoster: SlackPoster;
  const mockWebhookUrl = 'https://hooks.slack.com/services/TEST/WEBHOOK/URL';

  beforeEach(() => {
    jest.clearAllMocks();
    slackPoster = new SlackPoster({ webhookUrl: mockWebhookUrl });
  });

  describe('Constructor', () => {
    it('should throw error if webhook URL is missing', () => {
      expect(() => new SlackPoster({ webhookUrl: '' })).toThrow('Slack webhook URL is required');
    });

    it('should create instance with valid webhook URL', () => {
      expect(() => new SlackPoster({ webhookUrl: mockWebhookUrl })).not.toThrow();
    });
  });

  describe('postMessage', () => {
    it('should post message successfully', async () => {
      const mockResponse = { ok: true, status: 200, text: async () => 'ok' };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const message: SlackMessage = { text: 'Test message' };
      await slackPoster.postMessage(message);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        mockWebhookUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        }
      );
    });

    it('should retry on 5xx errors with exponential backoff', async () => {
      const mockError = { ok: false, status: 500, text: async () => 'Server error' };
      const mockSuccess = { ok: true, status: 200, text: async () => 'ok' };
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockError)
        .mockResolvedValueOnce(mockSuccess);

      const message: SlackMessage = { text: 'Test message' };
      await slackPoster.postMessage(message);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after 3 failed attempts', async () => {
      const mockError = { ok: false, status: 500, text: async () => 'Server error' };
      (global.fetch as jest.Mock).mockResolvedValue(mockError);

      const message: SlackMessage = { text: 'Test message' };
      
      await expect(slackPoster.postMessage(message)).rejects.toThrow('Slack webhook failed: 500');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error immediately on 4xx errors', async () => {
      const mockError = { ok: false, status: 400, text: async () => 'Bad request' };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockError);

      const message: SlackMessage = { text: 'Test message' };
      
      await expect(slackPoster.postMessage(message)).rejects.toThrow('Slack webhook failed: 400');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors with retry', async () => {
      const networkError = new Error('Network error');
      const mockSuccess = { ok: true, status: 200, text: async () => 'ok' };
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockSuccess);

      const message: SlackMessage = { text: 'Test message' };
      await slackPoster.postMessage(message);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('postMessages', () => {
    it('should post multiple messages with rate limiting', async () => {
      const mockResponse = { ok: true, status: 200, text: async () => 'ok' };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const messages: SlackMessage[] = [
        { text: 'Message 1' },
        { text: 'Message 2' },
        { text: 'Message 3' },
      ];

      const startTime = Date.now();
      await slackPoster.postMessages(messages);
      const duration = Date.now() - startTime;

      expect(global.fetch).toHaveBeenCalledTimes(3);
      // Should take at least 2 seconds (2 delays of 1 second each between 3 messages)
      expect(duration).toBeGreaterThanOrEqual(1900); // Allow some margin
    });

    it('should handle empty message array', async () => {
      await slackPoster.postMessages([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should post single message without delay', async () => {
      const mockResponse = { ok: true, status: 200, text: async () => 'ok' };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const messages: SlackMessage[] = [{ text: 'Single message' }];

      const startTime = Date.now();
      await slackPoster.postMessages(messages);
      const duration = Date.now() - startTime;

      expect(global.fetch).toHaveBeenCalledTimes(1);
      // Should complete quickly without delay
      expect(duration).toBeLessThan(500);
    });
  });

  describe('postPATWarning', () => {
    it('should post warning for PAT expiring soon', async () => {
      const mockResponse = { ok: true, status: 200, text: async () => 'ok' };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      await slackPoster.postPATWarning(
        'John Doe',
        'client-account',
        '2026-03-01T00:00:00Z',
        2
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.text).toContain('⚠️ WARNING');
      expect(body.text).toContain('John Doe');
      expect(body.text).toContain('client-account');
      expect(body.text).toContain('2026-03-01T00:00:00Z');
      expect(body.text).toContain('Days remaining: 2');
    });

    it('should post urgent warning for expired PAT', async () => {
      const mockResponse = { ok: true, status: 200, text: async () => 'ok' };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      await slackPoster.postPATWarning(
        'Jane Smith',
        'main-account',
        '2026-02-20T00:00:00Z',
        -5
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.text).toContain('🚨 URGENT');
      expect(body.text).toContain('Expired');
      expect(body.text).toContain('Jane Smith');
      expect(body.text).toContain('main-account');
      expect(body.text).toContain('2026-02-20T00:00:00Z');
    });

    it('should post urgent warning for PAT expiring today (0 days)', async () => {
      const mockResponse = { ok: true, status: 200, text: async () => 'ok' };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      await slackPoster.postPATWarning(
        'Bob Johnson',
        'test-account',
        '2026-02-26T23:59:59Z',
        0
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      expect(body.text).toContain('🚨 URGENT');
      expect(body.text).toContain('Expired');
    });
  });
});
