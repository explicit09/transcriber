import OpenAI from "openai";
import fs from "fs";
import { TranscriptSegment, StructuredTranscript } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'default_key' 
});

// Basic audio transcription function
export async function transcribeAudio(audioFilePath: string): Promise<{ 
  text: string, 
  duration?: number,
  language?: string 
}> {
  try {
    const audioReadStream = fs.createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    // Extract any duration information if available
    const duration = transcription.duration;
    
    return {
      text: transcription.text,
      duration,
      language: transcription.language,
    };
  } catch (error) {
    console.error("OpenAI Transcription Error:", error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

// Enhanced transcription with speaker diarization and timestamps
export async function transcribeAudioWithFeatures(
  audioFilePath: string, 
  options: { 
    enableSpeakerDiarization?: boolean,
    enableTimestamps?: boolean,
    language?: string
  } = {}
): Promise<{
  text: string,
  structuredTranscript: StructuredTranscript,
  duration?: number,
  language?: string
}> {
  try {
    // First get the basic transcription with timestamps
    const audioReadStream = fs.createReadStream(audioFilePath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: options.language,
    });

    // Extract segments with timestamps
    const segments: TranscriptSegment[] = (transcription.segments || []).map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker: undefined // Will be filled in if speaker diarization is enabled
    }));

    // If speaker diarization is requested, process with GPT-4o
    let speakerCount = 0;
    if (options.enableSpeakerDiarization && segments.length > 0) {
      const processedSegments = await processSpeakerDiarization(segments, transcription.text);
      segments.length = 0; // Clear the array
      segments.push(...processedSegments.segments);
      speakerCount = processedSegments.speakerCount;
    }

    // Create the structured transcript
    const structuredTranscript: StructuredTranscript = {
      segments,
      metadata: {
        speakerCount: speakerCount || undefined,
        duration: transcription.duration,
        language: transcription.language,
      }
    };

    return {
      text: transcription.text,
      structuredTranscript,
      duration: transcription.duration,
      language: transcription.language,
    };
  } catch (error) {
    console.error("Enhanced Transcription Error:", error);
    throw new Error(`Failed to transcribe audio with features: ${error.message}`);
  }
}

