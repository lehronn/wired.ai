# Use node-slim which is more compatible with diverse NPM packages than alpine
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies during build (Baked into the image!)
RUN npm install --omit=dev

# Copy app files
COPY . .

# Expose port
EXPOSE 8090

# Standard Direct Start
CMD ["node", "server.js"]
