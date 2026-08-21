FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY test ./test
RUN npm test
ENV NODE_ENV=production
EXPOSE 4310
CMD ["node", "src/server.cjs"]
