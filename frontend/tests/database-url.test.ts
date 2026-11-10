import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDatabaseUrl } from "@/lib/db/database-url";

describe("parseDatabaseUrl", () => {
  it("parses a full URL with either scheme", () => {
    for (const scheme of ["postgres", "postgresql"]) {
      assert.deepEqual(parseDatabaseUrl(`${scheme}://alice:secret@db.example:6432/lmnr`), {
        username: "alice",
        password: "secret",
        host: "db.example",
        port: 6432,
        database: "lmnr",
      });
    }
  });

  it("defaults the port to 5432 when it is omitted", () => {
    assert.equal(parseDatabaseUrl("postgresql://alice:secret@db.example/lmnr").port, 5432);
    assert.equal(parseDatabaseUrl("postgresql://alice:secret@db.example:/lmnr").port, 5432);
  });

  it("percent-decodes the credentials and database name", () => {
    const config = parseDatabaseUrl("postgresql://al%40ice:p%40ss%3Aword%2F@db.example:5432/my%20db");
    assert.equal(config.username, "al@ice");
    assert.equal(config.password, "p@ss:word/");
    assert.equal(config.database, "my db");
  });

  it("returns a bracketed IPv6 host without the brackets", () => {
    const config = parseDatabaseUrl("postgresql://alice:secret@[2001:db8::1]:5432/lmnr");
    assert.equal(config.host, "2001:db8::1");
    assert.equal(config.port, 5432);
  });

  it("keeps query options out of the database name", () => {
    assert.equal(parseDatabaseUrl("postgresql://alice:secret@db.example:5432/lmnr?sslmode=require").database, "lmnr");
  });

  it("defaults the database to the username", () => {
    assert.equal(parseDatabaseUrl("postgresql://alice:secret@db.example:5432").database, "alice");
  });

  it("rejects invalid URLs", () => {
    assert.throws(() => parseDatabaseUrl("not a url"), /Invalid database URL/);
    assert.throws(() => parseDatabaseUrl("mysql://alice:secret@db.example/lmnr"), /Invalid database URL/);
    assert.throws(() => parseDatabaseUrl("postgresql://alice@db.example/lmnr"), /Cannot find password/);
    assert.throws(() => parseDatabaseUrl("postgresql://alice:%zz@db.example/lmnr"), /Cannot decode password/);
  });
});
