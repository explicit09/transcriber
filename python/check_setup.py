import os
import sys

def check_environment():
    """Check if the environment is properly set up for pyannote.audio."""
    # Check for HUGGINGFACE_TOKEN
    hf_token = os.environ.get("HUGGINGFACE_TOKEN")
    if not hf_token:
        print("❌ HUGGINGFACE_TOKEN environment variable not found.")
        return False
    else:
        print(f"✅ HUGGINGFACE_TOKEN is set (token: {'*' * 10})")
    
    # Check for pyannote.audio
    try:
        import pyannote.audio
        print(f"✅ pyannote.audio is installed (version: {pyannote.audio.__version__})")
    except ImportError:
        print("❌ pyannote.audio is not installed. Please install it using:")
        print("pip install pyannote.audio==3.1.1")
        return False
    
    # Check for other dependencies
    dependencies = ["torch", "numpy", "soundfile", "librosa", "huggingface_hub"]
    missing = []
    
    for dep in dependencies:
        try:
            module = __import__(dep)
            print(f"✅ {dep} is installed")
        except ImportError:
            missing.append(dep)
            print(f"❌ {dep} is not installed")
    
    if missing:
        print("\nMissing dependencies. Please install them using:")
        print(f"pip install {' '.join(missing)}")
        return False
    
    return True

if __name__ == "__main__":
    if check_environment():
        print("\n✅ Environment is correctly set up for pyannote.audio.")
    else:
        print("\n❌ Environment setup is incomplete for pyannote.audio.")
        sys.exit(1)