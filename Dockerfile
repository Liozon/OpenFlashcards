# ── OpenFlashcards – single-container Docker image ──────────────────────────
# Build:  docker build -t openflashcards .
# Run:    docker run -d -p 3000:3000 -v /your/data:/app/data --name openflashcards openflashcards
# Save:   docker save openflashcards | gzip > openflashcards.tar.gz

FROM node:20-alpine

# Metadata
LABEL org.opencontainers.image.title="OpenFlashcards"
LABEL org.opencontainers.image.description="Lightweight language flashcard app"
LABEL org.opencontainers.image.version="2.0.0"

# Working directory
WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy application code
COPY src/     ./src/
COPY public/  ./public/

# Create persistent data directories inside image
# (will be overridden by volume mount on real deployments)
RUN mkdir -p /app/data /app/config

# Environment defaults
ENV NODE_ENV=production \
  PORT=3000 \
  DATA_DIR=/app/data \
  CONFIG_DIR=/app/config

EXPOSE 3000

# Health check
#HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
#  CMD wget -qO- http://localhost:3000/auth/me || exit 1

CMD ["node", "src/server.js"]
