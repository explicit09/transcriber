# Advanced Speaker Diarization for Transcriber

This directory contains the Python code for advanced speaker recognition using [pyannote.audio](https://github.com/pyannote/pyannote-audio).

## Why pyannote.audio?
Text-based speaker diarization (using GPT-4) is limited because it can't reliably distinguish more than two speakers. Pyannote.audio uses neural networks specifically trained for speaker recognition and can accurately identify 3+ speakers in a conversation.

## Installation

1. Install Python 3.9+ if you don't have it already
2. Install the required Python packages:

```bash
# From the project root
cd python
pip install -r requirements.txt
```

3. Get a HuggingFace token with access to the pyannote.audio models:
   - Create an account on [HuggingFace](https://huggingface.co/)
   - Visit the [pyannote/speaker-diarization-3.0](https://huggingface.co/pyannote/speaker-diarization-3.0) model page
   - Accept the license agreement
   - Create an access token in your [HuggingFace settings](https://huggingface.co/settings/tokens)

4. Set your HuggingFace token as an environment variable:

```bash
# On macOS/Linux
export HUGGINGFACE_TOKEN=your_token_here

# On Windows
set HUGGINGFACE_TOKEN=your_token_here
```

5. Test the installation:

```bash
python diarization.py test_audio.mp3
```

## Hardware Requirements

For optimal performance:
- A CUDA-compatible GPU is recommended for faster processing
- For CPU-only systems, expect longer processing times (3-10x slower)

## Troubleshooting

If you encounter issues:

1. Check that Python and pip are correctly installed
2. Verify you have the correct HuggingFace token with access to the model
3. For CUDA errors, ensure you have compatible NVIDIA drivers installed
4. For memory errors, try processing shorter audio files or use a machine with more RAM

## Customization

You can adjust speaker detection parameters in `diarization.py`:
- Change the `min_cluster_size` for different speaker separation thresholds
- Set `num_speakers` when you know how many speakers are in a recording 