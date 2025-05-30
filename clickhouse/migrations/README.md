## Clickhouse migrations

This directory keeps the record of migrations _manually_ for the records of
self-hosting users. At the time of writing, the migrations are not applied
automatically.

All the table definitions are in ../0010000-initial.sql. The file is copied
into /initdb.d, where it will be picked up **only** if clickhouse DB is empty.

This primarily exists as a reference for users who have pulled the repo
before the changes and want to apply these changes manually.
