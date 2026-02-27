import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Link from 'next/link';

export default async function Home() {
  const session = await getServerSession(authOptions);

  // If already signed in, redirect to config
  if (session?.user) {
    redirect('/config');
  }

  // Otherwise show landing page with sign-in link
  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>
        Figma Activity Aggregator
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#666', marginBottom: '2rem', maxWidth: '600px' }}>
        Track activity across all your Figma teams and get daily digests delivered to Slack
      </p>
      <Link
        href="/auth/signin"
        style={{
          padding: '1rem 2rem',
          backgroundColor: '#000',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          fontSize: '1.1rem',
          fontWeight: '500',
        }}
      >
        Get Started
      </Link>
    </main>
  );
}
