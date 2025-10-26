FROM node:20-bullseye AS builder

WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
COPY specs ./specs
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chaincontest/indexer-event build

FROM node:20-bullseye AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

COPY --from=builder /app ./

EXPOSE 4005
CMD ["pnpm", "--filter", "@chaincontest/indexer-event", "start"]
