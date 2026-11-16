FROM oven/bun:1.4
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
ENV NODE_ENV=production
USER bun
EXPOSE 3000
CMD ["bun", "src/server/index.ts"]
