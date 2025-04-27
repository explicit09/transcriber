import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Transcription } from '@shared/schema';

export interface PDFOptions {
  includeTOC?: boolean;
  logoPath?: string;
  margins?: { top: number; bottom: number; left: number; right: number };
  layout?: 'portrait' | 'landscape';
}

export async function generateTranscriptPDF(
  transcription: Transcription,
  structuredTranscript?: any,
  options: PDFOptions = {}
): Promise<{ filePath: string; fileName: string }> {
  // Temp file
  const tempDir = os.tmpdir();
  const fileName = `transcript_${transcription.id}_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);

  // TOC entries collector
  const tocEntries: Array<{ title: string; page: number }> = [];

  // Default margins & layout
  const margins = options.margins ?? { top: 72, bottom: 72, left: 72, right: 72 };
  const layout = options.layout ?? 'portrait';

  // Create PDF document
  const doc = new PDFDocument({
    margins,
    layout,
    info: {
      Title: transcription.meetingTitle || `Transcription ${transcription.id}`,
      Author: 'Transcription App',
      Subject: 'Meeting Transcription',
    },
    bufferPages: true,
  });

  // Page numbering will be done at the end before finalizing
  // We won't use on('pageAdded') to avoid infinite recursion
  // We'll add headers and footers after all content is done

  // Pipe stream
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Logo
  if (options.logoPath && fs.existsSync(options.logoPath)) {
    doc.image(options.logoPath, margins.left, 20, { width: 100 });
  }

  // Title
  doc.moveDown( options.logoPath ? 5 : 2 )
    .fontSize(20)
    .font('Helvetica-Bold')
    .text(transcription.meetingTitle || transcription.fileName, { align: 'center' });

  // Record TOC: Meeting Details
  if (options.includeTOC) tocEntries.push({ title: 'Meeting Details', page: doc.bufferedPageRange().start + 1 });

  // Meeting Details
  doc.moveDown();
  doc.fontSize(12).font('Helvetica-Bold').text('Meeting Details');
  doc.fontSize(10).font('Helvetica');
  const meetDate = transcription.meetingDate || transcription.createdAt;
  doc.text(`Date: ${new Date(meetDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  if (transcription.participants) doc.text(`Participants: ${transcription.participants}`);
  if (transcription.duration) {
    const m = Math.floor(transcription.duration / 60);
    const s = Math.round(transcription.duration % 60);
    doc.text(`Duration: ${m}m ${s}s`);
  }

  // Summary Section
  if (transcription.summary) {
    if (options.includeTOC) tocEntries.push({ title: 'Summary', page: doc.bufferedPageRange().start + 1 });
    doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(transcription.summary, { width: 450, align: 'justify' });
  }

  // Action Items
  const items = parseActionItems(transcription);
  if (items.length) {
    if (options.includeTOC) tocEntries.push({ title: 'Action Items', page: doc.bufferedPageRange().start + 1 });
    doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').text('Action Items');
    items.forEach((it, i) => doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${it}`, { indent: 20, width: 450 }));
  }

  // Table of Contents - simplified to avoid pdfkit TypeScript issues
  if (options.includeTOC && tocEntries.length) {
    const toc = tocEntries.slice().sort((a, b) => a.page - b.page);
    
    // Add TOC at the beginning - add a page after the intro
    doc.addPage();
    doc.fontSize(16).font('Helvetica-Bold').text('Table of Contents', { align: 'center' });
    doc.moveDown();
    
    // Add each TOC entry
    toc.forEach(e => {
      doc.fontSize(10)
         .font('Helvetica')
         .text(`${e.title} ...... ${e.page}`, { width: 450 });
    });
  }

  // Transcript Section
  if (options.includeTOC) tocEntries.push({ title: 'Transcript', page: doc.bufferedPageRange().start + 1 });
  doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text('Transcript');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Courier');

  try {
    // Try to use structured transcript if available
    if (structuredTranscript?.segments?.length) {
      // Create a safer way to handle segments - group by speaker to avoid too many segments
      const speakerGroups: { 
        speaker: string; 
        segments: { time: string; text: string; }[];
      }[] = [];
      
      // First group segments by speaker
      let currentSpeaker = '';
      let currentGroup: { speaker: string; segments: { time: string; text: string; }[] } | null = null;
      
      structuredTranscript.segments.forEach((seg: any) => {
        try {
          const speaker = seg.speaker || 'Unknown Speaker';
          const time = formatTime(seg.start);
          const text = seg.text || '';
          
          // Start a new group if speaker changes
          if (speaker !== currentSpeaker) {
            currentSpeaker = speaker;
            currentGroup = { speaker, segments: [] };
            speakerGroups.push(currentGroup);
          }
          
          // Add segment to current group
          if (currentGroup) {
            currentGroup.segments.push({ time, text });
          }
        } catch (e) {
          // Skip problematic segments
          console.error("Error processing segment in PDF generation:", e);
        }
      });
      
      // Now render each group
      speakerGroups.forEach(group => {
        try {
          // Speaker heading
          doc.fontSize(10).font('Helvetica-Bold').text(group.speaker);
          
          // Speaker segments
          doc.fontSize(9).font('Courier');
          group.segments.forEach(seg => {
            try {
              doc.text(`[${seg.time}] ${seg.text}`, { 
                width: 450, 
                align: 'left',
                indent: 10
              });
              doc.moveDown(0.2);
            } catch (e) {
              // Skip problematic text rendering
            }
          });
          
          // Space between speakers
          doc.moveDown(0.8);
        } catch (e) {
          // Skip problematic groups
        }
      });
    } else if (transcription.text) {
      // Fallback to raw text
      doc.text(transcription.text, { width: 450, align: 'justify' });
    }
  } catch (e) {
    // Last resort fallback
    doc.fontSize(10).font('Helvetica');
    doc.text("Error rendering transcript. Please try again or contact support.", { 
      width: 450, 
      align: 'center' 
    });
    console.error("Error in PDF transcript rendering:", e);
  }

  // Add page numbers
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  
  // Iterate through each page to add headers and footers
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    
    // Simplified header and footer (no recursive calls)
    // Header
    doc.fontSize(8)
      .font('Helvetica')
      .text(
        transcription.meetingTitle || '',
        doc.page.margins.left,
        20,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
      );
    
    // Footer
    doc.fontSize(8)
      .text(
        `Page ${i + 1} of ${totalPages}`,
        doc.page.margins.left,
        doc.page.height - 30,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
      );
  }
  
  // Finalize
  doc.end();

  // Cleanup on finish
  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      // delete file after 1 hour
      setTimeout(() => fs.unlink(filePath, () => {}), 3600000);
      resolve({ filePath, fileName });
    });
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

// Function removed to fix infinite recursion issues

function parseActionItems(trans: Transcription): string[] {
  try {
    const arr = JSON.parse(trans.actionItems || '[]');
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {}
  const lines = (trans.actionItems || '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length) return lines;
  // Regex-based extraction
  const kw = ['need to', 'should', 'must', 'deadline', 'follow up', 'plan'];
  return (trans.summary || '').split(/\r?\n/)
    .filter(l => kw.some(w => l.toLowerCase().includes(w)))
    .map(l => l.replace(/^[\-•]\s*/, '').trim());
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
