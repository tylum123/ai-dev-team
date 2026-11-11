FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production PORT=4310 BIND_ADDRESS=0.0.0.0
COPY --chown=node:node package.json core.js server.js runner.js workflow.js agents.js task-state.js provider-config.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node skills ./skills
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 4310
CMD ["node", "server.js"]
