#!/usr/bin/env python3
import os
import sys
import json
import torch
from pyannote.audio import Pipeline
from pyannote.audio.pipelines.utils.hook import ProgressHook

def diarize_audio(audio_path, num_speakers=None, hf_token=None):
    """
    Perform speaker diarization on an audio file
    
    Args:
        audio_path: Path to the audio file
        num_speakers: Optional number of speakers (helps improve accuracy)
        hf_token: HuggingFace API token for accessing pyannote.audio
    
    Returns:
        List of speaker segments with start/end times and speaker IDs
    """
    if not hf_token:
        hf_token = os.environ.get("HUGGINGFACE_TOKEN")
        if not hf_token:
            raise ValueError("HuggingFace token required for pyannote.audio")
    
    # Check if audio file exists
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    # Use CUDA if available
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}", file=sys.stderr)
    
    # Initialize the diarization pipeline
    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.0",
            use_auth_token=hf_token
        ).to(device)
    except Exception as e:
        print(f"Error loading pipeline: {e}", file=sys.stderr)
        raise
    
    # Set num_speakers if provided
    if num_speakers is not None:
        pipeline.instantiate({
            "clustering": {"min_cluster_size": 10, "num_clusters": num_speakers}
        })
    
    # Run diarization with progress hook
    try:
        with ProgressHook() as hook:
            diarization = pipeline(audio_path, hook=hook)
    except Exception as e:
        print(f"Diarization failed: {e}", file=sys.stderr)
        raise
    
    # Extract speaker segments
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": round(turn.start, 2),
            "end": round(turn.end, 2),
            "speaker": speaker
        })
    
    return segments

if __name__ == "__main__":
    # This script can be run directly from command line
    if len(sys.argv) < 2:
        print("Usage: python diarization.py <audio_file> [num_speakers]", file=sys.stderr)
        sys.exit(1)
    
    audio_file = sys.argv[1]
    num_speakers = int(sys.argv[2]) if len(sys.argv) > 2 else None
    
    try:
        result = diarize_audio(audio_file, num_speakers)
        # Output JSON to stdout for Node.js to read
        print(json.dumps({"segments": result}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1) 