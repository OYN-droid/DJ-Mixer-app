import http.client
import json
import threading
import unittest
from unittest import mock

import stem_server


class FakeAnthropicResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class SimilarTracksEndpointTest(unittest.TestCase):
    def setUp(self):
        self.original_key = stem_server.ANTHROPIC_API_KEY
        self.original_model = stem_server.ANTHROPIC_MODEL
        self.server = stem_server.ThreadingHTTPServer(("127.0.0.1", 0), stem_server.DeckForgeHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        stem_server.ANTHROPIC_API_KEY = self.original_key
        stem_server.ANTHROPIC_MODEL = self.original_model
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def post(self, payload):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        body = json.dumps(payload)
        connection.request("POST", "/api/similar-tracks", body, {"Content-Type": "application/json"})
        response = connection.getresponse()
        result = response.status, json.loads(response.read().decode("utf-8"))
        connection.close()
        return result

    def test_missing_api_key_returns_clear_503(self):
        stem_server.ANTHROPIC_API_KEY = None
        status, payload = self.post({"title": "Test Track", "artist": "Test Artist"})
        self.assertEqual(status, 503)
        self.assertIn("ANTHROPIC_API_KEY is not configured", payload["error"])

    def test_configured_key_returns_five_cleaned_suggestions(self):
        stem_server.ANTHROPIC_API_KEY = "test-key"
        stem_server.ANTHROPIC_MODEL = "test-model"
        suggestions = [
            {"title": f"Track {index}", "artist": f"Artist {index}", "reason": "Compatible tempo and energy."}
            for index in range(6)
        ]
        upstream = FakeAnthropicResponse({"content": [{"type": "text", "text": json.dumps(suggestions)}]})
        with mock.patch.object(stem_server.urllib.request, "urlopen", return_value=upstream) as urlopen:
            status, payload = self.post({"title": "Source Track", "artist": "Source Artist", "bpm": 124, "key": "8A"})

        self.assertEqual(status, 200)
        self.assertEqual(len(payload["suggestions"]), 5)
        self.assertEqual(payload["track"]["title"], "Source Track")
        request = urlopen.call_args.args[0]
        sent = json.loads(request.data.decode("utf-8"))
        self.assertEqual(sent["model"], "test-model")
        self.assertEqual(sent["max_tokens"], 4096)
        self.assertEqual(sent["tools"], [{"type": "web_search_20250305", "name": "web_search"}])
        self.assertIn("Do not include citation tags, footnote markers", sent["messages"][0]["content"])
        self.assertEqual(request.get_header("X-api-key"), "test-key")


if __name__ == "__main__":
    unittest.main()
