import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const logger = createLogger('WebhookRegister');

/**
 * POST /api/webhooks/register
 * Register Figma webhooks for a team
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId, accountName } = await request.json();

    if (!teamId || !accountName) {
      return NextResponse.json(
        { error: 'teamId and accountName required' },
        { status: 400 }
      );
    }

    // Get user's OAuth token
    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const accounts = await storage.getUserAccounts(session.user.email);
    const account = accounts.find(a => a.accountName === accountName);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const accessToken = storage.decryptPAT(account.encryptedPAT);

    // Register webhook with Figma
    const webhookResponse = await fetch('https://api.figma.com/v2/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'FILE_UPDATE',
        team_id: teamId,
        endpoint: `${request.nextUrl.origin}/api/webhooks/figma`,
        passcode: process.env.FIGMA_WEBHOOK_SECRET || 'default-secret',
        description: `Activity Aggregator for ${accountName}`,
      }),
    });

    if (!webhookResponse.ok) {
      const error = await webhookResponse.text();
      logger.fatalError(
        'Failed to register webhook',
        new Error(error),
        {
          operation: 'POST',
          status: webhookResponse.status,
          teamId,
        }
      );
      return NextResponse.json(
        { error: 'Failed to register webhook', details: error },
        { status: webhookResponse.status }
      );
    }

    const webhook = await webhookResponse.json();

    // Store webhook subscription
    await storage.storeWebhookSubscription({
      webhookId: webhook.id,
      teamId,
      userId: session.user.email,
      accountName,
      createdAt: new Date().toISOString(),
    });

    logger.info('Webhook registered successfully', {
      operation: 'POST',
      webhookId: webhook.id,
      teamId,
      accountName,
    });

    return NextResponse.json({
      success: true,
      webhookId: webhook.id,
    });
  } catch (error) {
    logger.fatalError(
      'Webhook registration failed',
      error instanceof Error ? error : new Error('Unknown error'),
      { operation: 'POST' }
    );
    return NextResponse.json(
      { error: 'Webhook registration failed' },
      { status: 500 }
    );
  }
}
