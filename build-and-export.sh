#!/bin/bash
# ── build-and-export.sh ───────────────────────────────────────────────────────
# Builds the OpenFlashcards Docker image and exports it as a .tar.gz archive
# ready to be imported on your Synology NAS.
#
# Usage:
#   chmod +x build-and-export.sh
#   ./build-and-export.sh
#
# Then on Synology:
#   docker load < openflashcards.tar.gz
#   docker run -d \
#     --name openflashcards \
#     --restart unless-stopped \
#     -p 3000:3000 \
#     -v /volume1/docker/openflashcards/data:/app/data \
#     -v /volume1/docker/openflashcards/config:/app/config \
#     -e JWT_SECRET=your_random_secret_here \
#     openflashcards:latest

set -e

IMAGE_NAME="openflashcards"
IMAGE_TAG="latest"
ARCHIVE="openflashcards.tar.gz"

echo "🔨 Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .

echo "💾 Exporting image to ${ARCHIVE}…"
docker save "${IMAGE_NAME}:${IMAGE_TAG}" | gzip > "${ARCHIVE}"

SIZE=$(du -sh "${ARCHIVE}" | cut -f1)
echo ""
echo "✅ Done! Archive: ${ARCHIVE} (${SIZE})"
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  TO DEPLOY ON SYNOLOGY:"
echo ""
echo "  1. Copy ${ARCHIVE} to your NAS"
echo "  2. SSH into your NAS and run:"
echo "       docker load < ${ARCHIVE}"
echo ""
echo "  3. In Synology Docker UI (or via SSH):"
echo "       docker run -d \\"
echo "         --name openflashcards \\"
echo "         --restart unless-stopped \\"
echo "         -p 3000:3000 \\"
echo "         -v /volume1/docker/openflashcards/data:/app/data \\"
echo "         -v /volume1/docker/openflashcards/config:/app/config \\"
echo "         -e JWT_SECRET=\$(openssl rand -hex 32) \\"
echo "         openflashcards:latest"
echo ""
echo "  4. Open http://your-nas-ip:3000"
echo "     Default login: admin / admin"
echo "     ⚠️  Change the admin password on first login!"
echo "──────────────────────────────────────────────────────────"
