
SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

CREATE ROLE "anon"
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN;
CREATE ROLE "authenticated"
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN;
CREATE ROLE "authenticator";
-- CREATE ROLE "postgres"
--     NOSUPERUSER CREATEDB NOCREATEROLE NOINHERIT LOGIN;

CREATE ROLE "service_role"
    SUPERUSER CREATEDB NOINHERIT LOGIN;

CREATE ROLE "supabase_admin"
    SUPERUSER CREATEDB NOINHERIT LOGIN;

ALTER ROLE "anon" SET "statement_timeout" TO '3s';

ALTER ROLE "authenticated" SET "statement_timeout" TO '8s';

ALTER ROLE "authenticator" SET "statement_timeout" TO '8s';

RESET ALL;
