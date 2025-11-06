#!/bin/bash
# Run integration tests with Supabase CLI
# Ensures cleanup happens even if tests fail

set -e

# Check if Supabase is already running
if supabase status > /dev/null 2>&1; then
  echo "Supabase is already running, using existing instance..."
  WAS_RUNNING=true
else
  echo "Starting Supabase..."
  supabase start
  WAS_RUNNING=false
fi

# Clean up function
cleanup() {
  if [ "$WAS_RUNNING" = "false" ]; then
    echo "Stopping Supabase..."
    supabase stop || true
  fi
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

echo "Waiting for database to be ready..."
sleep 3

echo "Running integration tests..."
pnpm test:integration

echo "Integration tests completed successfully!"
