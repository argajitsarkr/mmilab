#!/bin/bash
# ─────────────────────────────────────────────────────────
#  MMI Lab — Server Deploy Script
#  Run this on the PowerEdge R730 server to update the site.
#  Usage:  bash deploy.sh
# ─────────────────────────────────────────────────────────
set -e

echo ""
echo "═══════════════════════════════════════════"
echo "  MMI Lab — Deploying latest version..."
echo "═══════════════════════════════════════════"
echo ""

# 1. Pull latest code from GitHub
echo "▶ Pulling latest code from Git..."
git pull origin main
echo ""

# 2. Tear down old containers completely (prevents stale container issues)
echo "▶ Stopping old containers..."
docker compose down
echo ""

# 3. Rebuild and start fresh
echo "▶ Rebuilding and starting containers..."
docker compose up --build -d
echo ""

# 4. Wait for API health check to pass
echo "▶ Waiting for API to start..."
sleep 15
docker compose ps

echo ""
echo "▶ Checking API health..."
curl -sf http://localhost:8080/api/health && echo " ✓ API is healthy" || echo " ✗ API not ready yet — check: docker logs mmilab-api"
echo ""

# 5. Get permanent Tailscale Funnel URL
FUNNEL_URL=$(docker exec mmilab-tunnel tailscale funnel status 2>/dev/null | grep -oP 'https://[a-z0-9.-]+' | head -1)
echo "═══════════════════════════════════════════"
echo "  ✓ Deploy complete!"
echo ""
echo "  Local:  http://$(hostname -I | awk '{print $1}'):$(grep HOST_PORT .env 2>/dev/null | cut -d= -f2 || echo 8080)"
if [ -n "$FUNNEL_URL" ]; then
echo "  Public: $FUNNEL_URL  (permanent — never changes!)"
echo "  Login:  ${FUNNEL_URL}/login.html"
else
echo "  Public: Tailscale Funnel starting... run 'bash get-url.sh' in a minute"
fi
echo "═══════════════════════════════════════════"
echo ""
