# Plan: Chunked Audio Transcription for Large Files

## Objective
Enable transcription of audio files larger than 25 MB by automatically splitting them into smaller chunks (≤25 MB), transcribing each chunk with OpenAI Whisper, and combining the results into a single, correctly sequenced transcript.

---

## Step-by-Step Plan

### 1. **Audio Chunking**
- **Goal:** Split input audio into segments, each ≤25 MB (OpenAI Whisper's API limit).
- **Method:**
  - Use `ffmpeg` or a Node.js audio processing library to split the file by duration or size.
  - Ensure chunks are split at natural silence points if possible (to avoid cutting words).
  - Name chunks sequentially (e.g., `audio_part_01.wav`, `audio_part_02.wav`, ...).
- **Considerations:**
  - Keep a mapping of chunk order for later recombination.
  - Store chunk start/end times for accurate timestamp mapping.

### 2. **Chunk Upload & Transcription**
- **Goal:** Transcribe each chunk using OpenAI Whisper API.
- **Method:**
  - Loop through each chunk and send it to the Whisper API.
  - Collect the `verbose_json` output for each chunk.
- **Considerations:**
  - Implement rate limiting and retry logic as needed.
  - If a chunk fails, provide a mechanism to retry only that chunk.

### 3. **Sequencing and Merging Transcripts**
- **Goal:** Combine all chunk transcripts into a single, ordered transcript.
- **Method:**
  - Concatenate transcripts in chunk order.
  - Adjust timestamps so that each chunk’s transcript is offset by the cumulative duration of previous chunks.
  - Merge speaker labels and segments to avoid duplicate speaker IDs or overlapping times.
- **Considerations:**
  - Handle cases where a word or sentence is split across chunks (optional: add overlap between chunks and deduplicate transcriptions).

### 4. **Output Final Transcript**
- **Goal:** Provide a seamless, single transcript to the user.
- **Method:**
  - Output as plain text, SRT, or the app’s `StructuredTranscript` format.
  - Optionally, provide original chunk boundaries for debugging or review.

---

## Implementation Notes
- **Tools:** `ffmpeg`, Node.js audio libraries (e.g., `fluent-ffmpeg`, `audiobuffer-to-wav`)
- **API:** OpenAI Whisper API (`/audio/transcriptions`)
- **Edge Cases:**
  - Chunks at non-silence points may cut words; consider small overlaps.
  - Speaker diarization may need to be recombined or post-processed.
- **Extensibility:**
  - The same framework can be adapted for other APIs (e.g., AssemblyAI) with larger limits.

---

## Example Workflow
1. User uploads a 100 MB audio file.
2. System splits it into 5 × 20 MB chunks.
3. Each chunk is transcribed in sequence.
4. Timestamps of later chunks are offset by the durations of previous chunks.
5. All transcripts are merged and returned as a single result.

---

## Next Steps
- Prototype chunking logic with `ffmpeg`.
- Build chunk upload/transcription loop.
- Implement transcript merging and timestamp adjustment.
- Integrate with the existing backend pipeline.
