import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Transcription } from '@shared/schema';

export async function generateTranscriptPDF(
  transcription: Transcription,
  structuredTranscript?: any
): Promise<{ filePath: string; fileName: string }> {
  // Create a temporary file
  const tempDir = os.tmpdir();
  const fileName = `transcript_${transcription.id}_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);
  
  // Create a document
  const doc = new PDFDocument({
    margins: {
      top: 72,
      bottom: 72,
      left: 72,
      right: 72,
    },
    info: {
      Title: transcription.meetingTitle || `Transcription ${transcription.id}`,
      Author: 'Transcription App',
      Subject: 'Meeting Transcription',
    },
  });
  
  // Pipe its output to the file
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  
  // Add metadata section
  doc.fontSize(20).font('Helvetica-Bold').text(transcription.meetingTitle || transcription.fileName, {
    align: 'center',
  });
  
  doc.moveDown();
  doc.fontSize(12).font('Helvetica');
  
  // Meeting details
  const meetingDate = transcription.meetingDate 
    ? new Date(transcription.meetingDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date(transcription.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
  
  doc.fontSize(12).font('Helvetica-Bold').text('Meeting Details');
  doc.fontSize(10).font('Helvetica').text(`Date: ${meetingDate}`);
  
  if (transcription.participants) {
    doc.fontSize(10).text(`Participants: ${transcription.participants}`);
  }
  
  if (transcription.duration) {
    const minutes = Math.floor(transcription.duration / 60);
    const seconds = Math.round(transcription.duration % 60);
    doc.fontSize(10).text(`Duration: ${minutes}m ${seconds}s`);
  }
  
  // Add summary if available
  if (transcription.summary) {
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Summary');
    doc.fontSize(10).font('Helvetica').text(transcription.summary);
  }
  
  // Action items section
  if (transcription.actionItems) {
    try {
      // Parse the JSON string into an array
      const actionItems = JSON.parse(transcription.actionItems);
      
      if (actionItems && Array.isArray(actionItems) && actionItems.length > 0) {
        doc.moveDown();
        doc.fontSize(12).font('Helvetica-Bold').text('Key Actionables');
        
        actionItems.forEach((item, index) => {
          const isPriority = item.includes("[PRIORITY]");
          const cleanItem = item.replace("[PRIORITY]", "").trim();
          
          if (isPriority) {
            // For priority items, add a visual indicator
            doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. `, { continued: true });
            doc.fillColor('rgb(217, 119, 6)').text('PRIORITY: ', { continued: true });
            doc.fillColor('black').font('Helvetica-Bold').text(cleanItem);
          } else {
            doc.fontSize(10).font('Helvetica').text(`${index + 1}. ${cleanItem}`);
          }
        });
      }
    } catch (error) {
      console.log("JSON parsing of action items failed, trying string-based approach", error);
      
      // First try as string with line breaks 
      if (typeof transcription.actionItems === 'string' && transcription.actionItems.trim().length > 0) {
        const items = transcription.actionItems.split('\n').filter(item => item.trim().length > 0);
        
        if (items.length > 0) {
          doc.moveDown();
          doc.fontSize(12).font('Helvetica-Bold').text('Key Actionables');
          
          items.forEach((item, index) => {
            const isPriority = item.includes("[PRIORITY]");
            const cleanItem = item.replace("[PRIORITY]", "").trim();
            
            if (isPriority) {
              // For priority items, add a visual indicator
              doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. `, { continued: true });
              doc.fillColor('rgb(217, 119, 6)').text('PRIORITY: ', { continued: true });
              doc.fillColor('black').font('Helvetica-Bold').text(cleanItem);
            } else {
              doc.fontSize(10).font('Helvetica').text(`${index + 1}. ${cleanItem}`);
            }
          });
        }
      } 
      // Fallback to extracting from summary
      else if (transcription.summary) {
        const extractedItems = extractActionItems(transcription.summary);
        if (extractedItems.length > 0) {
          doc.moveDown();
          doc.fontSize(12).font('Helvetica-Bold').text('Key Actionables');
          
          extractedItems.forEach((item, index) => {
            doc.fontSize(10).font('Helvetica').text(`${index + 1}. ${item}`);
          });
        }
      }
    }
  }
  
  doc.moveDown();
  doc.fontSize(12).font('Helvetica-Bold').text('Transcript');
  doc.moveDown(0.5);
  
  // Add the transcript content
  if (structuredTranscript && structuredTranscript.segments && structuredTranscript.segments.length > 0) {
    // If we have a structured transcript with speakers
    structuredTranscript.segments.forEach((segment: any) => {
      const timeFormatted = formatTime(segment.start);
      const speakerText = segment.speaker ? `${segment.speaker}: ` : '';
      
      doc.fontSize(9).font('Helvetica-Bold').text(
        `[${timeFormatted}] ${speakerText}`,
        { continued: true }
      );
      
      doc.fontSize(9).font('Helvetica').text(segment.text);
      doc.moveDown(0.5);
    });
  } else if (transcription.text) {
    // If we just have plain text
    doc.fontSize(10).font('Helvetica').text(transcription.text);
  }
  
  // Finalize PDF file
  doc.end();
  
  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      resolve({ filePath, fileName });
    });
    
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

// Utility to extract action items from summary
function extractActionItems(summary: string): string[] {
  // This is a basic implementation - we look for lines containing action-oriented words
  const lines = summary.split('\n');
  const actionItems: string[] = [];
  
  const actionWords = ['need to', 'should', 'must', 'will', 'going to', 'plan', 'action', 
    'task', 'todo', 'to-do', 'follow up', 'deadline', 'by the end of', 'next steps'];
  
  for (const line of lines) {
    const lowerCaseLine = line.toLowerCase();
    if (actionWords.some(word => lowerCaseLine.includes(word))) {
      // Clean up the line (remove bullets, etc.)
      let cleanLine = line.trim();
      if (cleanLine.startsWith('- ')) {
        cleanLine = cleanLine.substring(2);
      }
      if (cleanLine.startsWith('• ')) {
        cleanLine = cleanLine.substring(2);
      }
      actionItems.push(cleanLine);
    }
  }
  
  return actionItems;
}

// Format time from seconds to MM:SS
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}