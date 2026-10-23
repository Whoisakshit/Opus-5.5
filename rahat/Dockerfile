# Builds the web app and runs the sync server (Node 24 runs the TypeScript directly).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_CONTROL_ROOM_SMS=""
ENV VITE_CONTROL_ROOM_SMS=$VITE_CONTROL_ROOM_SMS
RUN npx vite build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY src/lib ./src/lib
USER node
EXPOSE 4124
CMD ["node", "server/server.ts"]
