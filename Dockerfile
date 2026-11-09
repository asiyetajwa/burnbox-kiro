# Burn Box control app: the web app, the run API and the box runner.
# It never runs samples itself. It asks Docker (through a restricted socket proxy) for one
# throwaway box per run.
FROM docker:27-cli AS dockercli

FROM node:22-slim
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
COPY package.json ./
COPY server/src ./server/src
COPY web ./web
COPY samples ./samples
ENV NODE_ENV=production DATA_DIR=/app/data PORT=8080
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
CMD ["node", "server/src/index.ts"]
