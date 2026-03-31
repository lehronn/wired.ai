# Use lightweight Node alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy app files
COPY . .

# Expose port
EXPOSE 8090

# Run the server
CMD ["npm", "start"]
