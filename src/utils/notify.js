import { Notification } from "../models/Notification.model.js";
import { User } from "../models/User.model.js";
import { env } from "../config/env.js";
import { sendNotificationEmail } from "./email.js";

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

/** Emails a notification to the people in the list who turned email alerts on. Never throws. */
export const emailOptedInRecipients = async (userIds, { title, message, link = null }) => {
  try {
    const recipients = [...new Set((userIds ?? []).map(String))];
    if (recipients.length === 0) return;
    const people = await User.find({ _id: { $in: recipients }, "notificationPreferences.emailAlerts": true, isActive: { $ne: false } }).select("email firstName").lean();
    // FRONTEND_ORIGIN can list several sites (local ones too). Links in emails should use the public https one.
    const origins = (env.FRONTEND_ORIGIN || "").split(",").map((item) => item.trim()).filter(Boolean);
    const base = (origins.find((item) => item.startsWith("https://")) || origins[0] || "").replace(/\/$/, "");
    const url = link ? (link.startsWith("http") ? link : `${base}${link}`) : base ? `${base}/dashboard/notifications` : "";
    for (const person of people) {
      sendNotificationEmail({ to: person.email, name: person.firstName, title: escapeHtml(title), message: escapeHtml(message), url }).catch(() => undefined);
    }
  } catch {
    // Intentionally ignored
  }
};

/**
 * Creates one in-app notification per recipient. A failed notification must never block the action that caused it,
 * so errors are swallowed here on purpose.
 */
export const notifyUsers = async (userIds, { title, message, type, link = null }) => {
  try {
    const recipients = [...new Set((userIds ?? []).map(String))];
    if (recipients.length === 0) return;
    await Notification.insertMany(recipients.map((recipient) => ({ recipient, title, message, type, link })));
    emailOptedInRecipients(recipients, { title, message, link });
  } catch {
    // Intentionally ignored
  }
};

export default notifyUsers;
