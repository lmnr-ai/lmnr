# Clickhouse Migrations

This directory contains the list of clickhouse migrations indexed starting
from 0000-<name>.sql with incrementing 4 digit index in the beginning.

If the migration is called 000N-squashed.sql it means that all the
migrations between the previous -squashed.sql and 000N-squashed.sql
have been squashed.

## Why squash the migrations?

Even though we do `IF NOT EXISTS` or `IF EXISTS` as appropriate on the migrations, sometimes it
- is still painfully slow
- not completely idempotent and throws scary errors to console

## Can I look at the unsquashed original migration view?

Yes! When we squash migrations, we move the original migration files to the `orig/` directory here.