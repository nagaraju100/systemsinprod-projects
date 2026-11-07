#!/bin/bash
# install-splash.sh — Install Splash, serve the model, set up auto-start
# Usage: ./install-splash.sh [API_KEY] [PORT]
# If no API_KEY is given, authentication is off (not recommended for shared networks).

set -euo pipefail

API_KEY="${1:-}"
PORT="${2:-8000}"
MODEL="mlx-community/Qwen3.6-35B-A3B-4bit"
PLIST_PATH="$HOME/Library/LaunchAgents/com.incoai.splash-server.plist"
SPLASH_LAUNCH="~/Library/LaunchAgents/com.incoai.splash-server.plist"

echo "=== Systems in Prod: Private ChatGPT on Mac mini ==="
echo "Model: $MODEL"
echo "Port:  $PORT"
echo ""

# 1. Install Splash
echo "[1/5] Installing Splash via Homebrew..."
brew install incoai/tap/splash || brew upgrade incoai/tap/splash
echo "  Splash installed."

# 2. Write the LaunchAgent plist
echo "[2/5] Writing LaunchAgent plist..."
mkdir -p "$HOME/Library/LaunchAgents"

if [ -n "$API_KEY" ]; then
    API_ARG="\"--api-key\" \"$API_KEY\""
else
    API_ARG=""
fi

cat > "$PLIST_PATH" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.incoai.splash-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/splash</string>
        <string>serve</string>
        <string>--model</string>
        <string>${MODEL}</string>
        <string>--host</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>${PORT}</string>
PLIST_EOF

if [ -n "$API_KEY" ]; then
    cat >> "$PLIST_PATH" <<KEY_EOF
        <string>--api-key</string>
        <string>${API_KEY}</string>
KEY_EOF
fi

cat >> "$PLIST_PATH" <<PLIST_END
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/splash-server-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/splash-server-stderr.log</string>
</dict>
</plist>
PLIST_END

echo "  Wrote $PLIST_PATH"

# 3. Load the LaunchAgent
echo "[3/5] Loading Splash into launchd (auto-start on boot)..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "  Splash service registered."

# 4. Wait for Splash to be ready
echo "[4/5] Waiting for Splash to be ready (first run downloads the model)..."
for i in $(seq 1 120); do
    if curl -s http://127.0.0.1:${PORT}/health | grep -q ok; then
        echo "  Splash is ready (took ${i}s)."
        break
    fi
    if [ "$i" -eq 120 ]; then
        echo "  Splash did not start within 60s. Check /tmp/splash-server-stderr.log for errors."
        exit 1
    fi
    sleep 0.5
done

# 5. Verify with health check
echo "[5/5] Running health check..."
curl -s http://127.0.0.1:${PORT}/health
echo ""

# Show Tailscale URL
TS_URL=$(curl -s --retry 3 --max-time 5 'https://api.tailscale.com/api/v2/tailnet' \
    -H "Authorization: Bearer $(cat ~/.config/tailscale/metadata.json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("key",""))' 2>/dev/null || echo '')" 2>/dev/null | python3 -c 'import sys,json; print("https://"+json.load(sys.stdin)["users"][0].get("name","?")+".ts.net")' 2>/dev/null || echo "")

echo ""
echo "=== Setup complete ==="
if [ -n "$TS_URL" ]; then
    echo "Chat UI: https://$TS_URL"
fi
echo "API:     http://127.0.0.1:${PORT}/v1"
if [ -n "$API_KEY" ]; then
    echo "Key:     Bearer ${API_KEY:0:4}****"
fi
echo ""
echo "To test:  python3 -c \"from openai import OpenAI; c=OpenAI(base_url='http://127.0.0.1:${PORT}/v1',api_key='x'); print(c.chat.completions.create(model='local',messages=[{'role':'user','content':'hi'}]).choices[0].message.content)\""
echo ""
echo "Full setup: https://systemsinprod.com/use-cases/private-chat-on-mac-mini/"
