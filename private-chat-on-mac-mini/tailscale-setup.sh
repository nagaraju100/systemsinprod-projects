#!/bin/bash
# tailscale-setup.sh — Helpers for configuring Tailscale on the Mac mini
# Usage: ./tailscale-setup.sh [action]
# Actions: join, url, port-forward-off

set -euo pipefail

ACTION="${1:-join}"

case "$ACTION" in
    join)
        echo "Joining tailnet..."
        if command -v tailscale &>/dev/null; then
            tailscale up
            echo "Tailnet joined."
            echo "Your device: $(tailscale status --short 2>/dev/null | head -1)"
        else
            echo "Tailscale not installed. Install from https://tailscale.com/download"
            exit 1
        fi
        ;;
    url)
        # Print the Tailscale HTTPS URL for the chat UI
        # (MuthyaChat is typically served on a separate port behind Tailscale Funnel/Serve)
        echo "MuthyaChat URL: https://$(hostname).ts.net"
        echo "Splash API: http://$(hostname).ts.net:8000/v1"
        ;;
    port-forward-off)
        # Tailscale Funnel exposes publicly — turn it off for security
        echo "Disabling any active Tailscale Funnel..."
        tailscale funnel off 2>/dev/null || true
        echo "Funnel disabled."
        ;;
    *)
        echo "Usage: $0 [join|url|port-forward-off]"
        exit 1
        ;;
esac
