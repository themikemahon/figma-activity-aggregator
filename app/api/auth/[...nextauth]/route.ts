import NextAuth, { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { Storage } from '@/lib/storage';

// Custom Figma OAuth provider
const FigmaProvider = {
  id: 'figma',
  name: 'Figma',
  type: 'oauth' as const,
  authorization: {
    url: 'https://www.figma.com/oauth',
    params: {
      scope: 'current_user:read file_content:read file_comments:read file_versions:read',
      response_type: 'code',
    },
  },
  token: 'https://api.figma.com/v1/oauth/token',
  userinfo: 'https://api.figma.com/v1/me',
  clientId: process.env.FIGMA_CLIENT_ID,
  clientSecret: process.env.FIGMA_CLIENT_SECRET,
  profile(profile: any) {
    return {
      id: String(profile.id),
      email: profile.email || '',
      name: profile.handle || '',
      image: profile.img_url || null,
    };
  },
};

export const authOptions: NextAuthOptions = {
  providers: [FigmaProvider as any],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, save OAuth tokens
      if (account && profile) {
        const figmaProfile = profile as any;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.figmaUserId = String(figmaProfile.id);
        token.figmaEmail = figmaProfile.email || '';
        token.figmaHandle = figmaProfile.handle || '';
        
        // Store OAuth tokens in database
        try {
          const storage = new Storage(process.env.ENCRYPTION_KEY!);
          const now = new Date().toISOString();
          
          await storage.saveUserAccount({
            userId: token.figmaEmail,
            accountName: token.figmaHandle,
            encryptedPAT: storage.encryptPAT(account.access_token as string),
            teamIds: [], // Will be populated from Figma API
            createdAt: now,
            updatedAt: now,
          });
        } catch (error) {
          console.error('[Auth] Failed to store OAuth tokens:', error);
        }
      }
      
      // Check if token needs refresh (expires in less than 1 hour)
      if (token.expiresAt && Date.now() > (token.expiresAt as number) - 60 * 60 * 1000) {
        try {
          const response = await fetch('https://api.figma.com/v1/oauth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(
                `${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`
              ).toString('base64')}`,
            },
            body: new URLSearchParams({
              refresh_token: token.refreshToken as string,
            }),
          });
          
          if (response.ok) {
            const tokens = await response.json();
            token.accessToken = tokens.access_token;
            token.refreshToken = tokens.refresh_token;
            token.expiresAt = Date.now() + tokens.expires_in * 1000;
            
            // Update stored token
            try {
              const storage = new Storage(process.env.ENCRYPTION_KEY!);
              const accounts = await storage.getUserAccounts(token.figmaEmail as string);
              const account = accounts.find(a => a.accountName === token.figmaHandle);
              
              if (account) {
                await storage.saveUserAccount({
                  ...account,
                  encryptedPAT: storage.encryptPAT(tokens.access_token),
                  updatedAt: new Date().toISOString(),
                });
              }
            } catch (error) {
              console.error('[Auth] Failed to update refreshed token:', error);
            }
          }
        } catch (error) {
          console.error('[Auth] Failed to refresh token:', error);
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      // Add Figma info to session
      session.user = {
        id: token.figmaUserId as string,
        email: token.figmaEmail as string,
        name: token.figmaHandle as string,
        image: token.picture as string,
      };
      session.accessToken = token.accessToken as string;
      
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
