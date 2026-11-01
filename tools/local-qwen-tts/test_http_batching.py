"""Exercise the actual FastAPI route with a CPU substitute for the GPU boundary."""
import concurrent.futures
import unittest
from fastapi.testclient import TestClient
from batch_scheduler import BatchScheduler
import server


class HttpBatchingTests(unittest.TestCase):
    def test_independent_http_requests_keep_text_voice_language_and_output_mapping(self):
        calls = []
        def generate(items):
            calls.append(items)
            return ['|'.join(item).encode() for item in items]
        original_model, original_scheduler = server.model, server.scheduler
        server.model = object()
        server.scheduler = BatchScheduler(generate, max_batch_size=3, batch_window_seconds=.1)
        try:
            client = TestClient(server.app)
            def request(index):
                response = client.post('/v1/audio/speech', json=dict(input=f'text{index}', instructions=f'voice{index}', language='English'))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers['content-type'], 'audio/wav')
                self.assertEqual(response.content, f'text{index}|voice{index}|English'.encode())
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                list(executor.map(request, range(3)))
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(calls[0]), 3)
        finally:
            server.scheduler.close()
            server.model, server.scheduler = original_model, original_scheduler


if __name__ == '__main__':
    unittest.main()
