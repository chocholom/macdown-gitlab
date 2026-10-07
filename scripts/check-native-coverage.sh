#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
xcrun llvm-cov export \
  .build/debug/MacDownGitLabPackageTests.xctest/Contents/MacOS/MacDownGitLabPackageTests \
  -instr-profile=.build/debug/codecov/default.profdata > /tmp/macdown-native-coverage.json
python3 - <<'PY'
import json
with open('/tmp/macdown-native-coverage.json') as f:
    data=json.load(f)
files=[f for d in data['data'] for f in d['files'] if '/Sources/MarkdownNative/' in f['filename']]
total=sum(f['summary']['lines']['count'] for f in files)
covered=sum(f['summary']['lines']['covered'] for f in files)
percentage=covered/total*100 if total else 0
print(f'Native settings/storage/pagination line coverage: {percentage:.2f}% ({covered}/{total})')
if percentage<95:
    raise SystemExit('Native core line coverage must be at least 95%')
PY
