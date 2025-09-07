# Dockerfile
FROM node:18

WORKDIR /app

COPY . .

RUN npm install

RUN npx prisma generate --schema=prisma/schema.prisma

EXPOSE 5000
CMD ["npm", "run", "dev"] 