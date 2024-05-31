FROM node:18.15-bullseye

# Create app directory
WORKDIR /usr/src/app

# Copy package json files
COPY package*.json ./

# Install node_modules
RUN npm install 

# Bundle app source
COPY . .

# Install kubernetes
RUN apt -y update
RUN apt -y install ca-certificates curl
RUN apt -y install apt-transport-https
RUN apt -y install kubernetes-client

# SSH
# RUN apt update
#RUN apt -y install openssh-server
#RUN ssh-keygen -t ed25519 -f /root/id_ed25519_krisalee-control -N ''

EXPOSE 3000

#run the project
CMD [ "npm", "run", "start:dev" ]
