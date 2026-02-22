FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nx.json tsconfig.base.json jest.preset.js ./
COPY apps/api/ apps/api/
COPY libs/ libs/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm nx build api --configuration=production
RUN pnpm prisma generate --schema=apps/api/prisma/schema.prisma

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/api ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/prisma ./prisma
EXPOSE 3000
CMD ["node", "main.js"]
