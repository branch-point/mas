FROM node:9.9.0

RUN apt-get update && apt-get install -y \
  exiftran \
  && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_LOGLEVEL warn

MAINTAINER Ilkka Oksanen <iao@iki.fi>

COPY client /app/client/
WORKDIR /app/client/

RUN yarn install \
  && yarn run build  \
  && rm -fr node_modules tmp \
  && yarn cache clean

COPY server /app/server/
WORKDIR /app/server/

RUN yarn install --production \
  && yarn run prod \
  && yarn cache clean

RUN cd website \
  && yarn install \
  && yarn run prod \
  && rm -fr node_modules \
  && yarn cache clean

COPY newclient /app/newclient/
WORKDIR /app/newclient

RUN yarn install \
  && yarn run prod \
  && rm -fr node_modules \
  && yarn cache clean

WORKDIR /app/server/
