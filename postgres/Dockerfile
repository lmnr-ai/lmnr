FROM postgres:latest

ARG POSTGRES_USER
ARG POSTGRES_PASSWORD
ARG POSTGRES_DB
ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV POSTGRES_DB=$POSTGRES_DB

COPY ./001000-roles.sql /docker-entrypoint-initdb.d/
COPY ./002000-initial.sql /docker-entrypoint-initdb.d/
COPY ./003000-prefill.sql /docker-entrypoint-initdb.d/
