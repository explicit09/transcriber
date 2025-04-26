import { Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileDetailsProps {
  file: {
    name: string;
    size: number;
    type: string;
  };
  onRemove: () => void;
  disabled?: boolean;
}

export default function FileDetails({ file, onRemove, disabled = false }: FileDetailsProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <Music className="h-5 w-5 text-gray-400" />
        </div>
        <div className="ml-3 flex-1">
          <h4 className="text-sm font-medium text-gray-900">{file.name}</h4>
          <p className="mt-1 text-xs text-gray-500">
            {formatFileSize(file.size)} • {file.type.toUpperCase()}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          className="ml-4 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <span className="sr-only">Remove file</span>
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
