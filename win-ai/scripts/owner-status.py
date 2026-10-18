"""Owner-only read-only summary through the existing SSH authorization."""
import json
import pathlib
import subprocess

SSH = ['ssh', '-i', str(pathlib.Path.home()/'.ssh/xingzhou_tencent_test'),
       '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
       '-o', 'UserKnownHostsFile='+str(pathlib.Path.home()/'.ssh/known_hosts_xingzhou'),
       'ubuntu@106.55.41.128', 'sudo python3 -']
QUERY = r'''
import datetime,json,sqlite3
db=sqlite3.connect('file:/var/lib/win-ai/gateway.db?mode=ro',uri=True)
db.execute('pragma query_only=on')
statuses=dict(db.execute('select status,count(*) from tasks group by status').fetchall())
result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'running':statuses.get('IN_PROGRESS',0),
 'waiting':sum(statuses.get(k,0) for k in ['NOT_START','SUBMITTED','QUEUED']),
 'statusCounts':statuses,
 'gatewayUsers':db.execute('select count(*) from users where deleted_at is null and role=1').fetchone()[0],
 'enabledChannels':db.execute('select count(*) from channels where status=1').fetchone()[0]}
print(json.dumps(result))
'''

def main():
    result = subprocess.run(SSH, input=QUERY, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise SystemExit('读取失败，请检查本机 SSH 授权；未改动服务器数据。')
    data = json.loads(result.stdout)
    print('Win AI 运行状态（只读）\n')
    print('时间：'+data['observedAt'])
    print('进行中任务：'+str(data['running']))
    print('等待中任务：'+str(data['waiting']))
    print('普通账本用户：'+str(data['gatewayUsers']))
    print('启用渠道：'+str(data['enabledChannels']))
    print('各状态任务数：'+json.dumps(data['statusCounts'],ensure_ascii=False))
    print('\n仅统计网关记录的异步任务，不含同步请求或行舟本地任务。')

if __name__ == '__main__':
    main()
