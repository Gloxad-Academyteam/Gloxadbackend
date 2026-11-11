import { Router } from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory
} from "../controllers/category.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";

const router = Router();

// Public route
router.get("/categories", getCategories);

// Admin-only management routes
router.post(
  "/admin/categories",
  authMiddleware,
  roleMiddleware("admin"),
  createCategory
);

router.put(
  "/admin/categories/:id",
  authMiddleware,
  roleMiddleware("admin"),
  updateCategory
);

router.put(
  "/admin/categories/:id/status",
  authMiddleware,
  roleMiddleware("admin"),
  updateCategoryStatus
);

router.delete(
  "/admin/categories/:id",
  authMiddleware,
  roleMiddleware("admin"),
  deleteCategory
);

export default router;
