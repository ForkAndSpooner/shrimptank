FROM node:20-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/public ./public
EXPOSE 3001
ENV PORT=3001
CMD ["node", "src/index.js"]
