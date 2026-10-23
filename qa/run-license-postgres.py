"""Upload source to an isolated QA directory, test only a throwaway PG schema."""
from pathlib import Path
import tarfile,subprocess
root=Path(__file__).resolve().parents[1]
archive=root/'output/license-qa.tar.gz'
with tarfile.open(archive,'w:gz') as bundle:
    for item in ['cloud-backend/src','cloud-backend/shared','cloud-backend/migrations','cloud-backend/schema.sql','qa/software-license-postgres.cjs']:
        bundle.add(root/item,arcname=item)
opts=['-i',str(Path.home()/'.ssh/xingzhou_tencent_test'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(Path.home()/'.ssh/known_hosts_xingzhou')]
host='ubuntu@106.55.41.128'
remote='/home/ubuntu/xingzhou-license-qa'
subprocess.run(['ssh',*opts,host,'mkdir -p '+remote],check=True)
subprocess.run(['scp',*opts,str(archive),host+':'+remote+'/qa.tar.gz'],check=True)
subprocess.run(['ssh',*opts,host,'sudo mkdir -p /opt/xingzhou-license-qa && sudo tar -xzf '+remote+'/qa.tar.gz -C /opt/xingzhou-license-qa && sudo ln -sfn /opt/xingzhou-cloud-backend/node_modules /opt/xingzhou-license-qa/cloud-backend/node_modules && sudo -u postgres env NODE_PATH=/opt/xingzhou-cloud-backend/node_modules node /opt/xingzhou-license-qa/qa/software-license-postgres.cjs'],check=True)
