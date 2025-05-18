export function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

export function structuredTranscriptToSRT(transcript) {
  return transcript.segments
    .map((seg, idx) => {
      const start = formatTimestamp(seg.start);
      const end = formatTimestamp(seg.end);
      return `${idx + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
}
