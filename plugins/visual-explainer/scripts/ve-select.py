#!/usr/bin/env python3
"""
visual-explainer — interactive selection runner.

Serves the given HTML file on a free localhost port, opens the page in a
borderless Chromium app-mode window so window.close() works, and blocks
until the page POSTs a selection to /__ve-select (or a timeout elapses).

On exit, prints the selection JSON to stdout — exactly one line — so the
calling agent can parse it. Schema:

    { "id": "...", "type": "...", "label": "...", "data": {...} }

On timeout / cancel / browser-launch-failure, prints:

    { "id": null, "reason": "timeout|cancel|no-browser|...", ... }

Always exits 0 unless the input is structurally invalid (missing/unreadable
HTML file → exit 2). The "no selection" case is a normal outcome, not an
error: the calling agent should branch on the "reason" field.

Environment:
    VE_SELECT_TIMEOUT     seconds to wait for a click (default 600)
    VE_SELECT_BROWSER     absolute path to a Chromium-based browser (override
                          autodetection)
    VE_SELECT_NO_APP      if "1", skip --app mode and open the user's default
                          browser instead (selection still works, but the
                          window will not auto-close)
    VE_SELECT_NO_BROWSER  if "1", do not launch any browser. The server still
                          listens — meant for smoke tests where the test
                          harness POSTs the selection itself.

Usage:
    python3 ve-select.py /absolute/path/to/page.html
"""
from __future__ import annotations

import http.server
import json
import os
import shutil
import signal
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import urlparse


# Minimal valid PWA manifest — Chrome's `--app=URL` mode silently refuses to
# render the URL on Chrome 120+ unless the page advertises a web-app manifest.
# (Without one, Chrome opens the app window then immediately tries to load
# chrome://newtab/, which errors as "incorrect profile type" on a fresh
# --user-data-dir, leaving the user staring at a blank-or-google-default
# window.) The icon is a 1x1 transparent SVG embedded as a data URI so we
# don't have to ship a binary file.
MANIFEST_BYTES = (
    b'{"name":"Visual Explainer Selection",'
    b'"short_name":"VE",'
    b'"start_url":"./",'
    b'"display":"standalone",'
    b'"background_color":"#ffffff",'
    b'"theme_color":"#1e3a5f",'
    b'"icons":[{"src":"data:image/svg+xml,'
    b'<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>",'
    b'"sizes":"any","type":"image/svg+xml"}]}'
)

# `<link rel="manifest">` tag we splice into served HTML pages. We add it
# right after `<head>` so it's parsed before anything else, which is what
# Chrome wants for app-mode detection. Idempotent: if the page already
# carries its own manifest link, ours becomes a duplicate (Chrome ignores
# duplicates after the first), so the page author's manifest still wins.
_MANIFEST_LINK_TAG = (
    b'<link rel="manifest" href="/__ve/manifest.json">'
)


def inject_manifest_link(html_bytes: bytes) -> bytes:
    """Insert a `<link rel="manifest">` tag right after the page's `<head>`.

    Returns the original bytes unchanged if no `<head>` tag is found (some
    headless / fragment HTML pages legitimately omit it). Case-insensitive
    match — handles `<HEAD>`, `<Head>`, `<head lang="en">`, etc.
    """
    if b"__ve/manifest.json" in html_bytes:
        # Already injected by an earlier pass — don't double-inject.
        return html_bytes
    # Find the first `<head` token (case-insensitive) and the `>` that
    # closes that opening tag. We splice our link immediately after.
    lower = html_bytes.lower()
    head_open = lower.find(b"<head")
    if head_open == -1:
        return html_bytes
    close_bracket = html_bytes.find(b">", head_open)
    if close_bracket == -1:
        return html_bytes
    return (
        html_bytes[: close_bracket + 1]
        + _MANIFEST_LINK_TAG
        + html_bytes[close_bracket + 1 :]
    )


def find_free_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
    finally:
        sock.close()


