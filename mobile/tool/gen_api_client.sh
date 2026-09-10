#!/usr/bin/env bash
# Generate the typed Dart client from the API's own contract.
#
# api/openapi.json is emitted by the same DTOs that validate at runtime
# (api/src/swagger.ts), so this is generated and never hand-written — the same
# rule as lib/api/schema.d.ts on the web. The output directory is gitignored.
#
# Needs Java and openapi-generator-cli:
#   npm i -g @openapitools/openapi-generator-cli
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC="$HERE/../../api/openapi.json"
OUT="$HERE/../lib/src/data/generated"

[ -f "$SPEC" ] || { echo "No spec at $SPEC — run 'npm run spec' in api/ first."; exit 1; }

rm -rf "$OUT"
openapi-generator-cli generate \
  -i "$SPEC" \
  -g dart-dio \
  -o "$OUT" \
  --additional-properties=pubName=aspire91_api,nullableFields=true

echo "Generated into $OUT"
echo "Now run: dart run build_runner build --delete-conflicting-outputs"
