"""Actual local GPU service cancellation/shutdown smoke; leaves service stopped."""
import concurrent.futures
import io
import json
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
import soundfile as sf

BASE = 'http://127.0.0.1:7891'
OUT = Path(__file__).resolve().parents[2] / 'output/local-qwen-concurrency-2026-11-01/lifecycle.json'


def health():
    with urllib.request.urlopen(BASE + '/health', timeout=3) as response:
        return json.load(response)


def wait_for(predicate):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        state = health()
        if predicate(state):
            return state
        time.sleep(.1)
    raise AssertionError('Timed out waiting for service state')


def request(text):
    data = json.dumps(dict(input=text, language='Chinese')).encode()
    req = urllib.request.Request(BASE + '/v1/audio/speech', data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            body = response.read()
            wav, rate = sf.read(io.BytesIO(body))
            return dict(status=response.status, duration_seconds=len(wav) / rate)
    except urllib.error.HTTPError as exc:
        return dict(status=exc.code, detail=exc.read().decode())


if __name__ == '__main__':
    evidence = dict(before=health())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        active = executor.submit(request, '我一直想把这件事情告诉你，但是每次看到你忙碌的样子，又觉得应该再等一等。今天既然终于见面，我们就坐下来慢慢聊，把这些年没有说完的话都说清楚。')
        evidence['active'] = wait_for(lambda state: state['concurrency']['active'] == 1)
        # Full HTTP request then close the connection while it is waiting behind the GPU batch.
        payload = json.dumps(dict(input='这条请求取消，不应参与推理。')).encode()
        raw = socket.create_connection(('127.0.0.1', 7891))
        raw.sendall((f'POST /v1/audio/speech HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {len(payload)}\r\n\r\n').encode() + payload)
        wait_for(lambda state: state['concurrency']['pending'] == 1)
        raw.close()
        evidence['after_disconnect'] = wait_for(lambda state: state['concurrency']['pending'] == 0)
        queued = executor.submit(request, '这条等待中的请求应在关闭时收到明确的错误。')
        wait_for(lambda state: state['concurrency']['pending'] == 1)
        stop = urllib.request.Request(BASE + '/internal/shutdown', method='POST')
        with urllib.request.urlopen(stop, timeout=5) as response:
            evidence['shutdown'] = json.load(response)
        evidence['queued_result'] = queued.result(10)
        evidence['active_result'] = active.result(180)
    assert evidence['queued_result']['status'] == 503, evidence
    assert evidence['active_result']['status'] == 200, evidence
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            health()
        except (OSError, urllib.error.URLError):
            evidence['port_closed'] = True
            break
        time.sleep(.2)
    assert evidence.get('port_closed'), evidence
    OUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(evidence, ensure_ascii=False))