def find_chromium_binary() -> str | None:
    """Locate a Chromium-based browser binary.

    The window.close() JavaScript API is denied on tabs the browser opened
    on its own (security policy: only same-origin scripts that opened a
    window can close it). Launching Chromium with --app=URL produces a
    borderless app-mode window that *does* honour close requests, which is
    the entire reason this helper exists.
    """
    override = os.environ.get("VE_SELECT_BROWSER")
    if override and Path(override).is_file():
        return override

    if sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
            "/Applications/Arc.app/Contents/MacOS/Arc",
            "/Applications/Thorium.app/Contents/MacOS/Thorium",
        ]
    elif sys.platform == "win32":
        bases = [
            os.environ.get("PROGRAMFILES", ""),
            os.environ.get("PROGRAMFILES(X86)", ""),
            os.environ.get("LOCALAPPDATA", ""),
        ]
        candidates = []
        for base in bases:
            if not base:
                continue
            candidates.extend(
                [
                    f"{base}\\Google\\Chrome\\Application\\chrome.exe",
                    f"{base}\\Microsoft\\Edge\\Application\\msedge.exe",
                    f"{base}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                    f"{base}\\Chromium\\Application\\chrome.exe",
                    f"{base}\\Vivaldi\\Application\\vivaldi.exe",
                ]
            )
    else:
        # linux / wsl / other unix
        candidates = [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "brave-browser",
            "microsoft-edge",
            "microsoft-edge-stable",
            "msedge",
            "vivaldi",
        ]

    for cand in candidates:
        if "/" in cand or "\\" in cand:
            if Path(cand).is_file():
                return cand
        else:
            found = shutil.which(cand)
            if found:
                return found
    return None


def launch_app_window(binary: str, url: str, profile_dir: str) -> subprocess.Popen | None:
    """Launch a Chromium-based browser in app mode pointing at `url`.

    The Chrome flags are tuned to suppress every "extra" window Chrome
    likes to spawn on first run:
      --no-first-run       — skip the welcome / sign-in / promo pages
      --no-default-browser-check — skip "make Chrome default" prompt
      --disable-features=… — kill the side-panel pinning, translate banner,
                             prefetch, and various promotional surfaces

    DO NOT add --no-startup-window: it conflicts with --app=URL and
    suppresses the app window itself, leaving Chrome running headless
    with no UI (and on some builds, falling back to opening the default
    google.com page in a normal window). --app=URL already implies
    "borderless single-window app mode", so the startup-window flag is
    both unnecessary and actively harmful.

    Likewise we do NOT pass --new-window — it conflicts with --app
    (asks for a new chrome browser window AND an app window).

    The subprocess is started in its OWN process group via
    start_new_session=True so we can kill the entire Chrome process tree
    (parent + ~20 helpers per Chrome instance: GPU, renderer, network
    service, etc.) on cleanup with one `os.killpg`. Without this, only
    the parent died and the helpers became zombies that kept the borderless
    windows visible until the user closed them by hand.
    """
    args = [
        binary,
        f"--app={url}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pings",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-features=Translate,InfinitePrefetch,SidePanelPinning,DefaultBrowserPromptRefresh",
        "--password-store=basic",
        "--use-mock-keychain",
        "--window-size=1280,820",
    ]
    try:
        return subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,  # own process group — see cleanup
        )
    except Exception:
        return None


