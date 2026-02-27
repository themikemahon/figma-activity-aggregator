import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';
import { FigmaClient } from '@/lib/figmaClient';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ConfigAccountsAPI');

/**
 * GET /api/config/accounts
 * List user's configured Figma accounts
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      logger.warn('Unauthorized access attempt', {
        operation: 'GET',
      });
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    logger.debug('Fetching user accounts', {
      operation: 'GET',
      userEmail: session.user.email,
    });

    // Get user's accounts (use email as userId for JWT sessions)
    const userId = session.user.email || 'unknown';
    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const accounts = await storage.getUserAccounts(userId);

    // Mask PAT values (show only last 4 characters)
    const maskedAccounts = accounts.map(account => ({
      accountName: account.accountName,
      maskedPAT: `****...${storage.decryptPAT(account.encryptedPAT).slice(-4)}`,
      expiresAt: account.expiresAt || null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

    logger.info('User accounts fetched successfully', {
      operation: 'GET',
      userEmail: session.user.email,
      accountCount: accounts.length,
    });

    return NextResponse.json({ accounts: maskedAccounts });
  } catch (error) {
    logger.fatalError(
      'Error fetching accounts',
      error instanceof Error ? error : new Error('Unknown error'),
      { operation: 'GET' }
    );
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config/accounts
 * Add new Figma account with PAT validation
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      logger.warn('Unauthorized access attempt', {
        operation: 'POST',
      });
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    // Debug: Log the full session to see what we're getting
    console.log('[ConfigAPI] Full session:', JSON.stringify(session, null, 2));
    console.log('[ConfigAPI] Session user:', JSON.stringify(session.user, null, 2));

    // Parse request body
    const body = await request.json();
    const { accountName, pat, teamIds } = body;

    // Use email as userId for JWT sessions
    const userId = session?.user?.email || 'unknown';
    
    console.log('[ConfigAPI] Using userId:', userId);

    logger.debug('Adding new account', {
      operation: 'POST',
      userEmail: session?.user?.email,
      accountName,
      hasTeamIds: !!teamIds && Array.isArray(teamIds) && teamIds.length > 0,
    });

    // Validate input
    if (!accountName || typeof accountName !== 'string') {
      logger.warn('Invalid account name', {
        operation: 'POST',
        userEmail: session.user.email,
      });
      return NextResponse.json(
        { error: 'Account name is required' },
        { status: 400 }
      );
    }

    if (!pat || typeof pat !== 'string') {
      logger.warn('Invalid PAT', {
        operation: 'POST',
        userEmail: session.user.email,
        accountName,
      });
      return NextResponse.json(
        { error: 'PAT is required' },
        { status: 400 }
      );
    }

    // Validate account name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(accountName)) {
      logger.warn('Invalid account name format', {
        operation: 'POST',
        userEmail: session.user.email,
        accountName,
      });
      return NextResponse.json(
        { error: 'Account name can only contain letters, numbers, hyphens, and underscores' },
        { status: 400 }
      );
    }

    // Check if account name already exists for this user
    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const existingAccounts = await storage.getUserAccounts(userId);
    
    if (existingAccounts.some(acc => acc.accountName === accountName)) {
      logger.warn('Account name already exists', {
        operation: 'POST',
        userEmail: session.user.email,
        accountName,
      });
      return NextResponse.json(
        { error: `Account "${accountName}" already exists` },
        { status: 400 }
      );
    }

    // Validate PAT by making a test API call to Figma
    logger.debug('Validating PAT with Figma API', {
      operation: 'POST',
      userEmail: session.user.email,
      accountName,
    });

    const figmaClient = new FigmaClient({
      accessToken: pat,
      accountName,
    });

    let figmaUser;
    try {
      figmaUser = await figmaClient.getMe();
    } catch (error: any) {
      if (error.status === 401 || error.status === 403) {
        logger.warn('PAT validation failed - authentication error', {
          operation: 'POST',
          userEmail: session.user.email,
          accountName,
          status: error.status,
        });
        return NextResponse.json(
          { error: 'Invalid PAT: Authentication failed with Figma API' },
          { status: 400 }
        );
      }
      
      logger.warn('PAT validation failed', {
        operation: 'POST',
        userEmail: session.user.email,
        accountName,
        error: error.message,
      });
      
      // For other errors, provide more context
      return NextResponse.json(
        { error: `PAT validation failed: ${error.message}` },
        { status: 400 }
      );
    }

    // Extract expiration date if available (Figma may not always provide this)
    // Note: Figma API doesn't always return expiration in the /me endpoint
    // This would need to be extracted from the PAT itself or another endpoint
    const expiresAt = undefined; // TODO: Extract from Figma API if available

    // Encrypt and store PAT
    const encryptedPAT = storage.encryptPAT(pat);
    const now = new Date().toISOString();

    await storage.saveUserAccount({
      userId,
      accountName,
      encryptedPAT,
      teamIds: teamIds && Array.isArray(teamIds) ? teamIds : undefined,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    logger.info('Account added successfully', {
      operation: 'POST',
      userEmail: session.user.email,
      accountName,
      figmaUserId: figmaUser.id,
      teamIdsCount: teamIds?.length || 0,
    });

    return NextResponse.json({
      success: true,
      accountName,
      figmaUser: {
        id: figmaUser.id,
        handle: figmaUser.handle,
        email: figmaUser.email,
      },
    });
  } catch (error) {
    logger.fatalError(
      'Error adding account',
      error instanceof Error ? error : new Error('Unknown error'),
      { operation: 'POST' }
    );
    return NextResponse.json(
      { error: 'Failed to add account' },
      { status: 500 }
    );
  }
}
