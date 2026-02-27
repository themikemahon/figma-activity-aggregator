'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

export default function SignIn() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        padding: '2rem',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: 'white',
      }}>
        <h1 style={{ marginBottom: '1rem', textAlign: 'center' }}>
          Figma Activity Aggregator
        </h1>
        
        <p style={{ marginBottom: '2rem', color: '#666', textAlign: 'center' }}>
          Sign in with your Figma account to track activity across all your teams
        </p>

        {error && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            fontSize: '0.9rem',
          }}>
            {error === 'OAuthSignin' && 'Error connecting to Figma. Please try again.'}
            {error === 'OAuthCallback' && 'Error during sign in. Please try again.'}
            {error === 'OAuthCreateAccount' && 'Could not create account. Please try again.'}
            {error === 'EmailCreateAccount' && 'Could not create account. Please try again.'}
            {error === 'Callback' && 'Error during callback. Please try again.'}
            {error === 'OAuthAccountNotLinked' && 'Account already exists with different provider.'}
            {error === 'EmailSignin' && 'Error sending email. Please try again.'}
            {error === 'CredentialsSignin' && 'Sign in failed. Check your credentials.'}
            {error === 'SessionRequired' && 'Please sign in to access this page.'}
            {!['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'EmailCreateAccount', 'Callback', 'OAuthAccountNotLinked', 'EmailSignin', 'CredentialsSignin', 'SessionRequired'].includes(error) && error}
          </div>
        )}

        <button
          onClick={() => signIn('figma', { callbackUrl: '/config' })}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#000',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="white"/>
            <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="white"/>
            <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="white"/>
            <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="white"/>
            <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="white"/>
          </svg>
          Sign in with Figma
        </button>

        <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#999', textAlign: 'center' }}>
          By signing in, you authorize this app to access your Figma files, comments, and version history across all teams you belong to.
        </p>
      </div>
    </div>
  );
}
