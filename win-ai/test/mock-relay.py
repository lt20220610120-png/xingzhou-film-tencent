"""Run under `sudo unshare --net`: an isolated gateway + local fake upstream only."""
import http.server
import json
import os
import pathlib
import secrets
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.request
import urllib.error

calls = []
class Upstream(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.path == '/v1/chat/completions'
        assert self.headers['Authorization'] == 'Bearer mock-upstream-secret'
        assert payload['model'] == 'gpt-4o-mini'
        calls.append(payload)
        self.send_response(200)
        if payload.get('stream'):
            self.send_header('Content-Type','text/event-stream');self.end_headers()
            self.wfile.write(b'data: {"id":"mock-stream","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"mock-ok"},"finish_reason":null}]}\n\n')
            self.wfile.write(b'data: {"id":"mock-stream","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}}\n\ndata: [DONE]\n\n')
        else:
            self.send_header('Content-Type','application/json');self.end_headers()
            self.wfile.write(json.dumps({'id':'mock-chat','object':'chat.completion','model':'gpt-4o-mini','choices':[{'index':0,'message':{'role':'assistant','content':'mock-ok'},'finish_reason':'stop'}],'usage':{'prompt_tokens':4,'completion_tokens':3,'total_tokens':7}}).encode())

def request(path, payload=None, token=None, method=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['Authorization'] = 'Bearer '+token
    req = urllib.request.Request('http://127.0.0.1:18327'+path, data=None if payload is None else json.dumps(payload).encode(), headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=30)

def api(path, payload=None, token=None, method=None):
    with request(path,payload,token,method) as r: data=json.load(r)
    assert data['success'], (path,data.get('message'))
    return data.get('data')

with tempfile.TemporaryDirectory(prefix='win-ai-mock-') as folder:
    env = {**os.environ,'PORT':'18327','SQLITE_PATH':folder+'/gateway.db','SESSION_COOKIE_SECURE':'false','SESSION_COOKIE_TRUSTED_URL':'','SESSION_SECRET':secrets.token_hex(32),'CRYPTO_SECRET':secrets.token_hex(32),'GIN_MODE':'release'}
    upstream = http.server.ThreadingHTTPServer(('127.0.0.1',18427),Upstream)
    threading.Thread(target=upstream.serve_forever,daemon=True).start()
    with open(folder+'/service.log','w') as log:
        process = subprocess.Popen(['/opt/win-ai/bin/new-api-v1.0.0-rc.45','--log-dir',folder+'/logs'],cwd=folder,env=env,stdout=log,stderr=log)
        try:
            for _ in range(90):
                try: api('/api/setup');break
                except (OSError,urllib.error.URLError): time.sleep(.2)
            secret = secrets.token_urlsafe(24)
            api('/api/setup',{'username':'MockAdmin','password':secret,'confirmPassword':secret})
            login = api('/api/user/login',{'username':'MockAdmin','password':secret})
            admin = login['access_token']
            api('/api/channel/',{'mode':'single','channel':{'type':1,'key':'mock-upstream-secret','status':1,'name':'Isolated mock upstream','base_url':'http://127.0.0.1:18427','models':'gpt-4o-mini','group':'default'}},admin)
            api('/api/token/',{'name':'isolated-test','expired_time':-1,'unlimited_quota':True,'model_limits_enabled':True,'model_limits':'gpt-4o-mini','group':'default'},admin)
            with sqlite3.connect(folder+'/gateway.db') as db:
                downstream = 'sk-'+db.execute('select key from tokens where name=?',('isolated-test',)).fetchone()[0]
            with request('/v1/models',token=downstream) as r:
                models=json.load(r);assert any(m['id']=='gpt-4o-mini' for m in models['data'])
            body={'model':'gpt-4o-mini','messages':[{'role':'user','content':'test'}]}
            with request('/v1/chat/completions',body,downstream) as r:
                result=json.load(r)
                assert result['choices'][0]['message']['content']=='mock-ok'
            with request('/v1/chat/completions',{**body,'stream':True},downstream) as r:
                result=r.read().decode();assert 'mock-ok' in result and '[DONE]' in result
            try: request('/v1/chat/completions',body,'sk-invalid')
            except urllib.error.HTTPError as e: assert e.code==401
            else: raise AssertionError('Invalid token accepted')
            assert len(calls)==2, len(calls)
            print('PASS: isolated upstream configuration, model listing, independent API key, non-stream + SSE relay, upstream credential substitution and invalid-token rejection; 0 real API calls')
        finally:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill();process.wait()
            upstream.shutdown()
