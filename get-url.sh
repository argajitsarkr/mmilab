#!/bin/bash
# Get the permanent public URL of the MMI Lab site (Tailscale Funnel)
echo "──────────────────────────────────────"
echo "  MMI Lab — Permanent Public URL"
echo "──────────────────────────────────────"
URL=$(docker exec mmilab-tunnel tailscale funnel status 2>/dev/null | grep -oP 'https://[a-z0-9.-]+' | head -1)
if [ -z "$URL" ]; then
  # Fallback: try getting the Tailscale DNS name
  URL=$(docker exec mmilab-tunnel tailscale status --json 2>/dev/null | grep -oP '"DNSName":"[^"]+' | head -1 | sed 's/"DNSName":"//;s/\.$//')
  if [ -n "$URL" ]; then
    URL="https://$URL"
  fi
fi
if [ -z "$URL" ]; then
  echo "  Tunnel not running. Start with:"
  echo "  docker compose up -d"
else
  echo ""
  echo "  $URL"
  echo ""
  echo "  Login: ${URL}/login.html"
  echo ""
  echo "  (This URL is permanent — it never changes!)"
fi
echo "──────────────────────────────────────"
