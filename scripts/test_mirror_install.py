import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest

from mirror_install import cleanup_interrupted_uploads, cleanup_stale_stages, install, installer_name


class MirrorInstallTest(unittest.TestCase):
    def test_install_prunes_only_canonical_history_and_blocks_default_reinstall(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'mirror'
            root.mkdir()
            stage=Path(directory)/'stage'
            stage.mkdir()
            for version in ['2.8.97','2.8.98','2.8.99','2.8.100','2.8.101']:
                (root/installer_name(version)).write_bytes(b'old')
            unrelated=root/'operator-note.txt'
            unrelated.write_text('keep')
            version='2.8.102'
            name=installer_name(version)
            binary=b'MZ'+b'fixture'*100
            (stage/name).write_bytes(binary)
            digest=hashlib.sha256(binary).hexdigest()
            (stage/'latest.json').write_text(json.dumps({
                'version':version,'sha256':digest,'size':len(binary),
                'installerUrl':f'https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v{version}/{name}',
            }))
            self.assertEqual(install(root,stage,version,digest,len(binary)),(1,3))
            self.assertFalse((root/installer_name('2.8.97')).exists())
            self.assertEqual(unrelated.read_text(),'keep')
            self.assertEqual((root/name).read_bytes(),binary)
            with self.assertRaises(ValueError):
                install(root,stage,version,digest,len(binary))
            self.assertEqual(install(root,stage,version,digest,len(binary),resume=True),(0,0))

    def test_prunes_expired_stages_but_keeps_active_or_unknown_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            stale=root/('xingzhou-update-stage-v2.8.22-'+'a'*32)
            active=root/('xingzhou-update-stage-v2.8.23-'+'b'*32)
            unknown=root/'operator-backup'
            for child in [stale,active,unknown]:
                child.mkdir()
                (child/'install.sh').write_text('fixture')
            os.utime(stale/'install.sh',(100,100))
            os.utime(stale,(100,100))
            cleanup_stale_stages(root)
            self.assertFalse(stale.exists())
            self.assertTrue(active.exists() and unknown.exists())

    def test_interrupted_internal_copies_are_cleaned_without_touching_live_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            names=('latest.json.upload-a1234567','Xingzhou-Film-Tencent-Setup-2.8.97.exe','operator.upload')
            for name in names:
                (root/name).write_bytes(b'fixture')
                os.utime(root/name,(100,100))
            cleanup_interrupted_uploads(root)
            self.assertEqual({entry.name for entry in root.iterdir()},set(names[1:]))
