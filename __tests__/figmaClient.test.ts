/**
 * Unit tests for FigmaClient
 */

import { FigmaClient, FigmaAPIError } from '../lib/figmaClient';

// Mock fetch globally
global.fetch = jest.fn();

describe('FigmaClient', () => {
  let client: FigmaClient;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    client = new FigmaClient({
      accessToken: 'test-token',
      accountName: 'test-account',
    });
    mockFetch.mockClear();
  });

  describe('Constructor and Authentication', () => {
    it('should create client with PAT and account name', () => {
      expect(client).toBeInstanceOf(FigmaClient);
    });
  });

  describe('getMe', () => {
    it('should fetch user information', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        handle: 'testuser',
        img_url: 'https://example.com/avatar.png',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser }),
        headers: new Headers(),
      } as Response);

      const result = await client.getMe();

      expect(result).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Figma-Token': 'test-token',
          }),
        })
      );
    });
  });

  describe('listTeamProjects', () => {
    it('should fetch projects for a team', async () => {
      const mockProjects = [
        { id: 'proj1', name: 'Project 1' },
        { id: 'proj2', name: 'Project 2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ projects: mockProjects }),
        headers: new Headers(),
      } as Response);

      const result = await client.listTeamProjects('team123');

      expect(result).toEqual(mockProjects);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/teams/team123/projects',
        expect.any(Object)
      );
    });
  });

  describe('listProjectFiles', () => {
    it('should fetch files in a project', async () => {
      const mockFiles = [
        {
          key: 'file1',
          name: 'File 1',
          thumbnail_url: 'https://example.com/thumb1.png',
          last_modified: '2026-02-26T09:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ files: mockFiles }),
        headers: new Headers(),
      } as Response);

      const result = await client.listProjectFiles('proj123');

      expect(result).toEqual(mockFiles);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/projects/proj123/files',
        expect.any(Object)
      );
    });
  });

  describe('listFileVersions', () => {
    it('should fetch file versions without since parameter', async () => {
      const mockVersions = [
        {
          id: 'v1',
          created_at: '2026-02-26T09:00:00Z',
          label: 'Version 1',
          description: 'Test version',
          user: {
            id: 'user1',
            handle: 'testuser',
            img_url: 'https://example.com/avatar.png',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ versions: mockVersions }),
        headers: new Headers(),
      } as Response);

      const result = await client.listFileVersions('file123');

      expect(result).toEqual(mockVersions);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/file123/versions',
        expect.any(Object)
      );
    });

    it('should fetch file versions with since parameter', async () => {
      const mockVersions = [
        {
          id: 'v2',
          created_at: '2026-02-26T10:00:00Z',
          label: 'Version 2',
          description: 'New version',
          user: {
            id: 'user1',
            handle: 'testuser',
            img_url: 'https://example.com/avatar.png',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ versions: mockVersions }),
        headers: new Headers(),
      } as Response);

      const result = await client.listFileVersions('file123', {
        since: '2026-02-26T09:00:00Z',
      });

      expect(result).toEqual(mockVersions);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/file123/versions?since=2026-02-26T09%3A00%3A00Z',
        expect.any(Object)
      );
    });
  });

  describe('listFileComments', () => {
    it('should fetch comments on a file', async () => {
      const mockComments = [
        {
          id: 'comment1',
          file_key: 'file123',
          parent_id: '',
          user: {
            id: 'user1',
            handle: 'testuser',
            img_url: 'https://example.com/avatar.png',
          },
          created_at: '2026-02-26T09:00:00Z',
          resolved_at: null,
          message: 'Test comment',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ comments: mockComments }),
        headers: new Headers(),
      } as Response);

      const result = await client.listFileComments('file123');

      expect(result).toEqual(mockComments);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/file123/comments',
        expect.any(Object)
      );
    });
  });

  describe('getFileMeta', () => {
    it('should fetch file metadata', async () => {
      const mockMeta = {
        name: 'Test File',
        last_modified: '2026-02-26T09:00:00Z',
        thumbnail_url: 'https://example.com/thumb.png',
        version: '1.0',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockMeta,
        headers: new Headers(),
      } as Response);

      const result = await client.getFileMeta('file123');

      expect(result).toEqual(mockMeta);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/file123?fields=name,last_modified,thumbnail_url,version',
        expect.any(Object)
      );
    });
  });

  describe('Rate Limit Handling', () => {
    it('should throw recoverable error on 429 with Retry-After header', async () => {
      const headers = new Headers();
      headers.set('Retry-After', '60');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
        headers,
      } as Response);

      try {
        await client.getMe();
        fail('Should have thrown FigmaAPIError');
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).status).toBe(429);
        expect((error as FigmaAPIError).isRecoverable).toBe(true);
        expect((error as FigmaAPIError).accountName).toBe('test-account');
      }
    });

    it('should handle 429 without Retry-After header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
        headers: new Headers(),
      } as Response);

      try {
        await client.getMe();
        fail('Should have thrown FigmaAPIError');
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).message).toContain('60 seconds');
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw fatal error on 401 (unauthorized)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
        headers: new Headers(),
      } as Response);

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).status).toBe(401);
        expect((error as FigmaAPIError).isRecoverable).toBe(false);
        expect((error as FigmaAPIError).message).toContain('Invalid or expired PAT');
      }
    });

    it('should throw fatal error on 403 (forbidden)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
        headers: new Headers(),
      } as Response);

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).status).toBe(403);
        expect((error as FigmaAPIError).isRecoverable).toBe(false);
      }
    });

    it('should throw recoverable error on 500 (server error)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        headers: new Headers(),
      } as Response);

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).status).toBe(500);
        expect((error as FigmaAPIError).isRecoverable).toBe(true);
        expect((error as FigmaAPIError).message).toContain('temporary failure');
      }
    });

    it('should throw recoverable error on 503 (service unavailable)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
        headers: new Headers(),
      } as Response);

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).status).toBe(503);
        expect((error as FigmaAPIError).isRecoverable).toBe(true);
      }
    });

    it('should include status code and response body in error', async () => {
      const errorBody = 'Bad Request: Invalid file key';
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => errorBody,
        headers: new Headers(),
      } as Response);

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).status).toBe(400);
        expect((error as FigmaAPIError).responseBody).toBe(errorBody);
      }
    });

    it('should handle network errors as recoverable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      try {
        await client.getMe();
      } catch (error) {
        expect(error).toBeInstanceOf(FigmaAPIError);
        expect((error as FigmaAPIError).isRecoverable).toBe(true);
        expect((error as FigmaAPIError).message).toContain('Network error');
      }
    });
  });
});
