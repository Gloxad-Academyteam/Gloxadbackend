import { Notification } from "../models/Notification.model.js";

/**
 * Creates one in-app notification per recipient. A failed notification must never block the action that caused it,
 * so errors are swallowed here on purpose.
 */
export const notifyUsers = async (userIds, { title, message, type, link = null }) => {
  try {
    const recipients = [...new Set((userIds ?? []).map(String))];
    if (recipients.length === 0) return;
    await Notification.insertMany(recipients.map((recipient) => ({ recipient, title, message, type, link })));
  } catch {
    // Intentionally ignored
  }
};

export default notifyUsers;
