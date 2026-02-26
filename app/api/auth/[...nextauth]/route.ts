import NextAuth, { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { kv } from '@vercel/kv';

// Minimal adapter for email verification tokens only
const createMinimalAdapter = () => ({
  async createUser(user: any) {
    // For JWT sessions, return a user object with email
    return {
      id: user.email, // Use email as ID
      email: user.email,
      emailVerified: new Date(),
    };
  },

  async getUser(id: string) {
    // Not needed for JWT sessions
    return null;
  },

  async getUserByEmail(email: string) {
    // For JWT, return a user object with the email
    return {
      id: email, // Use email as ID
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
    
    console.log('[Auth] useVerificationToken called');
    console.log('[Auth] Identifier:', identifier);
    console.log('[Auth] Token (first 20 chars):', token.substring(0, 20));
    
    // Check if there's an active session from a recent verification
    const existingSession = await kv.get(sessionKey);
    if (existingSession) {
      console.log('[Auth] Found existing verification session!');
      const sessionData = typeof existingSession === 'string' ? JSON.parse(existingSession) : existingSession;
      return {
        ...sessionData,
        expires: new Date(sessionData.expires),
      };
    } else {
      console.log('[Auth] No existing session found');
    }
    
    const tokenData = await kv.get(key);
    
    if (!tokenData) {
      console.log('[Auth] Verification token not found in KV');
      return null;
    }
    
    console.log('[Auth] Verification token found in KV!');
    const verificationToken = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
    
    // Check if token is expired
    const expiresDate = new Date(verificationToken.expires);
    if (expiresDate < new Date()) {
      console.log('[Auth] Token has expired');
      await kv.del(key);
      return null;
    }
    
    // Create a session that lasts 5 minutes to handle email security scanners
    console.log('[Auth] Creating verification session (5 min TTL)');
    await kv.set(sessionKey, JSON.stringify(verificationToken));
    await kv.expire(sessionKey, 300); // 5 minutes instead of 60 seconds
    console.log('[Auth] Session created successfully');
    
    // Don't delete the original token immediately - let it expire naturally
    console.log('[Auth] Keeping original token for fallback');
    
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
      console.log('[Auth] signIn callback, user:', user.email);
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
      
      console.log('[Auth] signIn successful');
      return true;
    },
    async jwt({ token, user, account, profile }) {
      console.log('[Auth] jwt callback');
      console.log('[Auth] - user:', JSON.stringify(user));
      console.log('[Auth] - token.email before:', token.email);
      console.log('[Auth] - token.sub:', token.sub);
      
      // On sign-in, user object will be present
      if (user?.email) {
        token.email = user.email;
        token.sub = user.email; // Use email as subject
      }
      
      console.log('[Auth] - token.email after:', token.email);
      return token;
    },
    async session({ session, token }) {
      console.log('[Auth] session callback');
      console.log('[Auth] - token:', JSON.stringify(token));
      console.log('[Auth] - token.email:', token.email);
      console.log('[Auth] - token.sub:', token.sub);
      
      // Populate user from token - use sub as fallback if email not present
      const email = (token.email || token.sub) as string;
      
      if (email) {
        session.user = {
          id: email,
          email: email,
          name: token.name as string | undefined,
          image: token.picture as string | undefined,
        };
      }
      
      console.log('[Auth] - session.user.email set to:', session.user?.email);
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
