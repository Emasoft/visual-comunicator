#!/usr/bin/env bash
# Wrapper that runs the full visual-explainer test suite.
#
# Pre-requisites (the runner enforces them anyway):
#   - python3 on PATH
#   - uv on PATH (used by render-interactive-report.py)
#   - dev-browser on PATH (npm install -g dev-browser; dev-browser install)
#
# Exits non-zero if any test fails.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$HERE/run-tests.py" "$@"
