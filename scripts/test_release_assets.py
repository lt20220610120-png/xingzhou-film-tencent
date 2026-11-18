import http.client
import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock
from release_assets import ensure_release_asset


class InstallerPublicationTests(unittest.TestCase):
    asset = dict(name='app.exe', size=4, state='uploaded', digest='sha256:test',
                 browser_download_url='https://example.invalid/app.exe')

    def run_upload(self, req):
        with tempfile.TemporaryDirectory() as temp:
            installer = pathlib.Path(temp) / 'app.exe'
            installer.write_bytes(b'test')
            ensure_release_asset(req, 'owner/repo', 1, installer, 'app.exe', 4, 'test')

    def test_same_size_different_digest_blocks_publication(self):
        req = Mock(return_value=(200, json.dumps([{**self.asset, 'digest': 'sha256:other'}])))
        with self.assertRaisesRegex(RuntimeError, 'digest'):
            self.run_upload(req)
        self.assertEqual(req.call_count, 1)

    def test_lost_upload_receipt_reuses_verified_asset_and_preserves_other_files(self):
        req = Mock(side_effect=[(200, json.dumps([{'name': 'notes.pdf'}])),
                                ConnectionResetError(), (200, json.dumps([self.asset]))])
        self.run_upload(req)
        self.assertEqual([c.args[1] if len(c.args) > 1 else 'GET' for c in req.call_args_list],
                         ['GET', 'POST', 'GET'])

    def test_incomplete_upload_is_preserved_for_reconciliation(self):
        req = Mock(return_value=(200, json.dumps([{'name': 'notes.pdf', 'id': 7},
                                                  {'name': 'app.exe', 'id': 9, 'state': 'starter'}])))
        with self.assertRaisesRegex(RuntimeError, 'incomplete upload'):
            self.run_upload(req)
        self.assertEqual(req.call_count, 1)

    def test_partial_http_body_and_invalid_json_are_reconciled_before_retry(self):
        for response in [http.client.IncompleteRead(b'partial', 12), (201, b'{"id":')]:
            with self.subTest(response=response):
                req = Mock(side_effect=[(200, b'[]'), response, (200, json.dumps([self.asset]))])
                self.run_upload(req)
                self.assertEqual([c.args[1] if len(c.args) > 1 else 'GET' for c in req.call_args_list],
                                 ['GET', 'POST', 'GET'])


if __name__ == '__main__':
    unittest.main()
