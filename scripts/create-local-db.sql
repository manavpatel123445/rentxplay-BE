-- One-time local setup. Run as the postgres superuser (it asks for the password you set
-- when installing PostgreSQL):
--   /Library/PostgreSQL/19/bin/psql -U postgres -h localhost -f scripts/create-local-db.sql
--
-- Creates a login for the app and its database. Local development only: the password below
-- is not a secret and must never be used on Supabase or any shared server.

CREATE ROLE rentxplay WITH LOGIN PASSWORD 'rentxplay_local' CREATEDB;
CREATE DATABASE rentxplay OWNER rentxplay;

\connect rentxplay
-- Extensions the migrations need. These three are "trusted", so the app role could create
-- them itself, but creating them here keeps the first migration simple.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
