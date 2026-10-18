"""Payment regression in an isolated network/temporary DB. No real money."""
import hashlib
import json
import os
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'http://127.0.0.1:18328'
token = None


def request(path, data=None, method=None, form=False, base=BASE):
    headers = {'Content-Type': 'application/x-www-form-urlencoded' if form else 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = None if data is None else (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
    with urllib.request.urlopen(urllib.request.Request(base+path, data=body, headers=headers, method=method), timeout=20) as response:
        return response.read()


def api(path, data=None, method=None):
    result = json.loads(request(path, data, method))
    assert result.get('success'), 'Fixture API failed: '+path
    return result.get('data')


def signed(params, secret):
    text = '&'.join(k+'='+str(v) for k, v in sorted(params.items()) if k not in ('sign', 'sign_type') and str(v))
    return {**params, 'sign': hashlib.md5((text+secret).encode()).hexdigest(), 'sign_type': 'MD5'}


with tempfile.TemporaryDirectory(prefix='win-ai-payment-') as folder:
    env = {**os.environ, 'PORT': '18328', 'SQLITE_PATH': folder+'/gateway.db', 'SESSION_COOKIE_SECURE': 'false', 'SESSION_COOKIE_TRUSTED_URL': '', 'SESSION_SECRET': secrets.token_hex(32), 'CRYPTO_SECRET': secrets.token_hex(32), 'GIN_MODE': 'release'}
    with open(folder+'/service.log', 'w') as log:
        process = subprocess.Popen(['/opt/win-ai/bin/new-api-v1.0.0-rc.45', '--log-dir', folder+'/logs'], cwd=folder, env=env, stdout=log, stderr=log)
        bridge = None
        try:
            for _ in range(90):
                try:
                    api('/api/setup')
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(.2)
            password = secrets.token_urlsafe(24)
            api('/api/setup', {'username': 'PayFixture', 'password': password, 'confirmPassword': password})
            token = api('/api/user/login', {'username': 'PayFixture', 'password': password})['access_token']
            initial = api('/api/user/self')['quota']
            assert not api('/api/user/topup/info')['payment_compliance_confirmed']
            # This synthetic fixture confirms only its isolated test deployment.
            api('/api/option/payment_compliance', {'confirmed': True})
            secret = 'isolated-fictional-merchant-key'
            for key, value in {'PayAddress': 'http://127.0.0.1:18428', 'EpayId': '10001', 'EpayKey': secret, 'Price': '1', 'MinTopUp': '1', 'PayMethods': json.dumps([{'name': '微信支付', 'type': 'wxpay', 'color': '#16a34a'}, {'name': '支付宝', 'type': 'alipay', 'color': '#1677ff'}])}.items():
                api('/api/option/', {'key': key, 'value': value}, 'PUT')
            info = api('/api/user/topup/info')
            assert info['enable_online_topup'] and len(info['pay_methods']) == 2
            order = json.loads(request('/api/user/pay', {'amount': 10, 'payment_method': 'alipay'}))
            assert order['message'] == 'success', 'Fixture order creation failed'
            params = order['data']
            assert params['notify_url'].endswith('/api/user/epay/notify')
            trade = params['out_trade_no']
            assert api('/api/user/self')['quota'] == initial
            notify = {'pid': '10001', 'trade_no': 'fixture-provider-trade', 'out_trade_no': trade, 'type': 'alipay', 'name': params['name'], 'money': params['money'], 'trade_status': 'TRADE_SUCCESS'}
            bridge_source = """
const base='/opt/xingzhou-cloud-backend/src/';
const {createWinAIIdentity,createWinAIHttpHandler}=require(base+'win-ai-identity.cjs');
const {createWinAILookup}=require(base+'win-ai-lookup.cjs');
const {forwardNativePayment}=require(base+'win-ai-payment.cjs');
const service=createWinAIIdentity({repository:{},clientSecret:'isolated-fictional-oauth-secret',lookup:createWinAILookup()});
require('http').createServer(createWinAIHttpHandler(service,{forwardPayment:(p,ip)=>forwardNativePayment(p,ip,18328)})).listen(18329,'127.0.0.1');
"""
            bridge = subprocess.Popen(['node', '-e', bridge_source], env={**env, 'WIN_AI_SQLITE_PATH': folder+'/gateway.db'}, stdout=log, stderr=log)
            time.sleep(.5)
            callback = '/api/win-ai/epay-notify'
            bridge_url = 'http://127.0.0.1:18329'
            assert request(callback, {**notify, 'sign': 'forged', 'sign_type': 'MD5'}, form=True, base=bridge_url) == b'fail'
            assert api('/api/user/self')['quota'] == initial
            assert request(callback, signed({**notify, 'money': '0.01'}, secret), form=True, base=bridge_url) == b'fail'
            assert api('/api/user/self')['quota'] == initial
            valid = signed(notify, secret)
            assert request(callback, valid, form=True, base=bridge_url) == b'success'
            after = api('/api/user/self')['quota']
            assert after > initial
            assert request(callback, valid, form=True, base=bridge_url) == b'success'
            assert api('/api/user/self')['quota'] == after
            rows = api('/api/user/topup/self')['items']
            assert any(row['trade_no'] == trade and row['status'] == 'success' for row in rows)
            print('PASS: isolated wallet payment methods, pending order, invalid signature + valid-signature wrong amount rejected, signed successful callback, exactly-once credit and order history; real payments 0')
        finally:
            if bridge:
                bridge.terminate()
                bridge.wait(timeout=10)
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
