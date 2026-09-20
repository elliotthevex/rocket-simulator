#!/bin/sh
# Headless JS physics tests via JavaScriptCore (macOS built-in). Usage: tests/js/run.sh [filter]
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JSC="${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc}"
if [ ! -x "$JSC" ]; then echo "jsc not found at $JSC (set JSC=... or install Node and use tests/js/run-node.sh)"; exit 2; fi
FILTER="${1:-}"
status=0
for f in "$ROOT"/tests/js/test-*.js; do
  case "$(basename "$f")" in *"$FILTER"*) ;; *) continue ;; esac
  echo "== $(basename "$f")"
  out=$("$JSC" "$ROOT/web/js/physics-core.js" "$ROOT/web/js/flight-loop.js" "$ROOT/web/js/physics/control.js" "$ROOT/tests/js/harness.js" "$f" \
        -e "runAllTests('$(basename "$f")')" 2>&1)
  printf '%s\n' "$out"
  printf '%s\n' "$out" | grep -q '^PASSED' || status=1
done
exit $status
