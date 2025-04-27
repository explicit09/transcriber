import React, { useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import FeatureCard from '@/components/FeatureCard';
import { Upload, MessageSquareText, Download } from 'lucide-react';

const TranscriptionContainer = dynamic(
  () => import('@/components/TranscriptionContainer'),
  { ssr: false }
);

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

export default function Home() {
  const features: Feature[] = useMemo(
    () => [
      {
        title: 'Easy Upload',
        description: 'Drag and drop or select your audio files (MP3, WAV, M4A)',
        icon: <Upload aria-hidden="true" className="h-5 w-5 text-primary" />,
      },
      {
        title: 'AI-Powered Transcription',
        description: "Uses OpenAI's advanced API for accurate meeting transcripts",
        icon: <MessageSquareText aria-hidden="true" className="h-5 w-5 text-primary" />,
      },
      {
        title: 'Edit & Export',
        description: 'Edit, analyze and export your transcriptions easily',
        icon: <Download aria-hidden="true" className="h-5 w-5 text-primary" />,
      },
    ],
    []
  );

  return (
    <>
      <Head>
        <title>Team Meeting Transcription</title>
        <meta
          name="description"
          content="Upload meeting recordings and convert them to text for your team"
        />
      </Head>
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">
            Team Meeting Transcription
          </h1>
          <p className="mt-2 text-gray-600">
            Upload meeting recordings and convert them to text for your team
          </p>
        </header>

        <main>
          <TranscriptionContainer />

          {/* Features Section */}
          <section aria-labelledby="features-heading" className="mt-12">
            <h2 id="features-heading" className="text-xl font-semibold text-gray-900 mb-4">
              Features
            </h2>
            <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title}>
                  <FeatureCard
                    title={feature.title}
                    description={feature.description}
                    icon={feature.icon}
                  />
                </li>
              ))}
            </ul>
          </section>
        </main>

        <section aria-label="Footer" className="mt-12 border-t border-gray-200 pt-6 pb-8">
          <p className="text-center text-sm text-gray-500">
            Internal tool for team use • Supports MP3, WAV, M4A formats (max 25MB) • Edit,
            analyze, and export transcriptions
          </p>
        </section>
      </div>
    </>
  );
}
