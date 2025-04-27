import React from 'react';
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import TranscriptionHistory from "@/pages/TranscriptionHistory";
import TranscriptionDetail from "@/pages/TranscriptionDetail";
import Navbar from "@/components/Navbar";

function Router() {
  const RedirectToHome = () => {
    const [, setLocation] = useLocation();
    React.useEffect(() => {
      setLocation('/home');
    }, [setLocation]);
    return null; // Return null as this component handles redirection
  };

  // Component to fetch the latest transcription and redirect to it
  const LatestTranscription = () => {
    const [, setLocation] = useLocation();
    const [isLoading, setIsLoading] = React.useState(true);
    
    React.useEffect(() => {
      const fetchLatest = async () => {
        try {
          const response = await fetch('/api/transcriptions');
          if (!response.ok) throw new Error('Failed to fetch transcriptions');
          const data = await response.json();
          
          if (data && data.length > 0) {
            // Sort by creation date, newest first
            const sorted = [...data].sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            
            // Redirect to the latest transcription
            if (sorted.length > 0) {
              setLocation(`/transcription/${sorted[0].id}`);
            } else {
              // No transcriptions found, redirect to history page
              setLocation('/history');
            }
          } else {
            // No transcriptions found, redirect to history page
            setLocation('/history');
          }
        } catch (error) {
          console.error("Error fetching latest transcription:", error);
          setLocation('/history');
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchLatest();
    }, [setLocation]);
    
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-6 pb-10">
        <Switch>
          <Route path="/" component={RedirectToHome} />
          <Route path="/home" component={Home} />
          <Route path="/history" component={TranscriptionHistory} />
          <Route path="/transcription/latest" component={LatestTranscription} />
          <Route path="/transcription/:id" component={TranscriptionDetail} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
