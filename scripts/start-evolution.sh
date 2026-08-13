#!/bin/bash
cd "$(dirname "$0")/../docker/evolution-api"
echo "🚀 Launching Evolution API WhatsApp Gateway on port 8080..."
docker compose up -d
echo "✅ Evolution API is running!"
echo "🌐 Open Dashboard at: http://localhost:8080"
echo "🔑 API Key: vp_app_secret_key_2026"
