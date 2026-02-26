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
  { params }: { params: { accountName: string } }
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

    const accountName = params.accountName;

    logger.debug('Deleting account', {
      operation: 'DELETE',
      userId: session.user.id,
      accountName,
    });

    // Validate account name
    if (!accountName || typeof accountName !== 'string') {
      logger.warn('Invalid account name', {
        operation: 'DELETE',
        userId: session.user.id,
      });
      return NextResponse.json(
        { error: 'Account name is required' },
        { status: 400 }
      );
    }

    // Check if account exists for this user
    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const existingAccounts = await storage.getUserAccounts(session.user.id);
    
    if (!existingAccounts.some(acc => acc.accountName === accountName)) {
      logger.warn('Account not found', {
        operation: 'DELETE',
        userId: session.user.id,
        accountName,
      });
      return NextResponse.json(
        { error: `Account "${accountName}" not found` },
        { status: 404 }
      );
    }

    // Delete account
    await storage.deleteUserAccount(session.user.id, accountName);

    logger.info('Account deleted successfully', {
      operation: 'DELETE',
      userId: session.user.id,
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
