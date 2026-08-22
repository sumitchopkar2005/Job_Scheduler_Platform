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

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));
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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
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
    console.log(`Scheduler API listening on port ${port}`),
  );
}

export default app;