def kill_browser_tree(proc: subprocess.Popen) -> None:
    """Kill the Chrome process AND every helper it spawned.

    Chromium spawns ~10–20 helper processes per browser instance (one each
    for GPU, network, audio, plus N renderers per tab). `proc.terminate()`
    only signals the parent — helpers reparent to launchd / systemd and
    keep their borderless windows alive. We use `os.killpg(SIGTERM)` on
    the process group (made unique by `start_new_session=True` at spawn
    time) so the whole tree dies together. SIGKILL is the fallback after
    a brief grace period.
    """
    if proc is None:
        return
    try:
        pgid = os.getpgid(proc.pid)
    except (ProcessLookupError, PermissionError):
        return
    try:
        os.killpg(pgid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return
    try:
        proc.wait(timeout=2)
    except (subprocess.TimeoutExpired, Exception):
        try:
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(json.dumps({"id": None, "reason": "no-file"}))
        return 2

    html_path = Path(argv[1]).expanduser().resolve()
    if not html_path.is_file():
        print(json.dumps({"id": None, "reason": "missing-file", "path": str(html_path)}))
        return 2

    try:
        timeout_seconds = int(os.environ.get("VE_SELECT_TIMEOUT", "600"))
    except ValueError:
        timeout_seconds = 600

    serve_dir = html_path.parent
    served_name = html_path.name
    os.chdir(str(serve_dir))

    # Auto-mirror the runtime next to the page so a relative
    # <script src="ve-runtime.js"> always resolves. SimpleHTTPServer rejects
    # ../ traversal, so a sibling copy is the only reliable layout.
    runtime_src = Path(__file__).resolve().parent / "ve-runtime.js"
    runtime_dst = serve_dir / "ve-runtime.js"
    runtime_bytes: bytes | None = None
    if runtime_src.is_file():
        try:
            runtime_bytes = runtime_src.read_bytes()
        except Exception:
            runtime_bytes = None
        if runtime_bytes is not None:
            try:
                if (not runtime_dst.exists()) or runtime_dst.read_bytes() != runtime_bytes:
                    runtime_dst.write_bytes(runtime_bytes)
            except Exception:
                # Non-fatal: page can still inline the runtime, or use
                # the /__ve/runtime.js virtual path served below.
                pass

    selection: dict[str, object] = {"id": None, "reason": "timeout"}
    selection_event = threading.Event()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args, **_kwargs):  # silence stderr access log
            return

        def end_headers(self):
            # Generated pages mutate every run — never let the browser cache
            # an old version that lacks the new selection wiring.
            self.send_header("cache-control", "no-store")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("access-control-allow-origin", "*")
            self.send_header("access-control-allow-methods", "POST, OPTIONS")
            self.send_header("access-control-allow-headers", "content-type")
            self.end_headers()

        def do_GET(self):
            req_path = urlparse(self.path).path
            # Virtual route: serve the runtime even when the page lives in
            # a directory the agent forgot to mirror it into.
            if req_path == "/__ve/runtime.js":
                if runtime_bytes is None:
                    self.send_response(404)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("content-type", "application/javascript; charset=utf-8")
                self.send_header("content-length", str(len(runtime_bytes)))
                self.end_headers()
                self.wfile.write(runtime_bytes)
                return
            # Virtual route: serve a minimal PWA manifest. This is what makes
            # `--app=URL` work on Chrome 120+ — without a manifest, Chrome
            # silently refuses to render the URL in app-mode and falls back
            # to chrome://newtab/ (which then errors as "incorrect profile
            # type" because the temp profile is fresh). With even a stub
            # manifest the page renders normally in the borderless window.
            if req_path == "/__ve/manifest.json":
                self.send_response(200)
                self.send_header("content-type", "application/manifest+json; charset=utf-8")
                self.send_header("content-length", str(len(MANIFEST_BYTES)))
                self.end_headers()
                self.wfile.write(MANIFEST_BYTES)
                return
            # Inject `<link rel="manifest">` and `<link rel="icon">` into the
            # served HTML page so Chrome treats it as a web app. We do this
            # at serve-time rather than asking the page authors to remember,
            # so every page that comes through ve-select.py gets the fix.
            if req_path == f"/{served_name}" or req_path == "/" or req_path == "":
                try:
                    raw = html_path.read_bytes()
                except Exception:
                    return super().do_GET()
                injected = inject_manifest_link(raw)
                self.send_response(200)
                self.send_header("content-type", "text/html; charset=utf-8")
                self.send_header("content-length", str(len(injected)))
                self.end_headers()
                self.wfile.write(injected)
                return
            return super().do_GET()

        def do_POST(self):
            url = urlparse(self.path)
            if url.path != "/__ve-select":
                self.send_response(404)
                self.end_headers()
                return

            length = int(self.headers.get("content-length") or 0)
            raw = self.rfile.read(length) if length else b""
            payload: dict[str, object]
            try:
                parsed = json.loads(raw.decode("utf-8") or "{}")
            except Exception:
                parsed = {"raw": raw.decode("utf-8", errors="replace")}
            if isinstance(parsed, dict):
                payload = dict(parsed)
            else:
                payload = {"value": parsed}
            # New (phase 1+) wire format always carries `kind` plus a
            # `selections` list. Preserve the page payload shape verbatim
            # — never inject `id: None` or any other phantom field, since
            # callers branch on the schema and an invented field
            # (especially a top-level "id": null on a multi-select submit)
            # would mislead them. Only stripping `reason` is mandatory:
            # that field is reserved for the runner to indicate timeout /
            # cancel, and the page must not be able to spoof it.
            payload.pop("reason", None)

            selection.clear()
            selection.update(payload)

            response = json.dumps({"ok": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("access-control-allow-origin", "*")
            self.send_header("content-length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            try:
                self.wfile.flush()
            except Exception:
                pass

            selection_event.set()

    port = find_free_port()
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True

    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    url = f"http://127.0.0.1:{port}/{served_name}?ve_select=1"

    profile_dir = tempfile.mkdtemp(prefix="ve-select-profile-")
    browser_proc: subprocess.Popen | None = None

    # SIGTERM / SIGINT cleanup. Python's default behaviour on SIGTERM is
    # to exit immediately WITHOUT running try/finally blocks, so the
    # cleanup at the bottom of main() never fires when an external
    # process (parent shell, pkill, supervisor) signals us. That left
    # ~14 Chrome helper processes orphaned per launch, each surfacing as
    # a stray borderless window. We install explicit handlers that run
    # `kill_browser_tree` on the spawned Chrome process group BEFORE
    # exiting, so the entire tree dies together.
    def _signal_cleanup(signum, _frame):
        if browser_proc is not None:
            try:
                kill_browser_tree(browser_proc)
            except Exception:
                pass
        try:
            shutil.rmtree(profile_dir, ignore_errors=True)
        except Exception:
            pass
        # Honour the signal — exit with the conventional 128+signum status.
        sys.exit(128 + signum)

    signal.signal(signal.SIGTERM, _signal_cleanup)
    signal.signal(signal.SIGINT, _signal_cleanup)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, _signal_cleanup)
    launch_reason = "ok"
    no_browser = os.environ.get("VE_SELECT_NO_BROWSER") == "1"
    no_app = os.environ.get("VE_SELECT_NO_APP") == "1"
    binary = None if (no_app or no_browser) else find_chromium_binary()

    if no_browser:
        launch_reason = "no-browser-requested"
        # Print URL to stderr so a manual tester / smoke-test harness can
        # find the served page without scraping logs.
        print(f"[ve-select] listening at {url}", file=sys.stderr)
    elif binary:
        browser_proc = launch_app_window(binary, url, profile_dir)
        if browser_proc is None:
            launch_reason = "browser-launch-failed"
    else:
        launch_reason = "no-chromium-fallback" if not no_app else "no-app-requested"

    if not no_browser and browser_proc is None:
        # Fall back to the user's default browser. window.close() will be
        # blocked there, but the runtime has its own "you can close this
        # tab" overlay so the UX still terminates cleanly.
        try:
            webbrowser.open(url)
        except Exception:
            launch_reason = "no-browser"

    try:
        selection_event.wait(timeout_seconds)
    finally:
        # Let the response flush and the page run window.close() before we
        # tear down the socket — without this the browser sometimes shows a
        # "connection reset" before navigating away.
        time.sleep(0.25)
        try:
            httpd.shutdown()
        except Exception:
            pass
        try:
            httpd.server_close()
        except Exception:
            pass
        if browser_proc is not None:
            # SIGTERM the entire Chrome process tree (parent + all helpers
            # like GPU/renderer/network) via the unique process group we
            # created at spawn time. terminate() alone leaves ~10–20
            # zombie helpers per launch, which surface as "extra empty
            # windows" once their localhost backing-server dies.
            kill_browser_tree(browser_proc)
        # Best-effort profile cleanup (the browser may still hold a lock
        # for a moment; ignore failures so we don't crash the agent loop).
        try:
            shutil.rmtree(profile_dir, ignore_errors=True)
        except Exception:
            pass

    if not selection_event.is_set():
        out = {"id": None, "reason": "timeout", "launch": launch_reason}
        print(json.dumps(out))
        return 0

    selection.setdefault("launch", launch_reason)
    print(json.dumps(selection))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
