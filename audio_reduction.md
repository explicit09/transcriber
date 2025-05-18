# Plan: Chunked Audio Transcription for Large Files

## Objective
Enable transcription of audio files larger than 25 MB by automatically splitting them into smaller chunks (≤25 MB), transcribing each chunk with OpenAI Whisper, and combining the results into a single, correctly sequenced transcript.

---

## Step-by-Step Plan (with Implementation Status)

### 1. **Audio Chunking**
- **Goal:** Split input audio into segments, each ≤25 MB (OpenAI Whisper's API limit).
- **Status:** **Fully Implemented (Silence-Based & Timed)**
- **Method:**
  - Uses `ffmpeg` (see `server/audioChunker.ts`) to split the file at natural silence points, ensuring each chunk is ≤25 MB.
  - Chunks are named sequentially (e.g., `part-001.wav`, ...).
  - Explicitly stores and returns chunk start/end times for each chunk.
- **Considerations:**
  - Mapping of chunk order is maintained by file naming and order.
  - Chunks are split at natural silence points for improved transcript quality.
  - Start/end times for each chunk are available for advanced mapping/debugging.

### 2. **Chunk Upload & Transcription**
- **Goal:** Transcribe each chunk using OpenAI Whisper API.
- **Status:** **Fully Implemented (Robust & Fault-Tolerant)**
- **Method:**
  - Each chunk is sent to the Whisper API (`server/openai.ts`), using rate limiting and retry logic.
  - Collects `verbose_json` output for each chunk.
  - If a chunk fails after all retries, it is recorded in a `failedChunks` array with its file path, start/end times, and error message. The process continues for other chunks, and the result includes both successful and failed chunks for selective reprocessing or reporting.
- **Considerations:**
  - Robust chunk-level retry and error reporting are implemented. Single chunk failures do not halt the entire job.

### 3. **Sequencing and Merging Transcripts**
- **Goal:** Combine all chunk transcripts into a single, ordered transcript.
- **Status:** **Fully Implemented (Overlap, Deduplication, Speaker Merging)**
- **Method:**
  - Concatenates transcripts in chunk order.
  - Adjusts timestamps by offsetting each chunk's transcript by the cumulative duration of previous chunks.
  - Adds overlap (1–2 seconds) between chunks during splitting, and deduplicates overlapping text and segments during merging.
  - Refines speaker merging at chunk boundaries: if the last segment of one chunk and the first of the next are from the same speaker and contiguous, they are merged into a single segment.
- **Considerations:**
  - Transcript is seamless, with no duplicated text or artificial speaker breaks at chunk boundaries.

### 4. **Output Final Transcript**
- **Goal:** Provide a seamless, single transcript to the user.
- **Status:** **Fully Implemented (Plain Text, StructuredTranscript, SRT)**
- **Method:**
  - Outputs as plain text, as a `StructuredTranscript` object, and as SRT (via the CLI or backend using the type-safe utility in `server/srt.ts`).
  - SRT output is integrated into the output pipeline and can be generated for any transcript.
  - **Next:** Optionally include original chunk boundary metadata for debugging/review.

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
2. System splits it into 5 × 20 MB chunks at natural silence points.
3. Each chunk is transcribed in sequence, with robust error handling and reporting for any failed chunks.
4. Timestamps of later chunks are offset by the durations of previous chunks.
5. All transcripts are merged and returned as a single result, with no duplicated text or artificial speaker breaks.
6. User can download the transcript as plain text, JSON, or SRT.

---

## Implementation Status Summary
- **Core pipeline (chunking, transcription, merging, output):** Implemented and functional.
- **Silence-based chunking and explicit chunk timing:** Fully implemented.
- **Robust chunk-level retry and error reporting:** Fully implemented.
- **Overlap, deduplication, and speaker merging:** Fully implemented.
- **SRT output:** Fully implemented and integrated.
- **Chunk boundary metadata:** Optional/next.

---

## Recommended Next Steps & Enhancements

1. **Output Enhancements:**
   - Optionally, include original chunk boundaries in the output for debugging/review.

2. **Robustness:**
   - Further enhance error handling and reporting as needed.

---

## Next Steps (Actionable Tasks)
- [ ] Optionally, include chunk boundary metadata in output.
- [ ] Review and refine error handling as needed.

---

## Integration
- The current pipeline is integrated with the backend and will automatically use chunked transcription for large files. SRT output is available via CLI or backend. Further enhancements can be incrementally added as above.
