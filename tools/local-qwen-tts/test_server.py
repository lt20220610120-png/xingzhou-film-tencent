import unittest
from server import SpeechRequest, validate_request

class RequestTests(unittest.TestCase):
    def test_voice_description_and_language_are_preserved(self):
        request = SpeechRequest(model='Qwen3-TTS-12Hz-1.7B-VoiceDesign', input='你好。', instructions='低沉自然的男声', language='Chinese')
        self.assertEqual(validate_request(request), ('你好。', '低沉自然的男声', 'Chinese'))

    def test_invalid_model_format_speed_and_empty_text_are_rejected(self):
        from fastapi import HTTPException
        for changes in [dict(model='other'), dict(response_format='mp3'), dict(speed=2), dict(input='  '), dict(language='invalid')]:
            with self.subTest(changes=changes):
                values = dict(model='Qwen3-TTS-12Hz-1.7B-VoiceDesign', input='测试')
                values.update(changes)
                with self.assertRaises(HTTPException):
                    validate_request(SpeechRequest(**values))

if __name__ == '__main__':
    unittest.main()
