FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js .
COPY teile.js .
CMD ["node", "index.js"]
