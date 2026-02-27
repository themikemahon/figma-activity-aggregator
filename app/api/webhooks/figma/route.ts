import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const logger = createLogger('FigmaWebhook');

/**
 * POST /api/webhooks/figma
 * Receives webhook events from Figma
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const signature = request.headers.get('x-figma-signature');
    const body = await request.text();
    
    if (!verifyWebhookSignature(body, signature)) {
      logger.warn('Invalid webhook signature', {
        operation: 'POST',
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    
    logger.info('Webhook event received', {
      operation: 'POST',
      eventType: event.event_type,
      fileKey: event.file_key,
      teamId: event.team_id,
    });

    // Store the event for processing in daily digest
    await storeWebhookEvent(event);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.fatalError(
      'Webhook processing failed',
      error instanceof Error ? error : new Error('Unknown error'),
      { operation: 'POST' }
    );
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Verify webhook signature from Figma
 */
function verifyWebhookSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  
  const webhookSecret = process.env.FIGMA_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('FIGMA_WEBHOOK_SECRET not configured');
    return true; // Allow in development
  }

  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');

  return signature === expectedSignature;
}

/**
 * Store webhook event for later processing
 */
async function storeWebhookEvent(event: any) {
  const storage = new Storage(process.env.ENCRYPTION_KEY!);
  const timestamp = new Date().toISOString();
  
  // Store event in Redis with TTL of 7 days
  const eventKey = `webhook:event:${event.file_key}:${timestamp}`;
  
  await storage.storeWebhookEvent({
    key: eventKey,
    eventType: event.event_type,
    fileKey: event.file_key,
    fileName: event.file_name,
    teamId: event.team_id,
    triggeredBy: event.triggered_by,
    timestamp,
    rawEvent: event,
  });

  logger.info('Webhook event stored', {
    operation: 'storeWebhookEvent',
    eventKey,
    fileKey: event.file_key,
  });
}
