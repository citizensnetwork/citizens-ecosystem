#!/usr/bin/env python3
"""Citizens Connect QA entry point. Dry runs are synthetic and use loopback only."""

import argparse
from contextlib import contextmanager
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
from threading import Thread
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4
from zoneinfo import ZoneInfo

from jsonschema import Draft202012Validator, FormatChecker, SchemaError


HERE = Path(__file__).resolve().parent
PRODUCTION = "https://219.co.za"
BASE = "/citizens/connect"
ASSET = BASE + "/vendor/maplibre-gl/maplibre-gl.css"
PUBLIC_PATHS = {BASE + "/", BASE, ASSET}
TIMEOUT = 10
RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def local_now():
    return datetime.now(ZoneInfo("Africa/Johannesburg"))


def delivery_fields(schema):
    return schema["properties"]["email_delivery"]["properties"]


def validator(path):
    public = read_json(HERE / "programme/templates/evidence.schema.json")
    schema = read_json(path) if path else public
    Draft202012Validator.check_schema(schema)
    if path:
        # The private handoff and repository projection differ only in the mailbox constants.
        for field in ("from", "to"):
            address = delivery_fields(schema)[field]["const"]
            if not isinstance(address, str) or not FormatChecker().conforms(address, "email"):
                raise ValueError("Invalid delivery constant in evidence schema")
            delivery_fields(public)[field]["const"] = address
        if schema != public:
            raise ValueError("Evidence schema differs from the handoff reporting contract")
    return Draft202012Validator(schema, format_checker=FormatChecker())


def write_evidence(destination, evidence, schema):
    schema.validate(evidence)
    temporary = destination.with_name(".evidence.tmp")
    temporary.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(destination)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_public(origin, path):
    """Only fixed public assets/routes, or the same paths on the owned loopback fixture."""
    local_fixture = re.fullmatch(r"http://127\.0\.0\.1:[0-9]+", origin)
    if path not in PUBLIC_PATHS or (origin != PRODUCTION and not local_fixture):
        raise ValueError("Request outside the read-only route allowlist")
    # No ambient proxies, cookie jar, credentials or automatic redirects.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(Request(origin + path, method="GET"), timeout=TIMEOUT)
    except HTTPError as error:
        response = error
    with response:
        content = response.read(32_768) if response.status == 200 else b""
        return response.status, response.headers.get_content_type(), response.headers.get("Location"), content


def http_checks(origin):
    status, content_type, location, body = read_public(origin, BASE + "/")
    yield ("canonical route or single same-origin slash redirect",
           status == 200 or (status in (301, 308) and location in (BASE, origin + BASE)))
    if status in (301, 308) and location in (BASE, origin + BASE):
        status, content_type, _, body = read_public(origin, BASE)
    yield ("Connect HTML response has the app root",
           status == 200 and content_type == "text/html" and b'id="root"' in body)
    status, content_type, _, body = read_public(origin, ASSET)
    yield ("Connect MapLibre stylesheet responds with CSS",
           status == 200 and content_type == "text/css" and bool(body.strip()))


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == BASE + "/":
            self.send_response(308)
            self.send_header("Location", BASE)
            self.end_headers()
            return
        fixtures = {
            BASE: ("text/html", b'<!doctype html><div id="root">Synthetic Connect shell</div>'),
            ASSET: ("text/css", b".synthetic-map { display: block; }"),
        }
        if self.path not in fixtures:
            self.send_error(404)
            return
        content_type, body = fixtures[self.path]
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body)


