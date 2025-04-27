import { Link } from "wouter";
import { Headphones, History, FileText } from "lucide-react";
import learnXLogo from "../assets/learn-x-logo.png";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <header className="bg-gradient-to-r from-slate-900 to-slate-800 shadow-lg overflow-hidden">
      <div className="container mx-auto px-2 flex items-center justify-between min-h-fit overflow-hidden py-1">
        <Link href="/">
          <div className="flex items-center group cursor-pointer max-w-[70%] flex-shrink-0 -my-2">
            <img 
              src={learnXLogo} 
              alt="LEARN-X Logo" 
              className="h-20 sm:h-24 md:h-28 lg:h-32 xl:h-36 w-auto transition-transform duration-300 group-hover:scale-105 mr-3" 
            />
            <div className="-mt-1">
              <h1 className="text-base sm:text-lg md:text-xl text-white font-bold tracking-wide whitespace-nowrap leading-tight">
                <span className="text-blue-400">Audio</span> Transcription
              </h1>
              <p className="text-xs text-gray-300 whitespace-nowrap leading-tight">Meeting notes made easy</p>
            </div>
          </div>
        </Link>
        
        <nav className="flex items-center space-x-1 flex-shrink-0">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-white hover:text-blue-400 hover:bg-slate-800/50 flex items-center gap-1 h-8 px-2 py-0 text-xs">
              <Headphones className="h-4 w-4" />
              <span className="hidden sm:inline whitespace-nowrap">New Recording</span>
            </Button>
          </Link>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-white hover:text-blue-400 hover:bg-slate-800/50 flex items-center gap-1 h-8 px-2 py-0 text-xs">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline whitespace-nowrap">History</span>
            </Button>
          </Link>
          <Link href="/transcription/latest">
            <Button variant="secondary" size="sm" className="bg-blue-500 hover:bg-blue-600 text-white border-0 hidden md:flex items-center gap-1 h-8 px-2 py-0 text-xs">
              <FileText className="h-4 w-4" />
              <span className="whitespace-nowrap">Latest Transcript</span>
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}