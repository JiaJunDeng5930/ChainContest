FROM node:20-bullseye AS builder

WORKDIR /app
ENV NODE_ENV=development
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY contracts ./contracts
COPY tools ./tools
COPY specs ./specs
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chaincontest/contracts build

FROM node:20-bullseye AS runner

WORKDIR /app
ENV NODE_ENV=development
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

COPY --from=builder /app ./

EXPOSE 8545
CMD ["pnpm", "--filter", "@chaincontest/contracts", "exec", "hardhat", "node", "--hostname", "0.0.0.0", "--port", "8545"]
