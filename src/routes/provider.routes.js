import { Router } from "express";
import {
  getProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider
} from "../controllers/provider.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";

const router = Router();

// Public provider directory
router.get("/providers", getProviders);
router.get("/providers/:idOrSlug", getProviderById);

// Admin-only management endpoints
router.get("/admin/providers", authMiddleware, roleMiddleware("admin"), getProviders);
router.post("/admin/providers", authMiddleware, roleMiddleware("admin"), createProvider);
router.put("/admin/providers/:id", authMiddleware, roleMiddleware("admin"), updateProvider);
router.delete("/admin/providers/:id", authMiddleware, roleMiddleware("admin"), deleteProvider);

export default router;
