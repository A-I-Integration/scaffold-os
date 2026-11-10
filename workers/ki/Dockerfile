FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache poppler-utils
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js .
COPY teile.js .
COPY ifc-rahmen.js ifc-lesen.js ifc-import.js ./
CMD ["node", "index.js"]
