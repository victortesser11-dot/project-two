# Agente da obra. Funciona em Raspberry Pi (arm64) e em PC (amd64).
#   docker build -t agente-obra apps/agente
#   docker run -d --restart unless-stopped --name agente-obra \
#     -e AGENTE_TOKEN=obra_... -v agente-dados:/dados agente-obra
FROM node:22-alpine
RUN apk add --no-cache ffmpeg tzdata
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PASTA_DADOS=/dados NODE_ENV=production
RUN mkdir -p /dados && chown node:node /dados
VOLUME ["/dados"]
USER node
CMD ["node", "src/index.js"]
