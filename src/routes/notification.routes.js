import express from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import {
  getNotificationsController,
  markNotificationsReadController,
  markNotificationsUnreadController,
  deleteNotificationController,
  getNotificationPreferencesController,
  updateNotificationPreferencesController,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.get("/", authGuard, getNotificationsController);
router.post("/mark-read", authGuard, markNotificationsReadController);
router.post("/mark-unread", authGuard, markNotificationsUnreadController);
router.get("/preferences", authGuard, getNotificationPreferencesController);
router.put("/preferences", authGuard, updateNotificationPreferencesController);
router.delete("/:id", authGuard, deleteNotificationController);

export default router;
