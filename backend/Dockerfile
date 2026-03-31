FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "node src/db/seed.js && node src/index.js"]
