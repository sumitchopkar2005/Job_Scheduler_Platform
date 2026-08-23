import { after } from "node:test";
import { prisma } from "../src/db.js";
import { redis } from "../src/redis.js";

after(async () => {
  redis.disconnect();
  await prisma.$disconnect();
});