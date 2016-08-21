FROM mhart/alpine-node

RUN apk add --no-cache make gcc g++ python icu-dev

COPY server /app

WORKDIR /app

RUN npm install

EXPOSE 3200

CMD ["npm", "run", "start-frontend"]