// Process speaker diarization using GPT-4o
async function processSpeakerDiarization(
  timestampedSegments: TranscriptSegment[],
  fullText: string
): Promise<{ segments: TranscriptSegment[], speakerCount: number }> {
  try {
    // Format the segments for GPT
    const segmentsText = timestampedSegments
      .map(s => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`)
      .join('\n');

    // Ask GPT-4o to analyze and assign speakers
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert speech and conversation analyst with extensive experience in speaker diarization and identification. Your task is to analyze a transcript and accurately identify different speakers.

ANALYSIS APPROACH:
1. Carefully identify unique speaking patterns, vocabulary choices, and conversation roles for each speaker
2. Track conversation turns, interruptions, and responses to accurately map dialogue flow
3. Note speech patterns like formal/informal language, technical terms, and verbal tics unique to each speaker
4. Pay special attention to self-references and explicit speaker mentions ("As I said earlier", "John, what do you think?")
5. Analyze topic continuity - a new speaker often changes the subject or asks questions
6. For meeting contexts, identify roles (facilitator, presenter, participant) from conversational dynamics
7. In natural conversations, look for turn-taking patterns, response pairs (question→answer), and shifts in perspective

COMMON CONVERSATION PATTERNS:
- Long explanations followed by questions typically indicate different speakers
- Statements like "That's true" or "I agree" often indicate a speaker change
- First-person perspective shifts ("I think..." vs "You mentioned...") indicate speaker changes
- Verbal acknowledgments ("OK", "Yeah", "Right") often signal the start of a new speaker's turn
- Questions are usually followed by answers from a different speaker
- When the pronoun usage changes from "I" to "you" (or vice versa), it often indicates a speaker change

ACADEMIC CONVERSATION PATTERNS:
- When a speaker uses academic terms or explains concepts in depth, they're likely a professor/instructor
- When a speaker uses "we" to describe a project or research, they're likely a student presenting their work
- Short acknowledgments ("OK", "Yeah", "That's true") followed by longer explanations often indicate student-professor dynamics
- When someone asks probing questions about implementation or feasibility, they're often the professor/instructor
- Phrases like "I would ask", "my concern would be", "one thing is that" often indicate the professor speaking
- References to "students", "classroom", "teaching", or "instructor" provide role-context clues
- Look for shifts between theoretical discussion and practical implementation details

INTERVIEW/DISCUSSION PATTERNS:
- Look for interviewer/interviewee dynamics with question-answer patterns
- Statements seeking clarification ("So what you're saying is...") indicate a different speaker
- Short acknowledgment phrases followed by longer statements indicate turn-taking
- References to "you" vs "we" can indicate organizational roles or perspectives
- Longer monologues interspersed with brief agreements typically indicate a primary and secondary speaker

For ambiguous segments, prioritize:
1. Contextual clues from surrounding dialogue
2. Consistent speaking style and vocabulary 
3. Natural conversation flow

EXAMPLES OF GOOD DIARIZATION:
[00:01] Speaker 1: Welcome everyone to today's meeting. Let's start with project updates.
[00:05] Speaker 2: My team completed the database migration. We're ready for testing.
[00:12] Speaker 1: When can we start the testing phase? We need at least a week.
[00:17] Speaker 2: You can begin tomorrow. I'll send the access credentials.
[00:22] Speaker 1: Great. Let's move to the next agenda item.

ACADEMIC CONTEXT EXAMPLE:
[00:01] Student: We are building an AI assistant for Canvas that helps students understand their course materials better.
[00:10] Professor: How would that be different from just using ChatGPT directly?
[00:15] Student: Our system only uses the specific course materials as context, so it won't give information outside the syllabus.
[00:22] Professor: That's interesting. Have you thought about how instructors might view this tool?
[00:28] Student: Yes, we're also adding analytics for professors to see what concepts students find difficult.
[00:35] Professor: OK, I can see how that would be useful. What about privacy concerns?

Format your response as a JSON object with the following structure:
{
  "speakerCount": number,
  "segments": [
    {
      "start": number,
      "end": number,
      "text": "string",
      "speaker": "Speaker 1"
    },
    ...
  ]
}

For academic conversations, you can use role-based labels like "Student" and "Professor" if the roles are very clear from the context. Otherwise, use "Speaker 1", "Speaker 2", etc.
For best results, read the full transcript first to understand the overall conversation before assigning speakers.`
        },
        {
          role: "user",
          content: `Here is the transcript with timestamps:\n\n${segmentsText}\n\nFull transcript for context:\n${fullText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3 // Lower temperature for more consistent results
    });

    // Parse the JSON response
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      segments: result.segments,
      speakerCount: result.speakerCount
    };
  } catch (error) {
    console.error("Speaker Diarization Error:", error);
    // Return the original segments if diarization fails
    return { 
      segments: timestampedSegments,
      speakerCount: 0
    };
  }
}

// Generate transcript summary using GPT-4o
export async function generateTranscriptSummary(text: string): Promise<{ 
  summary: string;
  actionItems: string[];
  keywords: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Analyze the following meeting transcript and provide a comprehensive summary with key actionables.
          
          Extract these components:
          1. Key points and decisions made in the meeting (1-2 paragraphs)
          2. ACTION ITEMS with clear owners and deadlines (if mentioned) - this is critical
          3. Important discussion topics
          4. Up to 10 important keywords or phrases
          
          Format your response as a JSON object with the following structure:
          {
            "summary": "A concise summary of the meeting (max 250 words)",
            "actionItems": [
              "Person X needs to complete task Y by deadline Z",
              "Team needs to follow up on...",
              "etc."
            ],
            "keywords": ["keyword1", "keyword2", "etc"]
          }
          
          For the action items:
          - Make them VERY specific and actionable
          - Begin with the person or team responsible
          - Include deadlines if mentioned
          - Focus on concrete tasks rather than vague responsibilities
          - If no clear action items are mentioned, identify what needs to be done next based on the discussion
          - Label high-priority items with [PRIORITY] prefix
          
          Structure the summary with clear paragraphs and use bullet points for important lists.`
        },
        {
          role: "user",
          content: text
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the JSON response
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      summary: result.summary,
      actionItems: result.actionItems || [],
      keywords: result.keywords || []
    };
  } catch (error) {
    console.error("Summary Generation Error:", error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// Translate transcript to another language
export async function translateTranscript(
  text: string, 
  targetLanguage: string
): Promise<{ translatedText: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Translate the following text accurately into ${targetLanguage}. 
          Maintain the meaning, tone, and context of the original text.`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return {
      translatedText: response.choices[0].message.content
    };
  } catch (error) {
    console.error("Translation Error:", error);
    throw new Error(`Failed to translate text: ${error.message}`);
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
