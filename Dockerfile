# ---- build stage ----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Copy manifests first so the dependency layer caches across source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime stage --------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 8080
USER node

# dist/server.cjs bundles the server; runtime deps stay external and come from
# node_modules above. Vite is a devDependency and is never loaded here.
CMD ["node", "dist/server.cjs"]
