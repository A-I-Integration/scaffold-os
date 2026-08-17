# SCAFFOLD OS – Punktwolken-Worker
# Build:  docker build -t scaffold-punktwolke .
# Run:    docker run -d --name punktwolke --restart unless-stopped \
#           -e TENANTS='[{"name":"master","url":"https://XYZ.supabase.co","key":"SERVICE_ROLE_KEY"}]' \
#           -e POLL_INTERVAL=15 \
#           scaffold-punktwolke
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
# Keine externen Dependencies – Analyse ist reines Node.js (kein npm install nötig)
COPY analyse.js index.js ./

# Healthcheck: Prozess lebt?
HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "index.js"]
