"""Real local HTTP/GPU concurrency benchmark. No external calls or credentials."""
import concurrent.futures
import argparse
import hashlib
import io
import json
import threading
import time
import urllib.request
from pathlib import Path
import numpy as np
import soundfile as sf

BASE = 'http://127.0.0.1:7891'
OUT = Path(__file__).resolve().parents[2] / 'output' / 'local-qwen-concurrency-2026-11-01'
SAMPLES = [
    ('你好，今天的阳光真好。', 'Chinese', '成年女性，温暖清晰，自然说话。'),
    ('等等，这件事还没有结束。', 'Chinese', '成年男性，低沉沉稳，坚定地说话。'),
    ('Please wait. I have something to tell you.', 'English', 'Adult female, clear and warm, natural speech.'),
    ('别担心，我一定会回来。', 'Chinese', '成年男性，清晰温柔，安慰的语气。'),
    ('We should leave before the rain starts.', 'English', 'Adult male, calm, clear and natural speech.'),
    ('原来你一直都记得。', 'Chinese', '成年女性，清晰自然，带一点惊讶。'),
]
LONG_SAMPLES = [
    ('今天我终于可以把这件事告诉你了。这些年，我一直在寻找当初的答案。无论接下来会发生什么，我都希望你能够相信自己的选择。等到明天太阳升起的时候，我们一起去看看那个曾经约定过的地方。', 'Chinese', SAMPLES[0][2]),
    ('我不是来向你解释过去的，而是想和你商量下一步的计划。如果我们现在出发，天黑之前应该就能到达。把需要的东西准备好，其他的事情交给我。请你相信，这一次我一定会把大家安全地带回来。', 'Chinese', SAMPLES[1][2]),
    ('I have been waiting for the right moment to explain what happened. We still have enough time to make a different choice. Please take a deep breath, look at the map, and tell me where you want to go next.', 'English', SAMPLES[2][2]),
    ('别再一个人担心了，你还有我们。只要把眼前的问题一件一件解决，总会找到新的办法。先坐下来喝口水，然后慢慢告诉我，到底是谁给你送来了那封信，又是谁让你今天晚上必须离开这里。', 'Chinese', SAMPLES[3][2]),
    ('Before we leave, there is one more thing you should know. The old bridge is closed, so we will need to take the road through the village. It may take longer, but we can get there safely before sunset.', 'English', SAMPLES[4][2]),
    ('原来那天站在门外的人真的是你。我还以为是自己记错了，才一直没有开口询问。既然今天终于见面，有些话就不应该继续藏在心里。你愿意坐下来，和我从头聊一聊这些年发生的事情吗？', 'Chinese', SAMPLES[5][2]),
]


def health():
    with urllib.request.urlopen(BASE + '/health', timeout=10) as response:
        return json.load(response)


def run(size, long_dialogue=False):
    barrier = threading.Barrier(size)
    def request(index):
        text, language, instructions = (LONG_SAMPLES if long_dialogue else SAMPLES)[index]
        payload = json.dumps(dict(input=text, language=language, instructions=instructions)).encode()
        barrier.wait()
        started = time.monotonic()
        try:
            req = urllib.request.Request(BASE + '/v1/audio/speech', data=payload, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=900) as response:
                audio = response.read()
                status = response.status
            wav, sr = sf.read(io.BytesIO(audio))
            path = OUT / f'{"long-" if long_dialogue else ""}batch{size}-{index + 1}.wav'
            path.write_bytes(audio)
            return dict(index=index, text=text, language=language, status=status,
                        seconds=round(time.monotonic() - started, 3), path=str(path),
                        sample_rate=sr, samples=len(wav), duration_seconds=round(len(wav) / sr, 3),
                        peak=float(np.max(np.abs(wav))), rms=float(np.sqrt(np.mean(wav ** 2))),
                        finite=bool(np.isfinite(wav).all()), sha256=hashlib.sha256(audio).hexdigest())
        except Exception as exc:
            return dict(index=index, seconds=round(time.monotonic() - started, 3), error=str(exc))
    before = health()
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=size) as executor:
        results = list(executor.map(request, range(size)))
    evidence = dict(concurrent_requests=size, wall_seconds=round(time.monotonic() - started, 3),
                    before=before, after=health(), results=results)
    (OUT / f'{"long-" if long_dialogue else ""}batch{size}.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(evidence, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--long', action='store_true')
    parser.add_argument('--counts', type=int, nargs='+', default=[3, 6], choices=range(1, 7))
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for count in args.counts:
        run(count, args.long)
