import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Link from 'next/link';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect('/config');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-figma-bg">
      <div className="text-center px-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-5xl font-semibold mb-4 text-figma-text">
            Figma Activity Aggregator
          </h1>
          <p className="text-lg text-figma-text-secondary leading-relaxed">
            Track activity across all your Figma teams and get daily digests delivered to Slack
          </p>
        </div>
        <Link
          href="/auth/signin"
          className="inline-block px-6 py-3 bg-figma-primary hover:bg-figma-primary-hover text-white font-medium rounded-lg transition-colors"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
