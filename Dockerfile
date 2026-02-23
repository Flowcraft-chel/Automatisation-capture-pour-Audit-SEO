FROM mcr.microsoft.com/playwright/node:20-jammy

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Install Playwright browsers AND system dependencies (Critical for Railway 500 error)
RUN npx playwright install --with-deps chromium

# Copy the rest of the application
COPY . .

# Build the frontend
RUN npm run build

# Expose the application port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
