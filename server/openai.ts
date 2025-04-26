import OpenAI from "openai";
import fs from "fs";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'default_key' 
});

// Audio transcription function
export async function transcribeAudio(audioFilePath: string): Promise<{ text: string }> {
  try {
    const audioReadStream = fs.createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("OpenAI Transcription Error:", error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}
