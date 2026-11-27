export interface DatabaseConfig {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

const decode = (value: string, what: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`Invalid database URL. Cannot decode ${what}`);
  }
};

// Parse DATABASE_URL (postgres:// or postgresql://) into connection parameters.
// Credentials are percent-decoded, the port is optional (defaults to 5432), and a
// bracketed IPv6 host is returned without the brackets. Query options are ignored.
export const parseDatabaseUrl = (url: string): DatabaseConfig => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid database URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Invalid database URL");
  }

  const username = decode(parsed.username, "username") || "postgres";
  const password = decode(parsed.password, "password");
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const database = decode(parsed.pathname.replace(/^\//, ""), "database name") || username;

  if (!password) {
    throw new Error("Invalid database URL. Cannot find password");
  }
  if (!host) {
    throw new Error("Invalid database URL. Cannot find host");
  }

  return {
    username,
    password,
    host,
    port,
    database,
  };
};
