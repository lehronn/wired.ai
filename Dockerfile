# Use lightweight Node alpine image
FROM node:20-alpine

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
