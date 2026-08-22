FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
RUN npm install
COPY backend ./backend
RUN npx prisma generate --schema backend/prisma/schema.prisma
EXPOSE 4000
CMD ["npm", "run", "start", "--workspace", "backend"]