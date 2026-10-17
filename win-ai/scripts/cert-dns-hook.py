"""DNS-01 hooks retain cloud credentials only in the pre-existing server secret."""
import json
import os
import pathlib
import subprocess
import sys
import time
from importlib.machinery import SourceFileLoader

dns = SourceFileLoader('winai_dns', '/opt/win-ai/scripts/ensure-dns.py').load_module()
assert os.environ['CERTBOT_DOMAIN'] == 'winai.xingzhoufilm.cn'
validation = os.environ['CERTBOT_VALIDATION']
name = '_acme-challenge.winai'
if sys.argv[1] == 'auth':
    r = dns.dnspod('CreateRecord', {'Domain':'xingzhoufilm.cn','SubDomain':name,'RecordType':'TXT','RecordLine':'默认','RecordLineId':'0','Value':validation,'TTL':600,'Remark':'Win AI ACME validation'})
    state = pathlib.Path('/run/win-ai-acme-' + validation + '.json')
    state.write_text(json.dumps({'id':r['RecordId']}))
    # Allow authoritative DNS propagation; certbot validation uses external DNS.
    # New challenge names may have cached NXDOMAIN responses after first creation.
    time.sleep(180)
elif sys.argv[1] == 'cleanup':
    state = pathlib.Path('/run/win-ai-acme-' + validation + '.json')
    if state.exists():
        r = json.loads(state.read_text())
        dns.dnspod('DeleteRecord', {'Domain':'xingzhoufilm.cn','RecordId':r['id']})
        state.unlink()
else:
    raise ValueError('auth or cleanup required')
