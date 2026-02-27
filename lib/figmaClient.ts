/**
 * Figma API Client
 * Wrapper for Figma REST API interactions with rate limiting and error handling
 */

import { createLogger } from './logger';

const logger = createLogger('FigmaClient');

/**
 * Configuration for FigmaClient
 */
export interface FigmaClientConfig {
  accessToken: string;
  accountName: string;
}

/**
 * Figma user information
 */
export interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

/**
 * Figma project
 */
export interface FigmaProject {
  id: string;
  name: string;
}

/**
 * Figma file
 */
export interface FigmaFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

/**
 * Figma file version
 */
export interface FigmaVersion {
  id: string;
  created_at: string;  // ISO 8601
  label: string;
  description: string;
  user: {
    id: string;
    handle: string;
    img_url: string;
  };
}

/**
 * Figma comment
 */
export interface FigmaComment {
  id: string;
  file_key: string;
  parent_id: string;
  user: {
    id: string;
    handle: string;
    img_url: string;
  };
  created_at: string;  // ISO 8601
  resolved_at: string | null;
  message: string;
}

/**
 * Figma file metadata
 */
export interface FigmaFileMeta {
  name: string;
  last_modified: string;
  thumbnail_url: string;
  version: string;
}

/**
 * Error types for classification
 */
export class FigmaAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public responseBody: string,
    public accountName: string,
    public isRecoverable: boolean
  ) {
    super(message);
    this.name = 'FigmaAPIError';
  }
}

/**
 * Figma API Client
 * Handles authentication, rate limiting, and error handling
 */
export class FigmaClient {
  private accessToken: string;
  private accountName: string;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(config: FigmaClientConfig) {
    this.accessToken = config.accessToken;
    this.accountName = config.accountName;
  }

  /**
   * Get common headers for Figma API requests
   */
  private getHeaders(): HeadersInit {
    return {
      'X-Figma-Token': this.accessToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Make a request to Figma API with error handling and rate limiting
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();
    
    try {
      logger.debug('Making Figma API request', {
        operation: 'request',
        accountName: this.accountName,
        endpoint,
      });

      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      const duration = Date.now() - startTime;

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
        
        logger.recoverableError(
          'Figma API rate limit exceeded',
          new Error(`Rate limit exceeded. Retry after ${waitTime} seconds`),
          {
            operation: 'request',
            accountName: this.accountName,
            endpoint,
            status: 429,
            retryAfter: waitTime,
            duration,
          }
        );
        
        throw new FigmaAPIError(
          `Rate limit exceeded. Retry after ${waitTime} seconds`,
          429,
          await response.text(),
          this.accountName,
          true  // Recoverable
        );
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        logger.fatalError(
          'Figma API authentication failed',
          new Error('Invalid or expired PAT'),
          {
            operation: 'request',
            accountName: this.accountName,
            endpoint,
            status: response.status,
            duration,
          }
        );
        
        throw new FigmaAPIError(
          'Invalid or expired PAT',
          response.status,
          await response.text(),
          this.accountName,
          false  // Fatal
        );
      }

      // Handle server errors
      if (response.status >= 500) {
        logger.recoverableError(
          'Figma API server error',
          new Error('Figma API temporary failure'),
          {
            operation: 'request',
            accountName: this.accountName,
            endpoint,
            status: response.status,
            duration,
          }
        );
        
        throw new FigmaAPIError(
          'Figma API temporary failure',
          response.status,
          await response.text(),
          this.accountName,
          true  // Recoverable
        );
      }

      // Handle other errors
      if (!response.ok) {
        logger.fatalError(
          'Figma API request failed',
          new Error(`Figma API request failed: ${response.statusText}`),
          {
            operation: 'request',
            accountName: this.accountName,
            endpoint,
            status: response.status,
            duration,
          }
        );
        
        throw new FigmaAPIError(
          `Figma API request failed: ${response.statusText}`,
          response.status,
          await response.text(),
          this.accountName,
          false  // Fatal
        );
      }

      logger.info('Figma API request successful', {
        operation: 'request',
        accountName: this.accountName,
        endpoint,
        status: response.status,
        duration,
      });

      return await response.json();
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Re-throw FigmaAPIError as-is
      if (error instanceof FigmaAPIError) {
        throw error;
      }

      // Wrap other errors
      logger.recoverableError(
        'Figma API network error',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          operation: 'request',
          accountName: this.accountName,
          endpoint,
          duration,
        }
      );
      
      throw new FigmaAPIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        '',
        this.accountName,
        true  // Network errors are recoverable
      );
    }
  }

  /**
   * Get user info and team IDs
   */
  async getMe(): Promise<FigmaUser> {
    const response = await this.request<any>('/me');
    
    // Log the raw response to see structure
    logger.debug('Raw /me response', {
      operation: 'getMe',
      accountName: this.accountName,
      response: JSON.stringify(response),
      hasUser: !!response.user,
      hasId: !!response.id,
    });
    
    // The response might be { user: {...} } or just {...}
    const user = response.user || response;
    
    if (!user || !user.id) {
      throw new Error(`Invalid user response from Figma API: ${JSON.stringify(response)}`);
    }
    
    return user;
  }

  /**
   * List projects for a team
   */
  async listTeamProjects(teamId: string): Promise<FigmaProject[]> {
    const response = await this.request<{ projects: FigmaProject[] }>(
      `/teams/${teamId}/projects`
    );
    return response.projects;
  }

  /**
   * List files in a project
   */
  async listProjectFiles(projectId: string): Promise<FigmaFile[]> {
    const response = await this.request<{ files: FigmaFile[] }>(
      `/projects/${projectId}/files`
    );
    return response.files;
  }

  /**
   * Get file versions with pagination
   */
  async listFileVersions(
    fileKey: string,
    options?: { since?: string }
  ): Promise<FigmaVersion[]> {
    let endpoint = `/files/${fileKey}/versions`;
    
    if (options?.since) {
      endpoint += `?since=${encodeURIComponent(options.since)}`;
    }

    const response = await this.request<{ versions: FigmaVersion[] }>(endpoint);
    return response.versions;
  }

  /**
   * Get comments on a file
   */
  async listFileComments(fileKey: string): Promise<FigmaComment[]> {
    const response = await this.request<{ comments: FigmaComment[] }>(
      `/files/${fileKey}/comments`
    );
    return response.comments;
  }

  /**
   * Get user's recent files (discovers teams automatically)
   */
  async getRecentFiles(): Promise<FigmaFile[]> {
    const response = await this.request<{ files: FigmaFile[] }>('/files/recent');
    return response.files || [];
  }


  /**
   * Get file metadata
   */
  async getFileMeta(fileKey: string): Promise<FigmaFileMeta> {
    const response = await this.request<FigmaFileMeta>(
      `/files/${fileKey}?fields=name,last_modified,thumbnail_url,version`
    );
    return response;
  }
}
