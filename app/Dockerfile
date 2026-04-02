FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends rsync && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (postinstall needs scripts/)
COPY package.json package-lock.json* ./
COPY scripts ./scripts
RUN npm install

# Source is bind-mounted in dev, but copy for production builds
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
