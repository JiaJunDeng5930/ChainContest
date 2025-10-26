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
RUN pnpm --filter @chaincontest/api-server build

FROM node:20-bullseye AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

COPY --from=builder /app ./

EXPOSE 4000
CMD ["pnpm", "--filter", "@chaincontest/api-server", "start", "--", "-H", "0.0.0.0", "-p", "4000"]
