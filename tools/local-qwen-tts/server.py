"""Loopback-only OpenAI Speech adapter for the official Qwen VoiceDesign model."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parent
os.environ.setdefault('HF_HOME', str(ROOT / 'cache' / 'huggingface'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
os.environ.setdefault('TMP', str(ROOT / 'cache' / 'tmp'))
(ROOT / 'cache' / 'tmp').mkdir(parents=True, exist_ok=True)

import io
import logging
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODEL_ID = 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'
MODEL_PATH = ROOT / 'models' / MODEL_ID
LANGUAGES = ['Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian']
DEFAULT_INSTRUCTIONS = '成年女性，声线温暖清晰，普通话标准，语气自然，适合短剧对白。'
model = None
lock = threading.Lock()

class SpeechRequest(BaseModel):
    model: str = MODEL_ID
    input: str = Field(min_length=1, max_length=1000)
    voice: str = 'default'
    instructions: str = Field(default='', max_length=2000)
    language: str = 'Chinese'
    response_format: str = 'wav'
    speed: float = 1.0

def validate_request(request):
    if request.model not in [MODEL_ID, 'Qwen/' + MODEL_ID]:
        raise HTTPException(400, 'This service only loads ' + MODEL_ID)
    if request.response_format != 'wav' or request.speed != 1.0:
        raise HTTPException(400, 'Use response_format=wav and speed=1')
    if request.language not in LANGUAGES or not request.input.strip():
        raise HTTPException(400, 'Invalid language or empty input')
    return request.input.strip(), request.instructions.strip() or DEFAULT_INSTRUCTIONS, request.language

@asynccontextmanager
async def lifespan(app):
    global model
    import torch
    from qwen_tts import Qwen3TTSModel
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is not available; refusing silent CPU fallback')
    torch.set_num_threads(4)
    logging.info('Loading %s on %s', MODEL_ID, torch.cuda.get_device_name(0))
    model = Qwen3TTSModel.from_pretrained(str(MODEL_PATH), device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa', local_files_only=True)
    logging.info('Qwen VoiceDesign ready on 127.0.0.1:7891')
    yield
    model = None
    torch.cuda.empty_cache()

app = FastAPI(title='本地 Qwen3-TTS Voice Design', lifespan=lifespan)

@app.get('/health')
def health():
    return {'ready': model is not None, 'model': MODEL_ID, 'device': 'cuda:0', 'model_path': str(MODEL_PATH)}

@app.get('/v1/models')
def models():
    return {'object': 'list', 'data': [{'id': MODEL_ID, 'object': 'model', 'owned_by': 'local', 'kind': 'audio', 'output_modalities': ['audio']}]}

@app.post('/v1/audio/speech')
def speech(request: SpeechRequest):
    text, instructions, language = validate_request(request)
    if model is None:
        raise HTTPException(503, 'Model is not loaded')
    if not lock.acquire(blocking=False):
        raise HTTPException(409, 'Model is busy generating another clip; wait before submitting')
    try:
        import torch
        import soundfile as sf
        with torch.inference_mode():
            wavs, sr = model.generate_voice_design(text=text, language=language, instruct=instructions)
        output = io.BytesIO()
        sf.write(output, wavs[0], sr, format='WAV', subtype='PCM_16')
        return Response(output.getvalue(), media_type='audio/wav')
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        raise HTTPException(503, 'GPU memory is full; close other GPU applications and try a shorter text')
    except Exception:
        logging.exception('Voice generation failed')
        raise HTTPException(500, 'Voice generation failed; inspect local server log')
    finally:
        lock.release()

if __name__ == '__main__':
    import uvicorn
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    uvicorn.run(app, host='127.0.0.1', port=7891, access_log=False)
