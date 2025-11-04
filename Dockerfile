# Use a lightweight Node image
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source (including .env file)
COPY . .

# Define runtime environment
ENV NODE_ENV=production

# Expose the HTTP port (use PORT from .env, default to 6969)
EXPOSE 6969

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { \
      hostname: 'localhost', \
      port: process.env.PORT || 6969, \
      path: '/health', \
      timeout: 2000 \
    }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) { \
        process.exit(0); \
      } else { \
        process.exit(1); \
      } \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

# Start the server
CMD ["node", "index.js"]
