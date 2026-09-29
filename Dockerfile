# Real, minimal production image — Node's built-in SQLite means zero npm dependencies.
FROM node:22-slim
WORKDIR /app
COPY . .
RUN rm -rf data/*.db* tests docs
VOLUME ["/app/data"]
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.mjs"]
