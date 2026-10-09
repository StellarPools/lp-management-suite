FROM node:20-alpine

WORKDIR /app

# Copy keeper package files
COPY package.json tsconfig.json ./

# Copy SDK source (referenced as a local file: dependency)
COPY ../sdk /sdk

RUN npm install --omit=dev

# Copy keeper source
COPY src/ ./src/

RUN npm run build

# The keeper process runs as a non-root user for security.
RUN addgroup -S keeper && adduser -S keeper -G keeper
USER keeper

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
