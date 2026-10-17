"""Run as root on the existing host; never prints or copies cloud credentials."""
import datetime
import hashlib
import hmac
import json
import pathlib
import time
import urllib.request

def dnspod(action, params):
    cfg = {}
    for line in pathlib.Path('/opt/xingzhou-cloud-backend/.env').read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            cfg[k.strip()] = v.strip().strip('"').strip("'")
    host = 'dnspod.tencentcloudapi.com'
    ts = int(time.time())
    date = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime('%Y-%m-%d')
    body = json.dumps(params, separators=(',', ':')).encode()
    scope = date + '/dnspod/tc3_request'
    canonical = 'POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:' + host + '\n\ncontent-type;host\n' + hashlib.sha256(body).hexdigest()
    sign = 'TC3-HMAC-SHA256\n' + str(ts) + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
    def mac(k, s):
        return hmac.new(k, s.encode(), hashlib.sha256).digest()
    key = mac(mac(mac(('TC3' + cfg['COS_SECRET_KEY']).encode(), date), 'dnspod'), 'tc3_request')
    signature = hmac.new(key, sign.encode(), hashlib.sha256).hexdigest()
    headers = {'Authorization': 'TC3-HMAC-SHA256 Credential=' + cfg['COS_SECRET_ID'] + '/' + scope + ', SignedHeaders=content-type;host, Signature=' + signature,
               'Content-Type':'application/json; charset=utf-8', 'X-TC-Action':action,
               'X-TC-Version':'2021-03-23', 'X-TC-Timestamp':str(ts)}
    r = json.load(urllib.request.urlopen(urllib.request.Request('https://' + host, data=body, headers=headers), timeout=30))['Response']
    if 'Error' in r:
        raise RuntimeError(r['Error']['Code'])
    return r

if __name__ == '__main__':
    records = dnspod('DescribeRecordList', {'Domain':'xingzhoufilm.cn','SubDomain':'winai','ErrorOnEmpty':'no'}).get('RecordList', [])
    if records:
        assert all(r['Type'] == 'A' and r['Value'] == '106.55.41.128' and r['Status'] == 'ENABLE' for r in records), 'Conflicting existing DNS; refuse to overwrite'
        print('DNS already correct')
    else:
        r = dnspod('CreateRecord', {'Domain':'xingzhoufilm.cn','SubDomain':'winai','RecordType':'A','RecordLine':'默认','RecordLineId':'0','Value':'106.55.41.128','TTL':600,'Remark':'Win AI gateway'})
        print('DNS created, record id', r['RecordId'])
