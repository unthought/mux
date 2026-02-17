#!/bin/bash
set -e
cd /home/coder/coder/mux

export MUX_SERVER_AUTH_TOKEN=mux-experiment-token

# Kill old server
pkill -f "node dist/cli/index.js server" 2>/dev/null || true
sleep 1

# Clean build
rm -rf node_modules/.vite
rm -f dist/main-*.js dist/main-*.css dist/index.html
npx vite build 2>&1 | tail -5

# Start server
nohup node dist/cli/index.js server --port 4000 --host 0.0.0.0 > /tmp/mux-server.log 2>&1 &
sleep 2

# Verify
if curl -sf -H "Cookie: mux_auth_token=mux-experiment-token" http://127.0.0.1:4000/health > /dev/null; then
    echo "✅ Server running on port 4000"
    echo "   URL: https://4000--dev--mux-experiments--tracy--apps.dev.coder.com/?token=mux-experiment-token"
else
    echo "❌ Server failed to start"
    cat /tmp/mux-server.log | tail -20
fi
