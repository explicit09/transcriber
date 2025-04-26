import TranscriptionContainer from "@/components/TranscriptionContainer";
import FeatureCard from "@/components/FeatureCard";
import { Upload, MessageSquareText, Download } from "lucide-react";

export default function Home() {
  const features = [
    {
      title: "Easy Upload",
      description: "Drag and drop or select your audio files",
      icon: <Upload className="h-5 w-5 text-primary" />,
    },
    {
      title: "AI-Powered",
      description: "Uses OpenAI's advanced transcription API",
      icon: <MessageSquareText className="h-5 w-5 text-primary" />,
    },
    {
      title: "Export Options",
      description: "Copy or download your transcribed text",
      icon: <Download className="h-5 w-5 text-primary" />,
    },
  ];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">Team Meeting Transcription</h1>
        <p className="mt-2 text-gray-600">Upload meeting recordings and convert them to text for your team</p>
      </header>
      
      <main>
        <TranscriptionContainer />
        
        {/* Features Section */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Features</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {features.map((feature, index) => (
              <FeatureCard 
                key={index}
                title={feature.title}
                description={feature.description}
                icon={feature.icon}
              />
            ))}
          </div>
        </div>
      </main>
      
      <footer className="mt-12 border-t border-gray-200 pt-6 pb-8">
        <p className="text-center text-sm text-gray-500">Internal tool for team use • Supports MP3, WAV, M4A formats</p>
      </footer>
    </div>
  );
}
