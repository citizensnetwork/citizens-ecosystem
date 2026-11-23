import unittest
from unittest.mock import patch

import qa


class RunnerTests(unittest.TestCase):
    def test_cross_origin_redirect_never_followed(self):
        with patch.object(qa, "read_public", side_effect=[
            (308, "text/html", "https://elsewhere.example/citizens/connect", b""),
            (200, "text/css", None, b"body{color:black}"),
        ]) as get:
            checks = list(qa.http_checks(qa.PRODUCTION))
        self.assertEqual([passed for _, passed in checks], [False, False, True])
        self.assertEqual([call.args[1] for call in get.call_args_list], [qa.BASE + "/", qa.ASSET])

    def test_staging_denies_production_with_alternate_spellings(self):
        for origin in (
            "https://WWW.219.CO.ZA.", "https://219.co.za:443", "https://citizenscentral.co.za",
            "https://citizens-ecosystem-connect.vercel.app", "https://citizens-connect.vercel.app",
        ):
            self.assertTrue(qa.staging_gate(origin).startswith("Production"))
        self.assertTrue(qa.staging_gate("https://qa.example.test").startswith("No staging"))
        self.assertTrue(qa.staging_gate("https://qa.example.test/?preview=true").startswith("Staging origin"))

    def test_request_allowlist_is_checked_before_network_setup(self):
        with patch.object(qa, "build_opener") as opener:
            for origin, path in [
                (qa.PRODUCTION, qa.BASE + "/api/auth"),
                ("https://example.test", qa.BASE),
                (qa.PRODUCTION, "//example.test"),
            ]:
                with self.assertRaises(ValueError):
                    qa.read_public(origin, path)
        opener.assert_not_called()


if __name__ == "__main__":
    unittest.main()
