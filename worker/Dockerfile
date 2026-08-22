FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY worker/package.json worker/package.json
COPY backend/package.json backend/package.json
RUN npm install
COPY worker ./worker
COPY backend/prisma ./backend/prisma
RUN npx prisma generate --schema backend/prisma/schema.prisma
CMD ["npm", "run", "start", "--workspace", "worker"]