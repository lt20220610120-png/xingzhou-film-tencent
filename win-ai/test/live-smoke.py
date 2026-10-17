"""Read-only acceptance test, executed on the gateway host."""
import json
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:8317'

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=15) as r:
        return json.load(r)

status = get('/api/status')
assert status['success']
d = status['data']
assert d['system_name'] == 'Win AI', d.get('system_name')
assert d['server_address'] == 'https://winai.xingzhoufilm.cn'
assert d['docs_link'] == 'https://winai.xingzhoufilm.cn/docs'
assert not d['register_enabled'] and not d['password_register_enabled']
assert d['setup']
assert 'QuantumNous/new-api' in d['footer_html']
assert 'maxforai' not in json.dumps(d).lower()
req = urllib.request.Request(BASE + '/api/user/register', data=b'{}', headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req, timeout=15) as r:
    assert not json.load(r)['success'], 'Registration unexpectedly allowed'
for path in ['/v1/models', '/api/channel/', '/api/token/', '/api/option/']:
    try:
        with urllib.request.urlopen(BASE + path, timeout=15) as r:
            result = json.load(r)
            assert result.get('success') is False or 'error' in result, path
    except urllib.error.HTTPError as e:
        assert e.code in (401,403), (path,e.code)
print('PASS: brand, origin, docs, setup, closed registration and 4 authorization boundaries')
