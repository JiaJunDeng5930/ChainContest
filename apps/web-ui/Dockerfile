FROM node:20-bullseye

WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
COPY specs ./specs
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile && pnpm --filter @chaincontest/shared-i18n build

EXPOSE 3000
CMD ["pnpm", "--filter", "@chaincontest/web-ui", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]
