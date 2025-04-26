import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import TranscriptionHistory from "@/pages/TranscriptionHistory";
import { Headphones, History } from "lucide-react";

// Navigation bar component
function Navbar() {
  return (
    <header className="bg-white border-b">
      <div className="container mx-auto py-3 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <Headphones className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">Meeting Transcriber</h1>
        </div>
        
        <nav className="flex items-center space-x-8">
          <Link href="/">
            <span className="text-gray-600 hover:text-primary flex items-center cursor-pointer">
              <Headphones className="h-4 w-4 mr-1" />
              <span>New Transcription</span>
            </span>
          </Link>
          <Link href="/history">
            <span className="text-gray-600 hover:text-primary flex items-center cursor-pointer">
              <History className="h-4 w-4 mr-1" />
              <span>History</span>
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Router() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="pt-4 pb-8">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/history" component={TranscriptionHistory} />
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
