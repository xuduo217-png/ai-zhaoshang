FROM node:20-bookworm-slim

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8765
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js portal-service.js ./
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 8765
VOLUME ["/app/data"]
CMD ["node", "server.js"]
