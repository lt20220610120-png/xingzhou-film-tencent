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
import asyncio
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from batch_scheduler import BatchScheduler, QueueFull, ServiceClosing

MODEL_ID = 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'
MODEL_PATH = ROOT / 'models' / MODEL_ID
LANGUAGES = ['Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian']
DEFAULT_INSTRUCTIONS = '成年女性，声线温暖清晰，普通话标准，语气自然，适合短剧对白。'
model = None
scheduler = None
last_inference = {}
http_server = None

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
    global model, scheduler
    import torch
    from qwen_tts import Qwen3TTSModel
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is not available; refusing silent CPU fallback')
    torch.set_num_threads(4)
    logging.info('Loading %s on %s', MODEL_ID, torch.cuda.get_device_name(0))
    model = Qwen3TTSModel.from_pretrained(str(MODEL_PATH), device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa', local_files_only=True)
    scheduler = BatchScheduler(generate_batch, max_batch_size=max(1, min(6, int(os.environ.get('QWEN_TTS_MAX_BATCH_SIZE', '6')))),
                               max_pending=24, is_oom=lambda exc: isinstance(exc, torch.cuda.OutOfMemoryError),
                               recover_oom=torch.cuda.empty_cache,
                               batch_limit=lambda items: 3 if any(len(text) > 80 for text, _, _ in items) else 6)
    logging.info('Qwen VoiceDesign ready on 127.0.0.1:7891')
    try:
        yield
    finally:
        await asyncio.to_thread(scheduler.close)
        scheduler = None
        model = None
        torch.cuda.empty_cache()

app = FastAPI(title='本地 Qwen3-TTS Voice Design', lifespan=lifespan)

@app.get('/health')
def health():
    return {'ready': model is not None and scheduler is not None and not scheduler.closing,
            'model': MODEL_ID, 'device': 'cuda:0', 'model_path': str(MODEL_PATH),
            'concurrency': scheduler.snapshot() if scheduler is not None else None,
            'long_text_policy': {'threshold_characters': 80, 'max_batch_size': 3},
            'last_inference': dict(last_inference)}

@app.get('/v1/models')
def models():
    return {'object': 'list', 'data': [{'id': MODEL_ID, 'object': 'model', 'owned_by': 'local', 'kind': 'audio', 'output_modalities': ['audio']}]}


@app.post('/internal/shutdown')
async def shutdown():
    if http_server is None or scheduler is None:
        raise HTTPException(503, 'Service is not running')
    scheduler.close(wait=False)
    http_server.should_exit = True
    return {'stopping': True, 'active_requests': scheduler.snapshot()['active']}

def generate_batch(items):
    """The sole GPU owner invokes the official API once with N input lists."""
    global last_inference
    import torch
    import soundfile as sf
    torch.cuda.synchronize()
    torch.cuda.reset_peak_memory_stats()
    started = time.monotonic()
    texts, instructions, languages = zip(*items)
    with torch.inference_mode():
        wavs, sr = model.generate_voice_design(text=list(texts), language=list(languages), instruct=list(instructions))
    torch.cuda.synchronize()
    last_inference = {'batch_size': len(items), 'seconds': round(time.monotonic() - started, 3),
                      'peak_allocated_mib': round(torch.cuda.max_memory_allocated() / 2**20, 1),
                      'peak_reserved_mib': round(torch.cuda.max_memory_reserved() / 2**20, 1)}
    logging.info('Real Qwen batch inference: %s', last_inference)
    outputs = []
    for wav in wavs:
        output = io.BytesIO()
        sf.write(output, wav, sr, format='WAV', subtype='PCM_16')
        outputs.append(output.getvalue())
    # Do not retain the long-batch allocator cache in scarce 8GB device memory.
    torch.cuda.empty_cache()
    return outputs


@app.post('/v1/audio/speech')
async def speech(request: SpeechRequest, connection: Request):
    values = validate_request(request)
    if model is None or scheduler is None:
        raise HTTPException(503, 'Model is not loaded')
    future = None
    try:
        future = scheduler.submit(values)
        wrapped = asyncio.wrap_future(future)
        while True:
            try:
                audio = await asyncio.wait_for(asyncio.shield(wrapped), timeout=.25)
                break
            except asyncio.TimeoutError:
                if await connection.is_disconnected():
                    wrapped.cancel()
                    future.cancel()
                    raise HTTPException(499, 'Client disconnected')
        return Response(audio, media_type='audio/wav')
    except QueueFull as exc:
        raise HTTPException(429, str(exc), headers={'Retry-After': '2'})
    except ServiceClosing as exc:
        raise HTTPException(503, str(exc))
    except asyncio.CancelledError:
        if future is not None:
            future.cancel()
        raise
    except HTTPException:
        raise
    except Exception:
        logging.exception('Voice generation failed')
        raise HTTPException(503, 'Voice generation failed; inspect local server log or try a shorter text')

if __name__ == '__main__':
    import uvicorn
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    http_server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=7891, access_log=False))
    http_server.run()
