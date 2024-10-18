FROM postgres:17

ARG POSTGRES_USER
ARG POSTGRES_PASSWORD
ARG POSTGRES_DB
ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV POSTGRES_DB=$POSTGRES_DB

COPY ./001000-roles.sql /docker-entrypoint-initdb.d/
COPY ./supabase/migrations/* /docker-entrypoint-initdb.d/
COPY ./data-prefill.sql /docker-entrypoint-initdb.d/
