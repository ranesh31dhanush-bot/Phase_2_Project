FROM node:22-alpine

# Set working directory
WORKDIR /usr/src/app

# Install dependencies first (layer caching)
COPY package*.json ./
# RUN npm ci --only=production
# RUN npm ci
RUN npm install

# Copy application source code
COPY . .

# Expose Express server port
EXPOSE 3000

# Default command starts the API server
CMD ["node", "server.js"]