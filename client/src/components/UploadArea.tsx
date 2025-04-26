import { useRef, useState, DragEvent } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadAreaProps {
  onFileSelected: (file: File) => void;
  isUploading: boolean;
}

export default function UploadArea({ onFileSelected, isUploading }: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleUploadClick = () => {
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onFileSelected(files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files.length) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
        isDragActive 
          ? "border-primary bg-primary-50" 
          : "border-gray-300 hover:border-primary-400 hover:bg-gray-50"
      }`}
      onClick={handleUploadClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div>
        {/* Icon for upload */}
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-50 mb-4">
          <CloudUpload className="h-6 w-6 text-primary" />
        </div>
        
        <h3 className="text-lg font-medium text-gray-900 mb-1">Upload your audio file</h3>
        <p className="text-sm text-gray-500 mb-4">Drag and drop your audio file here or click to browse</p>
        
        <Button
          disabled={isUploading}
          className="px-4 py-2 text-sm font-medium"
        >
          Select file
        </Button>
        
        <p className="mt-2 text-xs text-gray-500">Supports MP3, WAV, M4A (Max 25MB)</p>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept=".mp3,.wav,.m4a" 
        onChange={handleFileSelection}
        disabled={isUploading}
      />
    </div>
  );
}
