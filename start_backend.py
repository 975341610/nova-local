try:
    import llama_cpp
except ImportError:
    pass
import uvicorn
import os
import sys

# Add second-brain-ai to path
sys.path.append(os.path.join(os.getcwd(), 'second-brain-ai'))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
