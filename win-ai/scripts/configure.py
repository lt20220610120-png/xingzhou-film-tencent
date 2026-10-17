"""Idempotent first boot and brand configuration through official authenticated APIs."""
import http.cookiejar
import json
import os
import pathlib
import secrets
import urllib.request

BASE = 'http://127.0.0.1:8317'
ORIGIN = 'https://winai.xingzhoufilm.cn'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
token = None

def api(path, payload=None, method=None):
    headers = {'Content-Type':'application/json','Origin':ORIGIN,'Host':'winai.xingzhoufilm.cn'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=None if payload is None else json.dumps(payload).encode(), headers=headers, method=method)
    with opener.open(req, timeout=30) as r:
        data = json.load(r)
    if not data.get('success'):
        raise RuntimeError('API rejected ' + path + ': ' + str(data.get('message')))
    return data.get('data')

credential_file = pathlib.Path('/etc/win-ai/admin.json')
setup = api('/api/setup')
if not setup['status']:
    if setup.get('root_init'):
        assert credential_file.exists(), 'Existing root without retained credentials; refuse credential reset'
        retained = json.loads(credential_file.read_text())
        recovered = api('/api/user/login', retained)
        assert recovered['user']['role'] == 100, 'Retained credentials must identify the root owner'
    if not credential_file.exists():
        fd = os.open(credential_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            json.dump({'username':'WinAIAdmin','password':secrets.token_urlsafe(24)}, f)
    creds = json.loads(credential_file.read_text())
    api('/api/setup', {'username':creds['username'],'password':creds['password'],'confirmPassword':creds['password'],'SelfUseModeEnabled':False,'DemoSiteEnabled':False})
else:
    assert credential_file.exists(), 'Initialized instance missing root-only login credentials; do not reset'
creds = json.loads(credential_file.read_text())
login = api('/api/user/login', creds)
token = login['access_token']

sidebar = {
    'chat':{'enabled':True,'playground':True,'chat':False},
    'console':{'enabled':True,'detail':True,'token':True,'log':True,'midjourney':False,'task':True},
    'personal':{'enabled':True,'topup':False,'personal':True},
    'admin':{'enabled':True,'channel':True,'models':True,'deployment':False,'redemption':False,'user':True,'subscription':False,'setting':True},
}
options = {
    'SystemName':'Win AI', 'Logo':ORIGIN+'/brand.svg', 'ServerAddress':ORIGIN,
    'general_setting.docs_link':ORIGIN+'/docs',
    'Footer':'<span>Win AI · 行舟影视</span><br><span>Frontend design and development by New API contributors. <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener">New API · QuantumNous</a> · <a href="/source/new-api-v1.0.0-rc.45.zip">源码</a> · <a href="/source/LICENSE">AGPL-3.0</a></span>',
    'About':'Win AI 是行舟影视的统一模型接入服务，基于 New API（QuantumNous）构建。首版完成站点与管理功能，上游由管理员配置后开放；在线支付尚未开放。',
    'HomePageContent':ORIGIN+'/welcome',
    'RegisterEnabled':'false','PasswordRegisterEnabled':'false',
    'QuotaForNewUser':'0','QuotaForInviter':'0','QuotaForInvitee':'0',
    'HeaderNavModules':json.dumps({'home':True,'console':True,'pricing':False,'rankings':False,'docs':True,'about':True}),
    'SidebarModulesAdmin':json.dumps(sidebar),
    'console_setting.api_info':json.dumps([{'url':ORIGIN+'/v1','route':'统一 API 地址','description':'在客户端填写此地址，并使用 Win AI 创建的 API 令牌。','color':'blue'}],ensure_ascii=False),
    'console_setting.uptime_kuma_enabled':'false',
    'console_setting.announcements':json.dumps([{'id':1,'content':'Win AI 首版已上线。上游渠道待配置；暂不开放充值与自助注册。请由管理员分配测试账号与令牌。','publishDate':'2026-10-18T00:00:00+08:00','type':'default','extra':''}],ensure_ascii=False),
    'console_setting.faq_enabled':'false',
}
for k,v in options.items():
    api('/api/option/', {'key':k,'value':v}, 'PUT')
print('Configured',len(options),'Win AI settings; credentials retained root-only')
