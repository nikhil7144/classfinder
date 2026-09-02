# Two stages so the shipped image carries no toolchain and no dev deps.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Overridden by the platform on most hosts; the default matches .env.example.
ENV PORT=4000
EXPOSE 4000

# Not root. The process needs to read its own files and nothing else.
USER node

CMD ["node", "dist/main"]
