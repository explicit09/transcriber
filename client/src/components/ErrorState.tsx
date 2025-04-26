import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  errorMessage: string;
  onTryAgain: () => void;
}

export default function ErrorState({ errorMessage, onTryAgain }: ErrorStateProps) {
  return (
    <div className="mt-6">
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Processing Your Request</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{errorMessage || "There was an error processing your audio file. Please try again with a different file."}</p>
            </div>
            <div className="mt-4">
              <Button
                variant="outline" 
                className="text-red-700 bg-red-100 hover:bg-red-200 border-red-200"
                onClick={onTryAgain}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
