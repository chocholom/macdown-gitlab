#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
OUTPUT="$PWD/test-results/native"
mkdir -p "$OUTPUT"
RUN_DIR=$(mktemp -d "$OUTPUT/run.XXXXXX")
python3 - "$PWD/dist/MacDown GitLab.app/Contents/MacOS/MacDownGitLab" --smoke-test "$RUN_DIR" <<'PY'
import subprocess,sys
subprocess.run(sys.argv[1:],check=True,timeout=45)
PY
python3 - "$RUN_DIR/native-smoke.json" <<'PY'
import json,sys
with open(sys.argv[1]) as f:
    result=json.load(f)
print(json.dumps(result,indent=2))
sys.exit(0 if result.get('passed') else 1)
PY
python3 - "$PWD/dist/MacDown GitLab.app/Contents/MacOS/MacDownGitLab" --recovery-test "$RUN_DIR" <<'PY'
import subprocess,sys
subprocess.run(sys.argv[1:],check=True,timeout=45)
PY
python3 - "$RUN_DIR/recovery-smoke.json" <<'PY'
import json,sys
with open(sys.argv[1]) as f:
    result=json.load(f)
print(json.dumps(result,indent=2))
sys.exit(0 if result.get('passed') else 1)
PY
cp "$RUN_DIR/native-smoke.json" "$RUN_DIR/recovery-smoke.json" "$RUN_DIR/native-window.png" "$RUN_DIR/export.html" "$RUN_DIR/export.pdf" "$RUN_DIR/multipage.pdf" "$OUTPUT/"
