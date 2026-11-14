# SPDX-License-Identifier: AGPL-3.0-or-later
# Sparkcord WebTorrent tracker (peer-to-peer file sharing).
FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY server.mjs ./
USER node
EXPOSE 8000 8001
CMD ["node", "server.mjs"]
