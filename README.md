# LEARN-X Transcription App

A powerful meeting transcription application that converts audio files to text with speaker identification.

## Features

- **Audio Transcription**: Convert audio files (MP3, WAV, M4A) to text
- **Speaker Identification**: Automatically identify different speakers
- **Multi-Speaker Support**: Accurately identify 3+ speakers using pyannote.audio
- **Timestamps**: Add time markers to transcripts
- **AI Summaries**: Generate summaries, extract action items and key points
- **Export Options**: Download transcripts as PDF or plain text

## Multi-Speaker Transcription

This app supports two methods for identifying speakers:

1. **Standard Mode**: Uses GPT-4o for text-based speaker identification
   - Works well with 1-2 speakers
   - Limited accuracy with 3+ speakers
   - No additional setup required

2. **Advanced Mode** (Recommended): Uses pyannote.audio
   - Superior accuracy with 3+ speakers
   - Separates overlapping speakers
   - Requires additional setup (see below)

### Improving Speaker Recognition

For best results with multiple speakers:

1. **Specify Speaker Count**: In the transcription form, select the exact number of speakers
2. **Use Clean Audio**: Reduce background noise and ensure speakers are clearly audible
3. **List Participants**: Adding participant names helps improve the model's accuracy

## Setup

### Basic Setup

```bash
# Install dependencies
npm install

# Set environment variables
export OPENAI_API_KEY=your_key_here
export DATABASE_URL="sqlite://local.db"

# Start the application
npm run dev
```

### Advanced Speaker Recognition Setup

For more accurate multi-speaker transcriptions:

1. Install Python 3.9+ and required packages:

```bash
cd python
pip install -r requirements.txt
```

2. Get a HuggingFace token with access to pyannote.audio models:
   - Create an account on [HuggingFace](https://huggingface.co/)
   - Visit [pyannote/speaker-diarization-3.0](https://huggingface.co/pyannote/speaker-diarization-3.0)
   - Accept the license agreement
   - Create an access token in your [HuggingFace settings](https://huggingface.co/settings/tokens)

3. Set environment variables:

```bash
export HUGGINGFACE_TOKEN=your_token_here
export PORT=5001  # Use a different port if 5000 is taken
export DATABASE_URL="sqlite://local.db"
export OPENAI_API_KEY=your_key_here

npm run dev
```

## Troubleshooting

If you encounter the error "address already in use :::5000":

```bash
export PORT=5001
npm run dev
```

## License

For internal use only. 