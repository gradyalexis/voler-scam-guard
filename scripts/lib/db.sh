# shellcheck shell=bash
# Helper bersama untuk skrip database. Di-source oleh scripts/*.sh setelah cd ke
# root project. Target dipilih lewat DB_PROVIDER di .env:
#
#   supabase  psql/pg_dump dijalankan dari image postgres (tidak perlu psql di
#             host), konek ke DATABASE_URL dengan sslmode=verify-full.
#   local     docker compose exec ke container postgres (profile local-db).

# .env dibaca baris per baris, bukan di-`source`: nilai seperti URL berisi `&`
# atau `?` harus diambil apa adanya (sama seperti docker compose), bukan
# dieksekusi bash. Variabel yang sudah ada di environment tidak ditimpa.
_load_env() {
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]%$'\r'}"
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    [ -n "${!key+x}" ] || export "$key=$value"
  done < .env
}
_load_env

DB_PROVIDER="${DB_PROVIDER:-local}"
# Image klien untuk psql. pg_dump otomatis memakai versi yang sama dengan server.
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"

case "$DB_PROVIDER" in
  supabase) ;;
  local) export COMPOSE_PROFILES="${COMPOSE_PROFILES:-local-db}" ;;
  *) echo "DB_PROVIDER tidak dikenal: '$DB_PROVIDER' (pilih supabase atau local)" >&2; exit 1 ;;
esac

require_ro_password() {
  : "${DB_RO_PASSWORD:?DB_RO_PASSWORD belum diisi di .env}"
  # Password dipakai di URL dan literal SQL, jadi batasi karakternya.
  if [[ ! "$DB_RO_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "DB_RO_PASSWORD hanya boleh huruf, angka, _ dan - (buat dengan: openssl rand -hex 24)." >&2
    exit 1
  fi
}

# Deskripsi target untuk pesan ke user, tanpa kredensial.
db_target() {
  if [ "$DB_PROVIDER" = supabase ]; then
    local host="${DATABASE_URL:-}"
    host="${host#*@}"
    echo "supabase (${host%%[/?]*})"
  else
    echo "postgres lokal (${DB_NAME:-voler_scam_guard})"
  fi
}

# Buang parameter SSL dari URL; SSL diatur lewat PGSSLMODE/PGSSLROOTCERT, dan
# parameter di URL akan mengalahkan env tersebut.
_strip_ssl_params() {
  local base="${1%%\?*}" query="" part
  local -a parts=() kept=()
  [[ "$1" == *\?* ]] && query="${1#*\?}"
  IFS='&' read -ra parts <<<"$query"
  for part in "${parts[@]}"; do
    case "${part%%=*}" in
      ''|ssl|sslmode|sslrootcert|sslcert|sslkey|uselibpqcompat) ;;
      *) kept+=("$part") ;;
    esac
  done
  if [ ${#kept[@]} -gt 0 ]; then
    (IFS='&'; echo "$base?${kept[*]}")
  else
    echo "$base"
  fi
}

# URL untuk role vsg_ro, diturunkan dari DATABASE_URL. Pooler Supabase memakai
# user `<role>.<project_ref>`; direct connection cukup `<role>`.
_supabase_ro_url() {
  require_ro_password
  local re='^(postgres(ql)?://)([^:@/]+)(:[^@]*)?@(.+)$'
  if [[ ! "${DATABASE_URL:-}" =~ $re ]]; then
    echo "DATABASE_URL tidak valid atau kosong." >&2
    exit 1
  fi
  local scheme="${BASH_REMATCH[1]}" user="${BASH_REMATCH[3]}" rest="${BASH_REMATCH[5]}" suffix=""
  [[ "$user" == *.* ]] && suffix=".${user#*.}"
  echo "${scheme}vsg_ro${suffix}:${DB_RO_PASSWORD}@${rest}"
}

#   _supabase_exec <url> <psql|pg_dump> [args...]
_supabase_exec() {
  local url="$1"; shift
  local ca="${DATABASE_SSL_CA_FILE:-}"
  if [ -z "$ca" ]; then
    echo "DATABASE_SSL_CA_FILE belum diisi di .env (lihat 'Setup Supabase' di README)." >&2
    exit 1
  fi
  [[ "$ca" = /* ]] || ca="$ROOT_DIR/$ca"
  if [ ! -f "$ca" ]; then
    echo "File CA tidak ditemukan: $ca" >&2
    exit 1
  fi
  # URL dikirim lewat env, bukan argumen, supaya password tidak terlihat di `ps`.
  VSG_PG_URL="$(_strip_ssl_params "$url")" docker run --rm -i \
    -e VSG_PG_URL \
    -e PGSSLMODE=verify-full \
    -e PGSSLROOTCERT=/tmp/supabase-ca.crt \
    -v "$ca:/tmp/supabase-ca.crt:ro" \
    "$PG_CLIENT_IMAGE" \
    sh -c 'tool="$1"; shift; exec "$tool" --dbname="$VSG_PG_URL" "$@"' sh "$@"
}

# psql dengan hak penuh (pemilik tabel).
db_psql() {
  if [ "$DB_PROVIDER" = supabase ]; then
    _supabase_exec "${DATABASE_URL:?DATABASE_URL belum diisi di .env}" psql "$@"
  else
    docker compose exec -T postgres \
      psql -U "$DB_USER" -d "${DB_NAME:-voler_scam_guard}" "$@"
  fi
}

# psql sebagai vsg_ro (hanya SELECT).
db_psql_ro() {
  if [ "$DB_PROVIDER" = supabase ]; then
    local url
    url="$(_supabase_ro_url)"
    _supabase_exec "$url" psql "$@"
  else
    require_ro_password
    docker compose exec -T -e PGPASSWORD="$DB_RO_PASSWORD" postgres \
      psql -U vsg_ro -d "${DB_NAME:-voler_scam_guard}" "$@"
  fi
}

# Untuk Supabase, pg_dump memakai versi mayor yang sama dengan server: pg_dump
# yang lebih baru menulis SET yang tidak dikenal server lama (mis.
# transaction_timeout dari pg_dump 17), sehingga restore ke server itu gagal.
db_pg_dump() {
  if [ "$DB_PROVIDER" = supabase ]; then
    local url="${DATABASE_URL:?DATABASE_URL belum diisi di .env}" version
    version="$(_supabase_exec "$url" psql -XtAc 'SHOW server_version_num')"
    if [[ ! "$version" =~ ^[0-9]+$ ]]; then
      echo "Gagal membaca versi server Postgres." >&2
      return 1
    fi
    PG_CLIENT_IMAGE="postgres:$((version / 10000))-alpine" _supabase_exec "$url" pg_dump "$@"
  else
    docker compose exec -T postgres \
      pg_dump -U "$DB_USER" -d "${DB_NAME:-voler_scam_guard}" "$@"
  fi
}
