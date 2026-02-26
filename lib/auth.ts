import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * Get the current authenticated user session
 * Returns null if not authenticated
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Get the current authenticated user
 * Throws an error if not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  
  if (!session || !session.user) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  return session.user;
}

/**
 * Check if an email is allowed based on the whitelist
 * Returns true if no whitelist is configured or if email is in whitelist
 */
export function isEmailAllowed(email: string): boolean {
  const allowedEmails = process.env.ALLOWED_EMAILS;
  
  if (!allowedEmails || allowedEmails.trim() === '') {
    return allowedEmails === undefined; // Allow all if not configured, deny if empty string
  }
  
  const whitelist = allowedEmails.split(',').map(e => e.trim().toLowerCase());
  return whitelist.includes(email.toLowerCase());
}
