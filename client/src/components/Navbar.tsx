import { Link } from "wouter";
import { Headphones, History } from "lucide-react";
import learnXLogo from "../assets/learn-x-logo.png";

export default function Navbar() {
  return (
    <header className="bg-background border-b border-border">
      <div className="container mx-auto py-3 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <img 
            src={learnXLogo} 
            alt="LEARN-X Logo" 
            className="h-14 w-auto" 
          />
        </div>
        
        <nav className="flex items-center space-x-6">
          <Link href="/">
            <span className="text-foreground hover:text-primary flex items-center cursor-pointer transition-colors">
              <Headphones className="h-4 w-4 mr-2" />
              <span className="font-medium">New Transcription</span>
            </span>
          </Link>
          <Link href="/history">
            <span className="text-foreground hover:text-primary flex items-center cursor-pointer transition-colors">
              <History className="h-4 w-4 mr-2" />
              <span className="font-medium">History</span>
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}