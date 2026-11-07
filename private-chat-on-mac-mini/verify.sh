#!/bin/bash
# verify.sh — Health-check script for monitoring
# Can be called by a monitoring daemon, cron, or the monitoring dashboard.
# Usage: ./verify.sh [port]

PORT="${1:-8000}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/health 2>/dev/null)
if [ "$STATUS" = "200" ]; then
    echo "Splash: OK (port $PORT)"
    exit 0
else
    echo "Splash: DOWN (port $PORT, HTTP $STATUS)"
    exit 1
fi
