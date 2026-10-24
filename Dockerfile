FROM node:20-alpine
WORKDIR /app
COPY . .
# three.js и шрифт кладём в образ (если сеть недоступна, сервер подхватит их при запуске)
RUN node vendor.js; mkdir -p /data && chown -R node:node /app /data
ENV NODE_ENV=production DATA_DIR=/data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.js"]