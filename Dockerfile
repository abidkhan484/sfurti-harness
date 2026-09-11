FROM node:24.12.0-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Dhaka

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY src ./src
COPY docs/mission.md ./docs/mission.md

RUN mkdir -p /app/data /app/backups \
  && chown -R node:node /app

USER node

ENTRYPOINT ["node", "--env-file-if-exists=.env", "src/cli.ts"]
CMD ["doctor"]
