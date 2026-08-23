import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import { openapi } from "./config/openapi.js";

const app = express();
const logPath = (req) =>
  req.originalUrl.split("?")[0].replace(/^\/api\/v1/, "") || "/";

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  morgan((tokens, req, res) =>
    `[API] ${tokens.method(req, res)} ${logPath(req)} → ${tokens.status(req, res)}`,
  ),
);
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 }));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapi));

app.use("/api/v1", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { service: "scheduler-api", status: "ok" } });
});

app.use((req, res) => {
  res
    .status(404)
    .json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${req.method} ${req.path} not found`,
      },
    });
});

app.use((error, req, res, _next) => {
  const status = error.statusCode || 500;
  const reason = error.expose ? error.message : error.code || "Internal server error";
  console.error(
    `[ERROR] ${req.method} ${logPath(req)} → ${status} | ${reason}`,
  );
  res.status(status).json({
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.expose ? error.message : "An unexpected error occurred",
    },
  });
});

const runningUnderNodeTest =
  process.argv.includes("--test") || process.env.RUN_DB_TESTS === "1";
if (env.nodeEnv !== "test" && !runningUnderNodeTest) {
  const port = env.port;
  app.listen(port, () =>
    console.log(`[API] Started on port ${port}`),
  );
}

export default app;
