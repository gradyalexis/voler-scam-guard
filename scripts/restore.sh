#!/usr/bin/env bash
# Restore database dari file backup: scripts/restore.sh backups/xxx.sql.gz
# Ke project/database baru: jalankan dulu ./scripts/migrate.sh dan
# ./scripts/create-readonly-role.sh supaya role vsg_ro dan pengaman RLS sudah ada.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Pakai: $0 <file-backup.sql.gz>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/db.sh
source scripts/lib/db.sh

echo "Ini akan MENIMPA isi database: $(db_target)."
read -r -p "Ketik 'ya' untuk lanjut: " confirm
[ "$confirm" = "ya" ] || { echo "Dibatalkan."; exit 1; }

# Satu transaksi: kalau ada error di tengah, database tidak ditinggal setengah terhapus.
gunzip -c "$1" | db_psql -v ON_ERROR_STOP=1 --single-transaction

# Pastikan tabel hasil restore tetap tertutup dari Data API Supabase.
db_psql -v ON_ERROR_STOP=1 -q < db/init/004_supabase_rls.sql

echo "Restore selesai. Restart bot (docker compose restart bot) dan dashboard di repo-nya."
