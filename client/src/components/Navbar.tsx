import { Link } from "wouter";
import { Headphones, History, FileText } from "lucide-react";
import learnXLogo from "../assets/learn-x-logo.png";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <header className="bg-gradient-to-r from-slate-900 to-slate-800 shadow-lg">
      <div className="container mx-auto py-3 px-4 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/">
            <div className="flex items-center group cursor-pointer">
              <img 
                src={learnXLogo} 
                alt="LEARN-X Logo" 
                className="h-12 w-auto mr-4 transition-transform duration-300 group-hover:scale-105" 
              />
              <div className="hidden md:block">
                <h1 className="text-xl text-white font-bold tracking-wide">
                  <span className="text-blue-400">Audio</span> Transcription
                </h1>
                <p className="text-xs text-gray-300">Meeting notes made easy</p>
              </div>
            </div>
          </Link>
        </div>
        
        <nav className="flex items-center space-x-2 md:space-x-4">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:text-blue-400 hover:bg-slate-800/50 gap-2">
              <Headphones className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">New Recording</span>
            </Button>
          </Link>
          <Link href="/history">
            <Button variant="ghost" className="text-white hover:text-blue-400 hover:bg-slate-800/50 gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">History</span>
            </Button>
          </Link>
          <Link href="/transcription/latest">
            <Button variant="secondary" className="bg-blue-500 hover:bg-blue-600 text-white border-0 hidden md:flex gap-2">
              <FileText className="h-4 w-4" />
              <span className="font-medium">Latest Transcript</span>
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}