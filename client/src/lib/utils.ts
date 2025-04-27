import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns a consistent color class based on the speaker identifier
 * @param speaker The speaker identifier (usually "Speaker 1", "Speaker 2", etc.)
 * @returns Tailwind color class string for the speaker
 */
export function getSpeakerColorClass(speaker: string | undefined): string {
  if (!speaker) return "bg-gray-100 text-gray-800";
  
  if (speaker.includes("1") || speaker.toLowerCase().includes("speaker 1")) {
    return "bg-blue-100 text-blue-800";
  } else if (speaker.includes("2") || speaker.toLowerCase().includes("speaker 2")) {
    return "bg-green-100 text-green-800";
  } else if (speaker.includes("3") || speaker.toLowerCase().includes("speaker 3")) {
    return "bg-purple-100 text-purple-800";
  } else if (speaker.includes("4") || speaker.toLowerCase().includes("speaker 4")) {
    return "bg-amber-100 text-amber-800";
  } else if (speaker.includes("5") || speaker.toLowerCase().includes("speaker 5")) {
    return "bg-red-100 text-red-800";
  } else {
    return "bg-indigo-100 text-indigo-800";
  }
}

/**
 * Format seconds to MM:SS format
 * @param seconds The time in seconds
 * @returns Formatted time string in MM:SS format
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
