#!/usr/bin/env python3
import sys
import os

try:
    import pyannote.audio
    print("SUCCESS: pyannote.audio is available")
    print(f"Python executable: {sys.executable}")
    print(f"HuggingFace token available: {'HUGGINGFACE_TOKEN' in os.environ}")
except ImportError as e:
    print(f"ERROR: {e}")
