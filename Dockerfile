FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=./data/app.sqlite

WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001
CMD ["npm", "run", "start"]
