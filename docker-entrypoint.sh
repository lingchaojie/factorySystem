#!/bin/sh
set -e

npx prisma migrate deploy
npm run db:seed

exec "$@"
