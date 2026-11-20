FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --ignore-scripts

COPY src ./src
COPY data ./data

RUN npm run build

ENTRYPOINT ["node", "dist/index.js"]
