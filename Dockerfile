FROM node:22.15-alpine3.21 AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY prisma ./prisma
COPY src ./src
COPY test ./test
COPY tsconfig.json tsconfig.build.json eslint.config.mjs nest-cli.json .prettierrc ./
RUN pnpm db:generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json pnpm-workspace.yaml .nvmrc ./
RUN chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "pnpm db:migrate:deploy && node dist/main"]
