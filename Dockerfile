FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/physics/package.json ./packages/physics/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production SERVER_HOST=0.0.0.0 SERVER_PORT=3000
ENV WEB_ORIGIN=http://localhost:3000 TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback
ENV DATABASE_URL=/app/data/prism-x.db
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
