import NextAuth, { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { kv } from '@vercel/kv';

// Custom KV adapter for NextAuth
const KVAdapter = {
  async createUser(user: any) {
    const id = crypto.randomUUID();
    const newUser = {
      id,
      email: user.email,
      emailVerified: null,
      name: user.name,
      image: user.image,
    };
    await kv.set(`user:${id}`, JSON.stringify(newUser));
    await kv.sadd('users', id);
    return newUser;
  },

  async getUser(id: string) {
    const userData = await kv.get(`user:${id}`);
    return userData ? JSON.parse(userData as string) : null;
  },

  async getUserByEmail(email: string) {
    const userIds = await kv.smembers('users');
    for (const userId of userIds) {
      const userData = await kv.get(`user:${userId}`);
      if (userData) {
        const user = JSON.parse(userData as string);
        if (user.email === email) {
          return user;
        }
      }
    }
    return null;
  },

  async getUserByAccount({ providerAccountId, provider }: any) {
    const accountKey = `account:${provider}:${providerAccountId}`;
    const userId = await kv.get(accountKey);
    if (!userId) return null;
    return this.getUser(userId as string);
  },

  async updateUser(user: any) {
    const existingUser = await this.getUser(user.id);
    if (!existingUser) return null;
    const updatedUser = { ...existingUser, ...user };
    await kv.set(`user:${user.id}`, JSON.stringify(updatedUser));
    return updatedUser;
  },

  async deleteUser(userId: string) {
    await kv.del(`user:${userId}`);
    await kv.srem('users', userId);
    return null;
  },

  async linkAccount(account: any) {
    const accountKey = `account:${account.provider}:${account.providerAccountId}`;
    await kv.set(accountKey, account.userId);
    await kv.set(`user:${account.userId}:account:${account.provider}`, JSON.stringify(account));
    return account;
  },

  async unlinkAccount({ providerAccountId, provider }: any) {
    const accountKey = `account:${provider}:${providerAccountId}`;
    const userId = await kv.get(accountKey);
    if (userId) {
      await kv.del(accountKey);
      await kv.del(`user:${userId}:account:${provider}`);
    }
  },

  async createSession({ sessionToken, userId, expires }: any) {
    const session = { sessionToken, userId, expires: expires.toISOString() };
    await kv.set(`session:${sessionToken}`, JSON.stringify(session));
    await kv.expire(`session:${sessionToken}`, 30 * 24 * 60 * 60); // 30 days
    return session;
  },

  async getSessionAndUser(sessionToken: string) {
    const sessionData = await kv.get(`session:${sessionToken}`);
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData as string);
    const user = await this.getUser(session.userId);
    
    if (!user) return null;
    
    return {
      session: {
        ...session,
        expires: new Date(session.expires),
      },
      user,
    };
  },

  async updateSession({ sessionToken, expires }: any) {
    const sessionData = await kv.get(`session:${sessionToken}`);
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData as string);
    const updatedSession = {
      ...session,
      expires: expires ? expires.toISOString() : session.expires,
    };
    
    await kv.set(`session:${sessionToken}`, JSON.stringify(updatedSession));
    return {
      ...updatedSession,
      expires: new Date(updatedSession.expires),
    };
  },

  async deleteSession(sessionToken: string) {
    await kv.del(`session:${sessionToken}`);
  },

  async createVerificationToken({ identifier, expires, token }: any) {
    const verificationToken = {
      identifier,
      token,
      expires: expires.toISOString(),
    };
    await kv.set(`verification:${identifier}:${token}`, JSON.stringify(verificationToken));
    await kv.expire(`verification:${identifier}:${token}`, 24 * 60 * 60); // 24 hours
    return verificationToken;
  },

  async useVerificationToken({ identifier, token }: any) {
    const key = `verification:${identifier}:${token}`;
    const tokenData = await kv.get(key);
    if (!tokenData) return null;
    
    await kv.del(key);
    const verificationToken = JSON.parse(tokenData as string);
    
    return {
      ...verificationToken,
      expires: new Date(verificationToken.expires),
    };
  },
};

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
  adapter: KVAdapter as any,
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account, profile, email }) {
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
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
