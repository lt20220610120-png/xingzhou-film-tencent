import base64,json,subprocess,urllib.request,urllib.error,os

def req(url,method='GET',data=None,extra_headers=None):
    cred=subprocess.check_output(['git','credential','fill'],input=b'protocol=https\nhost=github.com\n\n').decode()
    token=next(x.split('=')[1] for x in cred.split('\n') if x.startswith('password='))
    headers={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json'}
    if data and method=='POST':
        headers['Content-Type']='application/octet-stream'
    if extra_headers:
        headers.update(extra_headers)
    r=urllib.request.Request(url,data=data,headers=headers,method=method)
    resp=urllib.request.urlopen(r)
    return resp.status, resp.read()

version='0.9.8'
version_tag=f'v{version}'
repo='lt20220610120-png/xingzhou-film-updates'

# Create release
rel={'tag_name':version_tag,'target_commitish':'main','name':f'行舟影视 {version}','body':'修复删除按钮、输入区比例、附件多集选择、API持久化、导演快速模式、提示词卡片优化和Skill默认选择。','draft':False,'prerelease':False}
print(f"Creating release {version_tag}...")
st,b=req(f'https://api.github.com/repos/{repo}/releases','POST',json.dumps(rel).encode())
assert st in(200,201), f"Release create failed: {st} {b[:300]}"
r=json.loads(b); rid=r['id']
print(f"Release created, id={rid}")

# Upload asset
src=f'C:/Users/11599/AppData/Local/Temp/xingzhou-release-v098/行舟影视-安装程序-{version}.exe'
asset_name=f'Xingzhou-Film-Setup-{version}.exe'
print(f"Uploading {os.path.getsize(src)} bytes...")
with open(src,'rb') as f:
    st,b=req(f'https://uploads.github.com/repos/{repo}/releases/{rid}/assets?name={asset_name}','POST',f.read())
assert st==201, f"Upload failed: {st} {b[:300]}"
upload=json.loads(b)
print(f"Uploaded: {upload.get('browser_download_url','?')}")

result={'release':f'https://github.com/{repo}/releases/tag/{version_tag}','asset':f'D:/行舟影视/release/{asset_name}','size':os.path.getsize(src)}
print(json.dumps(result,ensure_ascii=False))
