try:
    import llama_cpp
except ImportError:
    pass
import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
