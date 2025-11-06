#!/bin/bash
# Wait for PostgreSQL to be ready

set -e

host="${DATABASE_HOST:-localhost}"
port="${DATABASE_PORT:-5433}"
user="${DATABASE_USER:-postgres}"
db="${DATABASE_NAME:-rls_dsl_test}"

echo "Waiting for PostgreSQL to be ready on $host:$port..."

until PGPASSWORD=postgres psql -h "$host" -p "$port" -U "$user" -d "$db" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is ready!"

