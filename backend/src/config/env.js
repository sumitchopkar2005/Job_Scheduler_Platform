import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.env",
  ),
});

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret =
  process.env.JWT_SECRET ||
  (nodeEnv === "production"
    ? ""
    : "local-development-secret-not-for-production-please-change");
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "1d";
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

if (nodeEnv === "production" && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error(
    "JWT_SECRET must be configured with at least 32 characters in production",
  );
}
if (!/^https?:\/\/[^\s/]+(?::\d+)?$/.test(corsOrigin)) {
  throw new Error("CORS_ORIGIN must be a single http(s) origin");
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  jwtExpiresIn,
  corsOrigin,
};
