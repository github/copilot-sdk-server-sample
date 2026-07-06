FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends rsync ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Source is bind-mounted in dev, but copy for production builds
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
