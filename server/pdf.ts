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

  // Page header and footer
  doc.on('pageAdded', () => addHeaderFooter(doc, transcription));
  // First page header/footer
  addHeaderFooter(doc, transcription);

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

  // Table of Contents at front
  if (options.includeTOC && tocEntries.length) {
    const toc = tocEntries.slice().sort((a, b) => a.page - b.page);
    doc.flushPages();
    doc.addPage({ at: 1 });
    doc.fontSize(16).font('Helvetica-Bold').text('Table of Contents', { align: 'center' });
    doc.moveDown();
    toc.forEach(e => doc.fontSize(10).font('Helvetica').text(`${e.title} ...... ${e.page}`, { width: 450 }));
  }

  // Transcript Section
  if (options.includeTOC) tocEntries.push({ title: 'Transcript', page: doc.bufferedPageRange().start + 1 });
  doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text('Transcript');
  doc.moveDown(0.5);
  doc.fontSize(9).font('Courier');

  if (structuredTranscript?.segments?.length) {
    structuredTranscript.segments.forEach((seg: any) => {
      const t = formatTime(seg.start);
      const speaker = seg.speaker ? `${seg.speaker}: ` : '';
      // Detect URL
      const urlMatch = seg.text.match(/https?:\/\/\S+/);
      if (urlMatch) {
        doc.text(`[${t}] ${speaker}`, { continued: true });
        doc.text(seg.text, { link: urlMatch[0], underline: true });
      } else {
        doc.text(`[${t}] ${speaker}${seg.text}`, { width: 450, align: 'left' });
      }
      doc.moveDown(0.3);
    });
  } else if (transcription.text) {
    doc.text(transcription.text, { width: 450, align: 'justify' });
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

function addHeaderFooter(doc: PDFKit.PDFDocument, transcription: Transcription) {
  const range = doc.bufferedPageRange();
  const current = doc.page.pageNumber;
  const total = range.count;
  // Header
  doc.fontSize(8).font('Helvetica').text(
    transcription.meetingTitle || '',
    doc.page.margins.left,
    20,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
  );
  // Footer
  doc.fontSize(8).text(
    `Page ${current} of ${total}`,
    doc.page.margins.left,
    doc.page.height - 30,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
  );
}

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
