#!/bin/bash

export NVM_DIR=/root/.nvm
export PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

redis-server /etc/push-server/config/redis/redis.conf

node server.js --config /etc/configs/push-server-pub-9010.json &
node server.js --config /etc/configs/push-server-sub-8010.json &

tail -F /dev/null