#!/bin/sh
set -e

node /app/server/index.js &
NODE_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

trap "kill $NODE_PID $NGINX_PID; exit 0" TERM INT

wait $NGINX_PID
