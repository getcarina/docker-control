FROM node:4.4.0

WORKDIR /usr/src/app

COPY package.json /usr/src/app/

RUN npm install

COPY . /usr/src/app

ENV NODE_PORT=8080
EXPOSE 8080

CMD npm start
