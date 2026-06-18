#!/usr/bin/env bash
# Run the codemod for a range of lines in phase2-plan.tsv, in order.
# Usage: bash scripts/run-extractions.sh <fromLine> <toLine>
set -euo pipefail
FROM="${1:-1}"
TO="${2:-9999}"
PLAN="$(dirname "$0")/phase2-plan.tsv"
n=0
while IFS=$'\t' read -r name dir; do
  n=$((n+1))
  [ "$n" -lt "$FROM" ] && continue
  [ "$n" -gt "$TO" ] && break
  [ -z "$name" ] && continue
  printf '[%2d] %-28s -> components/%s\n' "$n" "$name" "$dir"
  out=$(node "$(dirname "$0")/extract-component.mjs" "$name" "components/$dir" 2>&1) || {
    echo "$out"; echo "✗ FAILED on $name"; exit 1;
  }
  echo "$out" | grep back-edges || true
done < "$PLAN"
echo "done lines $FROM..$TO"
