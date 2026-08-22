import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const comparePassword = (password, hash) =>
  bcrypt.compare(password, hash);

export const createAccessToken = (user) =>
  jwt.sign({ sub: user.id, tv: user.tokenVersion }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    issuer: "distributed-job-scheduler",
    audience: "scheduler-api",
    algorithm: "HS256",
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwtSecret, {
    algorithms: ["HS256"],
    issuer: "distributed-job-scheduler",
    audience: "scheduler-api",
  });
