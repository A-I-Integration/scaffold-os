# SCAFFOLD OS – Punktwolken-Worker
# Build:  docker build -t scaffold-punktwolke .
# Run:    docker run -d --name punktwolke --restart unless-stopped \
#           -e TENANTS='[{"name":"master","url":"https://XYZ.supabase.co","key":"SERVICE_ROLE_KEY"}]' \
#           -e POLL_INTERVAL=15 \
#           scaffold-punktwolke
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
# Einzige Abhängigkeit: laz-perf (WebAssembly zum Entpacken von LAZ-Dateien aus Drohnen-Software)
RUN npm install --omit=dev --no-audit --no-fund
COPY analyse.js las-laz.js ply-binary.js teile.js index.js ./

# Healthcheck: Prozess lebt?
HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "index.js"]
