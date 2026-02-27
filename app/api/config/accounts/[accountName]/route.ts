import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ConfigAccountDeleteAPI');

/**
 * DELETE /api/config/accounts/:accountName
 * Remove a Figma account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountName: string }> }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      logger.warn('Unauthorized access attempt', {
        operation: 'DELETE',
      });
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    // Await params in Next.js 16+
    const { accountName } = await params;

    // Use email as userId for JWT sessions
    const userId = session.user.email || 'unknown';

    logger.debug('Deleting account', {
      operation: 'DELETE',
      userEmail: session.user.email,
      accountName,
    });

    // Validate account name
    if (!accountName || typeof accountName !== 'string') {
      logger.warn('Invalid account name', {
        operation: 'DELETE',
        userEmail: session.user.email,
      });
      return NextResponse.json(
        { error: 'Account name is required' },
        { status: 400 }
      );
    }

    // Check if account exists for this user
    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const existingAccounts = await storage.getUserAccounts(userId);
    
    if (!existingAccounts.some(acc => acc.accountName === accountName)) {
      logger.warn('Account not found', {
        operation: 'DELETE',
        userEmail: session.user.email,
        accountName,
      });
      return NextResponse.json(
        { error: `Account "${accountName}" not found` },
        { status: 404 }
      );
    }

    // Delete account
    await storage.deleteUserAccount(userId, accountName);

    logger.info('Account deleted successfully', {
      operation: 'DELETE',
      userEmail: session.user.email,
      accountName,
    });

    return NextResponse.json({
      success: true,
      accountName,
    });
  } catch (error) {
    logger.fatalError(
      'Error deleting account',
      error instanceof Error ? error : new Error('Unknown error'),
      { operation: 'DELETE' }
    );
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/config/accounts/:accountName
 * Update account team IDs
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountName: string }> }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    const { accountName } = await params;
    const userId = session.user.email || 'unknown';
    const body = await request.json();
    const { teamIds } = body;

    if (!Array.isArray(teamIds)) {
      return NextResponse.json(
        { error: 'teamIds must be an array' },
        { status: 400 }
      );
    }

    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const existingAccounts = await storage.getUserAccounts(userId);
    const account = existingAccounts.find(acc => acc.accountName === accountName);
    
    if (!account) {
      return NextResponse.json(
        { error: `Account "${accountName}" not found` },
        { status: 404 }
      );
    }

    // Update account with new team IDs
    await storage.saveUserAccount({
      ...account,
      teamIds: teamIds.map(String),
      updatedAt: new Date().toISOString(),
    });

    logger.info('Account team IDs updated', {
      operation: 'PATCH',
      userEmail: session.user.email,
      accountName,
      teamIdsCount: teamIds.length,
    });

    return NextResponse.json({
      success: true,
      accountName,
      teamIds,
    });
  } catch (error) {
    logger.fatalError(
      'Error updating account',
      error instanceof Error ? error : new Error('Unknown error'),
      { operation: 'PATCH' }
    );
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}
