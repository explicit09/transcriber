import React, { useMemo, lazy, Suspense } from 'react';
import FeatureCard from '@/components/FeatureCard';
import { 
  Upload, 
  MessageSquareText, 
  Download, 
  Mic, 
  FileText, 
  UsersRound, 
  Languages, 
  Brain,
  Loader2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const TranscriptionContainer = lazy(() => import('@/components/TranscriptionContainer'));

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
        description: 'Drag and drop audio files or record directly in the browser',
        icon: <Upload aria-hidden="true" className="h-6 w-6 text-blue-500" />,
      },
      {
        title: 'AI Transcription',
        description: "Powerful hybrid AI technology for accurate meeting transcripts",
        icon: <Brain aria-hidden="true" className="h-6 w-6 text-blue-500" />,
      },
      {
        title: 'Speaker Detection',
        description: 'Automatically detects and labels different speakers in your recording',
        icon: <UsersRound aria-hidden="true" className="h-6 w-6 text-blue-500" />,
      },
      {
        title: 'Live Recording',
        description: 'Record meetings directly in your browser with our audio recorder',
        icon: <Mic aria-hidden="true" className="h-6 w-6 text-blue-500" />,
      },
      {
        title: 'PDF Export',
        description: 'Generate professional PDF reports with summaries and action items',
        icon: <FileText aria-hidden="true" className="h-6 w-6 text-blue-500" />,
      },
      {
        title: 'Translation',
        description: 'Translate your transcriptions into different languages',
        icon: <Languages aria-hidden="true" className="h-6 w-6 text-blue-500" />,
      },
    ],
    []
  );

  // Set page title
  React.useEffect(() => {
    document.title = "LEARN-X Audio Transcription";
  }, []);
  
  return (
    <div className="bg-gradient-to-b from-gray-50 to-white min-h-[calc(100vh-64px)]">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-500">
            Audio Transcription & Analysis
          </h1>
          <p className="mt-2 text-gray-600 text-lg max-w-3xl mx-auto">
            Transform your team meetings into searchable, actionable text with our advanced AI-powered transcription tool
          </p>
        </div>

        <Card className="shadow-md border-0 overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 h-2"></div>
          <CardContent className="p-0">
            <Suspense fallback={
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">Loading transcription tools...</span>
              </div>
            }>
              <TranscriptionContainer />
            </Suspense>
          </CardContent>
        </Card>

        {/* Features Section */}
        <section className="my-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Powerful Transcription Features
            </h2>
            <p className="text-gray-600">Everything you need to convert, analyze, and share meeting recordings</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="transform transition duration-300 hover:scale-105">
                <FeatureCard
                  title={feature.title}
                  description={feature.description}
                  icon={feature.icon}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 mb-8 border-t border-gray-200 pt-8">
          <div className="bg-blue-50 rounded-lg p-8 text-center">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Enhanced Productivity for Your Team
            </h3>
            <p className="text-gray-600 mb-6 max-w-3xl mx-auto">
              Focus on your meetings while LEARN-X handles the documentation. Save time, improve collaboration, 
              and never miss important details again with our advanced transcription platform.
            </p>
            <div className="text-sm text-gray-500 flex flex-wrap justify-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center">
                <Upload className="h-4 w-4 mr-1 text-blue-500" />
                Max file size: 100MB
              </span>
              <span className="inline-flex items-center">
                <FileText className="h-4 w-4 mr-1 text-blue-500" />
                Supports MP3, WAV, M4A
              </span>
              <span className="inline-flex items-center">
                <Mic className="h-4 w-4 mr-1 text-blue-500" />
                Browser recording
              </span>
              <span className="inline-flex items-center">
                <Download className="h-4 w-4 mr-1 text-blue-500" />
                PDF & Text export
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
