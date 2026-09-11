FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Prisma necesita OpenSSL en la imagen de ejecución/compilación.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Prisma 7 valida la existencia de DATABASE_URL al cargar prisma.config.ts.
# La URL de build es ficticia: durante la construcción solo generamos el cliente
# y compilamos Next.js. Las migraciones y el bootstrap se ejecutan al iniciar el
# contenedor, cuando ya existe una DATABASE_URL real.
ARG BUILD_DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN DATABASE_URL="$BUILD_DATABASE_URL" npm run db:generate \
    && DATABASE_URL="$BUILD_DATABASE_URL" npx next build \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:bootstrap && npx next start -p ${PORT}"]
