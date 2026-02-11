#!/bin/bash
# Quick test script for the migration API
# This assumes the dev server is running on localhost:5173

echo "Testing Migration API..."
echo ""

# Test GET /api/migrations (list migrations)
echo "1. Testing GET /api/migrations (list active policy migrations):"
curl -s http://localhost:5173/api/migrations | jq '.'
echo ""

# Test POST /api/migrations (create migration)
echo "2. Testing POST /api/migrations (create test migration):"
TEST_FILENAME="$(date +%Y%m%d%H%M%S)_policy_test_api.sql"
TEST_CONTENT="-- Test policy migration
CREATE POLICY test_policy ON documents
  FOR SELECT
  USING (user_id = auth.uid());"

curl -s -X POST http://localhost:5173/api/migrations \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"$TEST_FILENAME\",\"content\":\"$TEST_CONTENT\"}" | jq '.'
echo ""

# List again to see the new file
echo "3. Listing migrations again (should show new file):"
curl -s http://localhost:5173/api/migrations | jq '.'
echo ""

# Test DELETE /api/migrations (remove migration)
echo "4. Testing DELETE /api/migrations (remove test migration):"
curl -s -X DELETE http://localhost:5173/api/migrations \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"$TEST_FILENAME\"}" | jq '.'
echo ""

# List again to confirm deletion
echo "5. Final listing (should not show test file):"
curl -s http://localhost:5173/api/migrations | jq '.'
echo ""

echo "✅ Migration API test complete!"
echo ""
echo "To use this manually:"
echo "1. Run: pnpm demo:dev"
echo "2. In another terminal, run: bash demo/test-migration-api.sh"
