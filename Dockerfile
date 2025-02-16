# Dockerfile de Medusa actualizado
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
ENV NODE_OPTIONS="--max_old_space_size=1024"
RUN yarn install
COPY . .
EXPOSE 9000
CMD sh -c "npx medusa migrations run && (npx medusa seed -f ./data/seed.json || true) && yarn run build:server && yarn run start"
