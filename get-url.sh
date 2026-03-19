#!/bin/bash
# Get the current public URL of the MMI Lab site
echo "──────────────────────────────────────"
echo "  MMI Lab — Current Public URL"
echo "──────────────────────────────────────"
URL=$(docker logs mmilab-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
if [ -z "$URL" ]; then
  echo "  Tunnel not running. Start with:"
  echo "  docker compose up -d"
else
  echo ""
  echo "  $URL"
  echo ""
  echo "  Login: ${URL}/login.html"
  echo ""
fi
echo "──────────────────────────────────────"
