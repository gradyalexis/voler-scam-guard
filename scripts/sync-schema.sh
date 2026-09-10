#!/usr/bin/env bash
# Skema Drizzle dipakai dua service yang punya node_modules terpisah, jadi
# file-nya diduplikasi. Skrip ini menyalin versi bot ke dashboard.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/bot/src/db/schema.ts"
DEST="$ROOT_DIR/dashboard/lib/db/schema.ts"

sed 's#// File ini identik dengan dashboard/lib/db/schema.ts.#// File ini identik dengan bot/src/db/schema.ts.#' "$SRC" > "$DEST"
echo "schema.ts disalin: bot -> dashboard"
echo "Ingat: perubahan kolom juga harus ditulis sebagai migrasi SQL di db/init/."
