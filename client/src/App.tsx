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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-6 pb-10">
        <Switch>
          <Route path="/" component={RedirectToHome} />
          <Route path="/home" component={Home} />
          <Route path="/history" component={TranscriptionHistory} />
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
