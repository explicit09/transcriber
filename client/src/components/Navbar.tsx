import { Link } from "wouter";
// Import logo directly from the assets folder
import learnxLogo from "../assets/learnx-logo.png";
import { Button } from "@/components/ui/button";
import { History, Mic, Plus } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="bg-white dark:bg-card border-b border-border sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img 
                src={learnxLogo} 
                alt="LEARN-X Logo" 
                className="h-10 mr-3"
              />
            </Link>
            <div className="hidden md:flex items-center ml-6 space-x-1">
              <Link href="/">
                <Button variant="ghost" className="flex items-center">
                  <Plus className="h-4 w-4 mr-2" />
                  New Transcription
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="ghost" className="flex items-center">
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
              </Link>
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center text-primary hover:text-primary"
            >
              <Mic className="h-4 w-4 mr-2" />
              Start Recording
            </Button>
          </div>
          
          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <div className="flex space-x-1">
              <Link href="/">
                <Button variant="ghost" size="sm" className="flex items-center justify-center" title="New Transcription">
                  <Plus className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="ghost" size="sm" className="flex items-center justify-center" title="History">
                  <History className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}