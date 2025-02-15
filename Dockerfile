# Dockerfile de Medusa actualizado
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN yarn install
COPY . .
EXPOSE 9000
CMD sh -c "npx medusa migrations run && (npx medusa seed -f ./data/seed.json || true) && yarn run build:server && yarn run start"