@contextmanager
def fixture_origin():
    with HTTPServer(("127.0.0.1", 0), FixtureHandler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


def staging_gate(raw_origin):
    """Phase 1 has no verified deployment/backend pair and no mutation launcher."""
    try:
        origin = urlsplit(raw_origin or "")
        if origin.scheme != "https" or not origin.hostname:
            return "A verified HTTPS staging origin is required."
        if origin.username or origin.password or origin.path not in ("", "/") or origin.query or origin.fragment:
            return "Staging origin must contain only the scheme and host."
        host = origin.hostname.rstrip(".").lower()
    except ValueError:
        return "Invalid staging origin."
    if (
        host in {"219.co.za", "citizenscentral.co.za", "citizens-ecosystem-connect.vercel.app", "citizens-connect.vercel.app"}
        or host.endswith((".219.co.za", ".citizenscentral.co.za"))
    ):
        return "Production domains and aliases are prohibited for mutation QA."
    return "No staging deployment and independent backend pair has been verified. No mutation tests were launched."


def checkout_sha():
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=HERE, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    revision = result.stdout.strip()
    return revision if result.returncode == 0 and re.fullmatch(r"[0-9a-f]{40}", revision) else None


def new_evidence(args, started_at, run_id, schema):
    scenarios = read_json(HERE / "scenarios.json")
    findings = read_json(HERE / "state/findings.json")["findings"]
    scopes = {
        "dry-run": [
            "Synthetic loopback HTTP fixture and staging gate checks. No deployed application or guest scenario selected.",
            "The source commit identifies the checkout base, with Phase 1 runner changes applied locally.",
        ],
        "public": [
            "Read-only HTTP transport checks for CC-01. Browser entry, refresh and guest scenarios require separate Phase 2 evidence.",
        ],
        "staging": ["Staging mutation prerequisite check only."],
    }
    return {
        "schema_version": "1.0.0",
        "run_id": run_id,
        "started_at": started_at.isoformat(timespec="seconds"),
        "target_url": PRODUCTION + BASE + "/",
        "repository": "citizensnetwork/citizens-ecosystem",
        "commit_sha": checkout_sha() if args.mode == "dry-run" else None,
        "deployment": None,
        "environment": {"dry-run": "local-synthetic", "public": "production-guest-http", "staging": "staging-preflight"}[args.mode],
        "previous_run_id": args.previous_run_id,
        "scope": scopes[args.mode],
        "tests": [
            {
                "scenario_id": scenario,
                "status": "not_run",
                "observed_at": None,
                "environment": None,
                "browser_or_device": None,
                "fixture_reference": None,
                "steps": [],
                "expected": expected,
                "actual": None,
                "evidence_reference": [],
            }
            for scenario, expected in scenarios.items()
        ],
        "framework_checks": [],
        "findings": findings,
        "android_decision": "Unverified",
        "storage": {"status": "local_only", "location": f"quality/connect/runs/{started_at.date()}/{run_id}/evidence.json"},
        "email_delivery": {
            "status": "pending",
            "from": delivery_fields(schema)["from"]["const"],
            "to": delivery_fields(schema)["to"]["const"],
            "provider_message_id": None,
        },
    }


def dry_checks():
    with fixture_origin() as origin:
        yield from http_checks(origin)
    yield ("production staging target is denied", staging_gate(PRODUCTION).startswith("Production"))
    yield ("unverified preview staging target is denied", staging_gate("https://qa.example.test").startswith("No staging"))
    yield ("missing staging target is denied", staging_gate(None).startswith("A verified"))


def run_checks(args, evidence, record):
    if args.mode == "staging":
        row = next(row for row in evidence["tests"] if row["scenario_id"] == "CC-07")
        row.update(
            status="blocked",
            environment="staging-preflight",
            observed_at=local_now().isoformat(timespec="seconds"),
            steps=["Check staging mutation prerequisite"],
            actual=staging_gate(os.environ.get("CONNECT_QA_STAGING_ORIGIN")),
            evidence_reference=["evidence.json"],
        )
        return 2

    checks = dry_checks() if args.mode == "dry-run" else http_checks(PRODUCTION)
    try:
        for name, passed in checks:
            record(name, "pass" if passed else "fail")
    except (URLError, OSError) as error:
        record("HTTP checks interrupted by transport or fixture setup", "blocked", type(error).__name__)

    if args.mode == "public":
        row = next(row for row in evidence["tests"] if row["scenario_id"] == "CC-01")
        row["actual"] = "Transport results are in framework_checks. A browser guest journey was not attempted."
        row["evidence_reference"] = ["evidence.json#framework_checks"]

    results = evidence["framework_checks"]
    if not results or any(check["status"] == "blocked" for check in results):
        return 2
    return int(any(check["status"] == "fail" for check in results))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schema", type=Path, help="Operator handoff schema for private evidence")
    subcommands = parser.add_subparsers(dest="mode", required=True)
    validate = subcommands.add_parser("validate", help="Validate evidence against the supplied schema")
    validate.add_argument("files", type=Path, nargs="+")
    for mode in ("dry-run", "public", "staging"):
        run = subcommands.add_parser(mode)
        run.add_argument("--out", type=Path, required=True, help="New private output directory")
        run.add_argument("--run-id", default=None)
        run.add_argument("--previous-run-id", default=None)
    args = parser.parse_args()
    try:
        schema = validator(args.schema)
    except (OSError, ValueError, KeyError, TypeError, SchemaError):
        parser.exit(2, "Unable to load a compatible evidence schema.\n")
    if args.mode == "validate":
        for path in args.files:
            try:
                errors = list(schema.iter_errors(read_json(path)))
            except (OSError, ValueError):
                parser.exit(2, "Unable to read an evidence input.\n")
            if errors:
                parser.exit(1, f"{path.name}: invalid evidence ({len(errors)} schema errors)\n")
            print(f"{path.name}: valid against schema 1.0.0")
        return 0

    started_at = local_now()
    run_id = args.run_id or f"CC-QA-{started_at:%Y-%m-%d}-{uuid4().hex[:12]}"
    if not RUN_ID.fullmatch(run_id) or (args.previous_run_id and not RUN_ID.fullmatch(args.previous_run_id)):
        parser.error("Run IDs must be 1–80 ASCII letters, digits, underscores or hyphens, starting alphanumerically.")
    args.out.mkdir(mode=0o700, parents=True, exist_ok=False)
    destination = args.out / "evidence.json"
    evidence = new_evidence(args, started_at, run_id, schema.schema)
    evidence["run_status"] = "in_progress"
    write_evidence(destination, evidence, schema)

    def record(name, status, reason=None):
        evidence["framework_checks"].append({"name": name, "status": status, "reason": reason})
        write_evidence(destination, evidence, schema)

    try:
        result = run_checks(args, evidence, record)
    except KeyboardInterrupt:
        record("Run interrupted", "blocked")
        result = 2
    evidence["run_status"] = {0: "pass", 1: "fail", 2: "blocked"}[result]
    write_evidence(destination, evidence, schema)
    print(f"{run_id}: {evidence['run_status']}; evidence.json written")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
