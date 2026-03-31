# Use lightweight Node alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy entrypoint for auto-healing dependencies
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Install dependencies during build (for faster initial run)
RUN npm install --omit=dev

# Copy app files
COPY . .

# Expose port
EXPOSE 8090

# Run the server with auto-healer entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "start"]
