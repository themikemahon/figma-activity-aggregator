import NextAuth, { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { kv } from '@vercel/kv';

// Minimal adapter for email verification tokens only
const createMinimalAdapter = () => ({
  async createUser(user: any) {
    // For JWT sessions, we don't actually store users
    // Just return a user object with email
    return {
      id: crypto.randomUUID(),
      email: user.email,
      emailVerified: new Date(),
    };
  },

  async getUser(id: string) {
    // Not needed for JWT sessions
    return null;
  },

  async getUserByEmail(email: string) {
    // For JWT, just return a user object
    return {
      id: crypto.randomUUID(),
      email,
      emailVerified: null,
    };
  },

  async getUserByAccount() {
    return null;
  },

  async updateUser(user: any) {
    return user;
  },

  async linkAccount() {
    return null;
  },

  async createSession() {
    return null;
  },

  async getSessionAndUser() {
    return null;
  },

  async updateSession() {
    return null;
  },

  async deleteSession() {
    return null;
  },

  async createVerificationToken({ identifier, expires, token }: any) {
    const verificationToken = {
      identifier,
      token,
      expires: expires.toISOString(),
    };
    const key = `verification:${identifier}:${token}`;
    console.log('[Auth] Creating verification token:', key, 'expires:', verificationToken.expires);
    await kv.set(key, JSON.stringify(verificationToken));
    await kv.expire(key, 24 * 60 * 60);
    return verificationToken;
  },

  async useVerificationToken({ identifier, token }: any) {
    const key = `verification:${identifier}:${token}`;
    const sessionKey = `verification-session:${identifier}:${token}`;
    
    console.log('[Auth] Looking for verification token:', key);
    
    // Check if there's an active session from a recent verification
    const existingSession = await kv.get(sessionKey);
    if (existingSession) {
      console.log('[Auth] Using existing verification session');
      const sessionData = typeof existingSession === 'string' ? JSON.parse(existingSession) : existingSession;
      return {
        ...sessionData,
        expires: new Date(sessionData.expires),
      };
    }
    
    const tokenData = await kv.get(key);
    
    if (!tokenData) {
      console.log('[Auth] Verification token not found');
      return null;
    }
    
    console.log('[Auth] Verification token found');
    const verificationToken = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
    
    // Check if token is expired
    const expiresDate = new Date(verificationToken.expires);
    if (expiresDate < new Date()) {
      console.log('[Auth] Token has expired');
      await kv.del(key);
      return null;
    }
    
    // Create a session that lasts 60 seconds to handle email security scanners
    await kv.set(sessionKey, JSON.stringify(verificationToken));
    await kv.expire(sessionKey, 60);
    
    // Delete the original token
    await kv.del(key);
    
    console.log('[Auth] Token is valid, created session, expires:', verificationToken.expires);
    return {
      ...verificationToken,
      expires: expiresDate,
    };
  },
});

export const authOptions: NextAuthOptions = {
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  adapter: createMinimalAdapter() as any,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user }) {
      // Check email whitelist if configured
      const allowedEmails = process.env.ALLOWED_EMAILS;
      
      if (allowedEmails) {
        const whitelist = allowedEmails.split(',').map(e => e.trim().toLowerCase());
        const userEmail = user.email?.toLowerCase();
        
        if (!userEmail || !whitelist.includes(userEmail)) {
          console.log(`[Auth] Access denied for email: ${userEmail}`);
          return false;
        }
        
        console.log(`[Auth] Access granted for whitelisted email: ${userEmail}`);
      }
      
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
