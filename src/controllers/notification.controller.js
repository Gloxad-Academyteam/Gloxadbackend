import mongoose from "mongoose";
import { Notification } from "../models/Notification.model.js";
import { User } from "../models/User.model.js";

/**
 * 1. GET /api/notifications
 * Fetch notifications for authenticated user
 */
export const getNotificationsController = async (req, res, next) => {
  try {
    const { unreadOnly = "false", page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    // Every notification is stored once per person, so only ever match your own.
    // (Broadcasts also carry targetRole, which must not make them visible to everyone with that role.)
    const baseFilter = { recipient: req.user._id };

    const isUnreadOnly = unreadOnly === "true" || unreadOnly === true;
    const filter = isUnreadOnly ? { ...baseFilter, read: false } : baseFilter;

    const unreadCount = await Notification.countDocuments({
      ...baseFilter,
      read: false
    });

    const rawNotifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const notifications = rawNotifications.map((notif) => {
      const obj = notif.toObject ? notif.toObject() : notif;
      return {
        _id: obj._id.toString(),
        recipient: obj.recipient ? obj.recipient.toString() : null,
        targetRole: obj.targetRole || null,
        title: obj.title,
        message: obj.message,
        type: obj.type || "system_broadcast",
        read: obj.read,
        link: obj.link || null,
        createdAt: obj.createdAt
      };
    });

    const total = await Notification.countDocuments(filter);

    return res.status(200).json({
      notifications,
      unreadCount,
      total,
      page: pageNum,
      hasMore: skip + notifications.length < total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. POST /api/notifications/mark-read
 * Mark specified or all notifications as read
 */
export const markNotificationsReadController = async (req, res, next) => {
  try {
    const { notificationIds, markAll } = req.body;

    // Every notification is stored once per person, so only ever match your own.
    // (Broadcasts also carry targetRole, which must not make them visible to everyone with that role.)
    const baseFilter = { recipient: req.user._id };

    let updatedCount = 0;

    if (markAll === true) {
      const result = await Notification.updateMany(
        { ...baseFilter, read: false },
        { $set: { read: true } }
      );
      updatedCount = result.modifiedCount !== undefined ? result.modifiedCount : result.nModified || 0;
    } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      const validIds = notificationIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length > 0) {
        const result = await Notification.updateMany(
          { _id: { $in: validIds }, ...baseFilter },
          { $set: { read: true } }
        );
        updatedCount = result.modifiedCount !== undefined ? result.modifiedCount : result.nModified || 0;
      }
    }

    return res.status(200).json({
      message: "Notifications marked as read",
      updatedCount
    });
  } catch (error) {
    next(error);
  }
};

const ownedBy = (user) => ({ recipient: user._id });

/**
 * 3. POST /api/notifications/mark-unread
 * Put specific notifications back to unread
 */
export const markNotificationsUnreadController = async (req, res, next) => {
  try {
    const { notificationIds } = req.body;
    const validIds = Array.isArray(notificationIds) ? notificationIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) : [];
    if (validIds.length === 0) {
      return res.status(400).json({ error: "notificationIds must be a non-empty list of ids" });
    }
    const result = await Notification.updateMany({ _id: { $in: validIds }, ...ownedBy(req.user) }, { $set: { read: false } });
    return res.status(200).json({ message: "Notifications marked as unread", updatedCount: result.modifiedCount ?? 0 });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. DELETE /api/notifications/:id
 * Remove one of your own notifications
 */
export const deleteNotificationController = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid notification id" });
    }
    // Only notifications addressed to this person can be removed, never shared ones
    const result = await Notification.deleteOne({ _id: req.params.id, recipient: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }
    return res.status(200).json({ message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. GET /api/notifications/preferences
 */
export const getNotificationPreferencesController = async (req, res, next) => {
  try {
    return res.status(200).json({ preferences: { emailAlerts: Boolean(req.user.notificationPreferences?.emailAlerts) } });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. PUT /api/notifications/preferences
 * Body: { emailAlerts: boolean }
 */
export const updateNotificationPreferencesController = async (req, res, next) => {
  try {
    if (typeof req.body?.emailAlerts !== "boolean") {
      return res.status(400).json({ error: "emailAlerts must be true or false" });
    }
    await User.updateOne({ _id: req.user._id }, { $set: { "notificationPreferences.emailAlerts": req.body.emailAlerts } });
    return res.status(200).json({ preferences: { emailAlerts: req.body.emailAlerts } });
  } catch (error) {
    next(error);
  }
};
