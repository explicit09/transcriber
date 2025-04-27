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

  // Default margins & layout
  const margins = options.margins ?? { top: 50, bottom: 50, left: 50, right: 50 };
  const layout = options.layout ?? 'portrait';
  
  // Create PDF document
  const doc = new PDFDocument({
    margins,
    layout,
    info: {
      Title: transcription.meetingTitle || `Transcription ${transcription.id}`,
      Author: 'LEARN-X Transcription',
      Subject: 'Meeting Transcription',
    },
    bufferPages: true,
  });

  // Pipe stream
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // ==================== DOCUMENT STYLES ====================
  const styles = {
    colors: {
      primary: '#1a365d',       // Dark blue
      secondary: '#2b6cb0',     // Medium blue
      accent: '#3182ce',        // Light blue
      text: '#2d3748',          // Dark gray
      lightGray: '#e2e8f0',     // Light gray for borders
      success: '#38a169',       // Green for positive elements
    },
    fonts: {
      title: 'Helvetica-Bold',
      heading: 'Helvetica-Bold',
      subheading: 'Helvetica-Bold',
      normal: 'Helvetica',
      mono: 'Courier'
    },
    sizes: {
      title: 24,
      heading: 18,
      subheading: 14,
      normal: 10,
      small: 8
    }
  };

  // ==================== COVER PAGE ====================
  // Header border and background
  doc.rect(0, 0, doc.page.width, 120)
     .fill(styles.colors.primary);
  
  // Logo or header text
  doc.fontSize(styles.sizes.title)
     .fillColor('white')
     .font(styles.fonts.title)
     .text('LEARN-X', 50, 40)
     .fontSize(styles.sizes.subheading)
     .text('Meeting Transcription System', 50, 70);
  
  // Title section
  doc.fontSize(styles.sizes.heading)
     .fillColor(styles.colors.text)
     .font(styles.fonts.heading)
     .text(transcription.meetingTitle || transcription.fileName, margins.left, 150, {
       width: doc.page.width - margins.left - margins.right,
       align: 'center'
     });
  
  // Meeting details box
  const boxTop = 200;
  const boxHeight = 120;
  doc.roundedRect(margins.left, boxTop, doc.page.width - margins.left - margins.right, boxHeight, 5)
     .fillAndStroke('#f7fafc', styles.colors.lightGray);
     
  // Meeting details content
  doc.fontSize(styles.sizes.normal)
     .fillColor(styles.colors.text)
     .font(styles.fonts.normal);
  
  const meetDate = transcription.meetingDate || transcription.createdAt;
  const formattedDate = new Date(meetDate).toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  
  doc.font(styles.fonts.subheading)
     .text('Meeting Details', margins.left + 20, boxTop + 20)
     .font(styles.fonts.normal)
     .text(`Date: ${formattedDate}`, margins.left + 20, boxTop + 45);
  
  if (transcription.participants) {
    doc.text(`Participants: ${transcription.participants}`, margins.left + 20, boxTop + 65);
  }
  
  if (transcription.duration) {
    const m = Math.floor(transcription.duration / 60);
    const s = Math.round(transcription.duration % 60);
    doc.text(`Duration: ${m}m ${s}s`, margins.left + 20, boxTop + 85);
  }
  
  // Document generation info
  doc.fontSize(styles.sizes.small)
     .text(`Generated on ${new Date().toLocaleString()}`, margins.left, doc.page.height - 80, {
       width: doc.page.width - margins.left - margins.right,
       align: 'center'
     });
  
  // ==================== CONTENT PAGES ====================
  // We'll now add content immediately after the cover page without adding extra blank pages
  
  // Add just one page after the cover for all content
  doc.addPage();
  doc.y = 40; // Start at the top of the first content page
  
  // Track if we need section separators
  let needSeparator = false;
  
  // ==================== SUMMARY SECTION ====================
  if (transcription.summary) {
    // Section header
    doc.rect(margins.left, doc.y, doc.page.width - margins.left - margins.right, 40)
       .fill(styles.colors.secondary);
    
    doc.fontSize(styles.sizes.heading)
       .fillColor('white')
       .font(styles.fonts.heading)
       .text('Meeting Summary', margins.left + 20, doc.y + 15);
    
    // Summary content
    doc.fontSize(styles.sizes.normal)
       .fillColor(styles.colors.text)
       .font(styles.fonts.normal)
       .text(transcription.summary, margins.left, doc.y + 60, { 
         width: doc.page.width - margins.left - margins.right, 
         align: 'justify' 
       });
    
    doc.y += 30;
    needSeparator = true;
  }
  
  // ==================== ACTION ITEMS SECTION ====================
  const items = parseActionItems(transcription);
  if (items.length) {
    // Check if we need a new page based on remaining space
    if (doc.y > (doc.page.height * 0.7)) {
      doc.addPage();
      doc.y = 40;
      needSeparator = false;
    } else if (needSeparator) {
      // Add a separator line
      doc.moveTo(margins.left, doc.y)
         .lineTo(doc.page.width - margins.right, doc.y)
         .stroke(styles.colors.lightGray);
      doc.y += 20;
    }
    
    // Section header 
    doc.rect(margins.left, doc.y, doc.page.width - margins.left - margins.right, 40)
       .fill(styles.colors.success);
    
    doc.fontSize(styles.sizes.heading)
       .fillColor('white')
       .font(styles.fonts.heading)
       .text('Action Items', margins.left + 20, doc.y + 15);
    
    doc.y += 60;
    
    // Simplified action item list
    items.forEach((item, i) => {
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
        doc.y = 40;
      }
      
      // Cleaner, simpler action items design
      const circleSize = 16;
      const circleX = margins.left + 10;
      const circleY = doc.y + 3;  // Align with first line of text
      
      // Draw numbered circle
      doc.circle(circleX, circleY, circleSize/2)
         .fillAndStroke(styles.colors.success, styles.colors.success);
      
      // Number inside circle
      doc.fontSize(styles.sizes.small)
         .fillColor('white')
         .font(styles.fonts.normal)
         .text((i + 1).toString(), 
           circleX - (doc.widthOfString((i + 1).toString())/2), 
           circleY - 4);
      
      // Action item text - simple format
      doc.fontSize(styles.sizes.normal)
         .fillColor(styles.colors.text)
         .font(styles.fonts.normal)
         .text(item, 
           margins.left + 30, 
           doc.y, { 
             width: doc.page.width - margins.left - margins.right - 40
           });
      
      doc.moveDown(1);
    });
    
    // Simple footnote
    doc.fontSize(styles.sizes.small)
       .fillColor(styles.colors.text)
       .text('* Action items identified from meeting transcript using AI analysis', 
         margins.left, doc.y + 10, {
           width: doc.page.width - margins.left - margins.right
         });
    
    doc.y += 20;
    needSeparator = true;
  }
  
  // Check if we have keywords to display
  if (transcription.keywords) {
    // Only add new page if we need to
    if (doc.y > doc.page.height - 120) {
      doc.addPage();
      doc.y = 40;
      needSeparator = false;
    } else if (needSeparator) {
      // Add a separator line
      doc.moveTo(margins.left, doc.y)
         .lineTo(doc.page.width - margins.right, doc.y)
         .stroke(styles.colors.lightGray);
      doc.y += 20;
    }
    
    // Simple keywords section header
    doc.fontSize(styles.sizes.subheading)
       .fillColor(styles.colors.secondary)
       .font(styles.fonts.subheading)
       .text('Keywords', margins.left, doc.y);
    
    doc.y += 15;
    
    // Display keywords in a simple comma-separated list
    doc.fontSize(styles.sizes.normal)
       .fillColor(styles.colors.text)
       .font(styles.fonts.normal)
       .text(transcription.keywords, 
         margins.left, doc.y, { 
           width: doc.page.width - margins.left - margins.right
         });
  }
  
  // ==================== TRANSCRIPT PAGE ====================
  // Always add a new page for the transcript
  doc.addPage();
  
  // Section header
  doc.rect(margins.left, 40, doc.page.width - margins.left - margins.right, 40)
     .fill(styles.colors.primary);
  
  doc.fontSize(styles.sizes.heading)
     .fillColor('white')
     .font(styles.fonts.heading)
     .text('Full Transcript', margins.left + 20, 55);
  
  doc.y = 100;
  
  try {
    // Try to use structured transcript if available
    if (structuredTranscript?.segments?.length) {
      // Group segments by speaker
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
          console.error("Error processing segment in PDF generation:", e);
        }
      });
      
      // Now render each group with improved styling
      speakerGroups.forEach(group => {
        try {
          if (doc.y > doc.page.height - 100) {
            doc.addPage();
            doc.y = 60;
          }
          
          // Speaker bubble header
          const speakerWidth = doc.widthOfString(group.speaker) + 40;
          doc.roundedRect(margins.left, doc.y, speakerWidth, 24, 12)
             .fill(styles.colors.secondary);
          
          doc.fontSize(styles.sizes.normal)
             .fillColor('white')
             .font(styles.fonts.subheading)
             .text(group.speaker, margins.left + 20, doc.y + 7);
          
          doc.y += 30;
          
          // Speaker segments in a speech bubble style
          const allSegmentText = group.segments.map(seg => `[${seg.time}] ${seg.text}`).join('\n\n');
          const textHeight = doc.heightOfString(allSegmentText, { 
            width: doc.page.width - margins.left - margins.right - 20,
            paragraphGap: 5
          });
          
          // Bubble background
          doc.roundedRect(
            margins.left + 10, 
            doc.y, 
            doc.page.width - margins.left - margins.right - 20, 
            textHeight + 20, 
            8
          ).fillAndStroke('#f7fafc', styles.colors.lightGray);
          
          // Text content
          doc.fontSize(styles.sizes.normal)
             .fillColor(styles.colors.text)
             .font(styles.fonts.normal);
          
          group.segments.forEach((seg, i) => {
            try {
              doc.text(`[${seg.time}] ${seg.text}`, 
                margins.left + 20, 
                i === 0 ? doc.y + 10 : doc.y, 
                { 
                  width: doc.page.width - margins.left - margins.right - 40,
                  paragraphGap: 5
                }
              );
              
              if (i < group.segments.length - 1) {
                doc.moveDown(0.5);
              }
            } catch (e) {
              // Skip problematic segments
            }
          });
          
          doc.y += 20; // Add space after the bubble
          doc.moveDown(0.8);
        } catch (e) {
          // Skip problematic groups
        }
      });
    } else if (transcription.text) {
      // Fallback to raw text
      doc.fontSize(styles.sizes.normal)
         .fillColor(styles.colors.text)
         .font(styles.fonts.normal)
         .text(transcription.text, margins.left, doc.y, { 
           width: doc.page.width - margins.left - margins.right,
           align: 'justify' 
         });
    }
  } catch (e) {
    // Last resort fallback
    doc.fontSize(styles.sizes.normal)
       .fillColor(styles.colors.text)
       .font(styles.fonts.normal)
       .text("Error rendering transcript. Please try again or contact support.", { 
         width: doc.page.width - margins.left - margins.right,
         align: 'center' 
       });
    console.error("Error in PDF transcript rendering:", e);
  }
  
  // ==================== ADD MINIMAL FOOTER (NO PAGE NUMBERS) ====================
  // Get the actual range of pages we've created
  const range = doc.bufferedPageRange();
  
  // Add only a minimal footer to the cover page
  doc.switchToPage(0);
  doc.fontSize(styles.sizes.small)
     .fillColor(styles.colors.text)
     .font(styles.fonts.normal)
     .text('LEARN-X Transcription', 
       margins.left, doc.page.height - 30,
       { width: doc.page.width - margins.left - margins.right, align: 'center' });
  
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

// Action Items parsing function
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

// Time formatting helper
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
