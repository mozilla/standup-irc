FROM node:4.2.4

WORKDIR /app

# Install node requirements and clean up unneeded cache data
COPY package.json package.json
RUN npm install -d

# Finally copy in the app's source file
COPY . /app
