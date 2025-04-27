import { Link } from "wouter";
import { Headphones, History, FileText } from "lucide-react";
import learnXLogo from "../assets/learn-x-logo.png";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <header className="bg-gradient-to-r from-slate-900 to-slate-800 shadow-lg">
      <div className="container mx-auto px-4 flex items-center justify-between h-24 md:h-32 lg:h-40 overflow-hidden">
        <Link href="/">
          <div className="flex items-center group cursor-pointer max-w-[70%] flex-shrink-0">
            <img 
              src={learnXLogo} 
              alt="LEARN-X Logo" 
              className="h-20 sm:h-24 md:h-28 lg:h-32 xl:h-36 w-auto transition-transform duration-300 group-hover:scale-105 mr-3" 
            />
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl text-white font-bold tracking-wide whitespace-nowrap">
                <span className="text-blue-400">Audio</span> Transcription
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-gray-300 whitespace-nowrap">Meeting notes made easy</p>
            </div>
          </div>
        </Link>
        
        <nav className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-white hover:text-blue-400 hover:bg-slate-800/50 flex items-center gap-1">
              <Headphones className="h-5 w-5" />
              <span className="hidden sm:inline text-sm whitespace-nowrap">New Recording</span>
            </Button>
          </Link>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-white hover:text-blue-400 hover:bg-slate-800/50 flex items-center gap-1">
              <History className="h-5 w-5" />
              <span className="hidden sm:inline text-sm whitespace-nowrap">History</span>
            </Button>
          </Link>
          <Link href="/transcription/latest">
            <Button variant="secondary" size="sm" className="bg-blue-500 hover:bg-blue-600 text-white border-0 hidden md:flex items-center gap-1">
              <FileText className="h-5 w-5" />
              <span className="text-sm whitespace-nowrap">Latest Transcript</span>
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}