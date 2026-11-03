# Build-Kontext ist das Repository-Root:
#   docker build -f stups/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
# baut den Server nach packages/server/dist und die Oberfläche nach packages/server/web
RUN pnpm -r build

FROM node:24-alpine
RUN npm install -g pnpm@12.16.1
WORKDIR /app
# Normale App oder Beta: das Image trägt den Kanal (siehe packages/server/src/channel.ts); die CI setzt ihn je Branch
ARG STUPS_CHANNEL=stable
# Die Version der App (für den Fuß der Einstellungen); die CI setzt sie aus config.yaml
ARG STUPS_VERSION=
ENV STUPS_CHANNEL=$STUPS_CHANNEL \
    STUPS_VERSION=$STUPS_VERSION \
    NODE_ENV=production \
    PORT=8099
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --prod --filter @stups/server
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/web packages/server/web
COPY packages/server/public packages/server/public
WORKDIR /app/packages/server
EXPOSE 8099
# /healthz ist ohne Anmeldung erreichbar; der Port kann mit STUPS_PORT geändert sein
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.STUPS_PORT||process.env.PORT||8099)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
