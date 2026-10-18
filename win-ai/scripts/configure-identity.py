"""Configure the native OAuth and payment UI without fabricating merchant data."""
import json
import pathlib
import urllib.request

BASE = 'http://127.0.0.1:8317'
headers = {'Content-Type': 'application/json', 'Origin': 'https://winai.xingzhoufilm.cn'}


def api(path, data=None, method=None):
    req = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    assert result.get('success'), 'Native API configuration rejected: ' + path
    return result.get('data')


login = api('/api/user/login', json.loads(pathlib.Path('/etc/win-ai/admin.json').read_text()))
headers['Authorization'] = 'Bearer ' + login['access_token']
secret = pathlib.Path('/etc/win-ai/identity.env').read_text().strip().split('=', 1)[1]
provider = {
    'name': '行舟影视', 'slug': 'xingzhou', 'enabled': True,
    'client_id': 'xingzhou-win-ai', 'client_secret': secret,
    'authorization_endpoint': 'https://winai.xingzhoufilm.cn/api/win-ai/authorize',
    'token_endpoint': 'http://127.0.0.1:4310/api/win-ai/token',
    'user_info_endpoint': 'http://127.0.0.1:4310/api/win-ai/userinfo',
    'scopes': 'profile', 'user_id_field': 'sub',
    'username_field': 'preferred_username', 'display_name_field': 'name',
    'email_field': 'email', 'auth_style': 1,
}
existing = next((p for p in api('/api/custom-oauth-provider/') if p['slug'] == 'xingzhou'), None)
api('/api/custom-oauth-provider/' + (str(existing['id']) if existing else ''), provider, 'PUT' if existing else 'POST')
sidebar = {
    'chat': {'enabled': True, 'playground': True, 'chat': False},
    'console': {'enabled': True, 'detail': True, 'token': True, 'log': True, 'midjourney': False, 'task': True},
    'personal': {'enabled': True, 'topup': True, 'personal': True},
    'admin': {'enabled': True, 'channel': True, 'models': True, 'deployment': False, 'redemption': True, 'user': True, 'subscription': True, 'setting': True},
}
options = {
    'general_setting.quota_display_type': 'CNY', 'USDExchangeRate': '1',
    'Price': '1', 'MinTopUp': '10',
    'payment_setting.amount_options': '[10,20,50,100,200,500]',
    'payment_setting.amount_discount': '{}',
    'PayMethods': json.dumps([{'name': '支付宝', 'type': 'alipay', 'color': '#1677ff'}, {'name': '微信', 'type': 'wxpay', 'color': '#16a34a'}], ensure_ascii=False),
    'RegisterEnabled': 'true', 'PasswordRegisterEnabled': 'false', 'QuotaForNewUser': '0',
    'QuotaForInviter': '0', 'QuotaForInvitee': '0',
    'SidebarModulesAdmin': json.dumps(sidebar),
    'HeaderNavModules': json.dumps({'home': True, 'console': True, 'pricing': True, 'rankings': False, 'docs': True, 'about': True}),
    'About': 'Win AI 是行舟影视的模型 API 服务。使用行舟账号进入；令牌、用量、余额与充值订单在本控制台统一管理。',
    'console_setting.announcements': json.dumps([{'id': 2, 'content': '使用行舟影视账号进入 Win AI，无需再次注册。充值将使用站长配置的支付方式；未配置收款渠道时无法付款。', 'publishDate': '2026-10-18T00:00:00+08:00', 'type': 'default', 'extra': ''}], ensure_ascii=False),
}
marker = pathlib.Path('/etc/win-ai/identity-configured-v2')
if marker.exists():
    for key in ['general_setting.quota_display_type', 'USDExchangeRate', 'Price', 'MinTopUp', 'payment_setting.amount_options', 'payment_setting.amount_discount', 'PayMethods']:
        options.pop(key, None)
for key, value in options.items():
    api('/api/option/', {'key': key, 'value': value}, 'PUT')
if not marker.exists():
    marker.write_text('Win AI 0.2 initial wallet defaults applied; preserve operator pricing on reruns.\n')
    marker.chmod(0o600)
print('PASS: native Xingzhou OAuth, zero-quota account provisioning, wallet and payment settings available; merchant credentials and owner attestation left untouched')
