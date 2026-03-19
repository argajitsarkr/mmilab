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

# 2. Rebuild API container (only if Dockerfile or package.json changed)
echo "▶ Rebuilding and restarting containers..."
docker compose up --build -d
echo ""

# 3. Wait for containers to start, then check health
echo "▶ Waiting for API to start..."
sleep 5
docker compose ps

echo ""
echo "✓ Deploy complete!"
echo ""
echo "  Site is running at: http://$(hostname -I | awk '{print $1}'):$(grep HOST_PORT .env 2>/dev/null | cut -d= -f2 || echo 8080)"
echo ""
