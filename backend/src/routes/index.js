import { Router } from "express";
import authRoutes from "./auth.js";
import organizationRoutes from "./organizations.js";
import projectRoutes from "./projects.js";
import queueRoutes from "./queues.js";
import jobRoutes from "./jobs.js";
import operationsRoutes from "./operations.js";

const router = Router();
router.use("/auth", authRoutes);
router.use("/organizations", organizationRoutes);
router.use("/projects", projectRoutes);
router.use("/queues", queueRoutes);
router.use("/jobs", jobRoutes);
router.use("/", operationsRoutes);

export default router;
