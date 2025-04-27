import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export default function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <Card className="overflow-hidden border-0 shadow-md h-full">
      <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
      <CardContent className="p-6">
        <div className="flex flex-col h-full">
          <div className="mb-4 p-3 rounded-full bg-blue-50 w-14 h-14 flex items-center justify-center">
            {icon}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 text-sm flex-grow">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
