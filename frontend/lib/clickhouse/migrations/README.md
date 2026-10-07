# Clickhouse migrations

Files in this folder execute using a community [package](https://www.npmjs.com/package/clickhouse-migrations) for clickhouse migrations.

Files execute in numeric order for all files ending with .sql in this directory (not nested).

`orig/` contains the contents of `1_squashed.sql` from the previous implementation.

## Warnings

- Migration 33 only moves 1 week's worth of data for the sake of execution speed. Users wishing to move more data are advised to manually move the rest of the data.

## Troubleshooting

If you get a blocking error from clickhouse migration saying that migration files must not be altered / removed after apply, you can use `clickhouse_client` and execute the following query:

```sql
ALTER TABLE _migrations DELETE WHERE version >= {offending_version_from_warning:UInt32};
```

This query is not recommended outside development environments and we take steps to prevent this from happening for regular users, not developers of Laminar. Take extra care with this query, as reapplying the same migration may cause unwanted side effects.
