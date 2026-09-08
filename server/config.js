const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DATA_DIRECTORY = "/var/lib/rpg-gps";

export function readServerConfig(environment = process.env) {
  return {
    host: nonEmptyText(environment.RPG_GPS_HOST, DEFAULT_HOST),
    port: portNumber(environment.RPG_GPS_PORT, DEFAULT_PORT),
    dataDirectory: nonEmptyText(
      environment.RPG_GPS_DATA_DIR,
      DEFAULT_DATA_DIRECTORY,
    ),
  };
}

function nonEmptyText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function portNumber(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError("RPG_GPS_PORT doit être un port valide.");
  }
  return port;
}
