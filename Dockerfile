FROM node:20-slim

# Install latest chrome dev package and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this installs the necessary libs to make the bundled version of Chromium that Puppeteer
# installs, work.
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip installing Chrome/Chromium. We'll execute the installed Chrome.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# Copy package and lock file
COPY package*.json ./

# Prevent Prisma from automatically generating during npm install
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

# Install dependencies, including dev dependencies for Prisma
RUN npm ci

# Copy the rest of the application
COPY . .

# Generate Prisma Client (Dummy DATABASE_URL so Prisma CLI doesn't crash during build)
RUN DATABASE_URL="postgresql://dummy:password@localhost:5432/dummy" npx prisma generate --schema=src/prisma/schema.prisma

EXPOSE 3000

# Start: apply schema changes (skip-generate since we generated at build time), then start server
# Use || true so that if db push fails (e.g. schema already up to date), npm start still runs
CMD ["sh", "-c", "npx prisma db push --schema=src/prisma/schema.prisma --skip-generate --accept-data-loss || true; npm start"]
