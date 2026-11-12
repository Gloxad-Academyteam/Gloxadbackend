import { ActivityLog } from "../models/ActivityLog.model.js";
import { recordRequest } from "../utils/traffic.js";

const OBJECT_ID = /[0-9a-f]{24}/gi;

// [method, path pattern, label, category]. First match wins. Paths have ids already replaced with :id
const RULES = [
  ["POST", /^\/api\/auth\/signin$/, "Signed in", "auth"],
  ["POST", /^\/api\/auth\/signup$/, "Created an account", "auth"],
  ["POST", /^\/api\/auth\/logout$/, "Signed out", "auth"],
  ["POST", /^\/api\/auth\/forgot/, "Asked for a password reset", "auth"],
  ["POST", /^\/api\/auth\/reset/, "Reset a password", "auth"],
  ["POST", /^\/api\/auth\/verify/, "Verified an email address", "auth"],
  ["POST", /^\/api\/auth\/resend/, "Asked for a new verification code", "auth"],
  ["PUT|PATCH", /^\/api\/auth\/(profile|me)/, "Updated a profile", "auth"],
  ["PUT|PATCH|POST", /^\/api\/auth\/password/, "Changed a password", "auth"],
  ["PUT", /^\/api\/admin\/tutors\/:id\/approval$/, "Reviewed a tutor application", "admin"],
  ["PUT", /^\/api\/admin\/courses\/:id\/status$/, "Reviewed a course", "admin"],
  ["PUT", /^\/api\/admin\/appeals\/:id\/status$/, "Resolved an appeal", "admin"],
  ["DELETE", /^\/api\/admin\/users\/:id$/, "Deactivated an account", "admin"],
  ["PUT", /^\/api\/admin\/users\/:id\/reactivate$/, "Reactivated an account", "admin"],
  ["PUT", /^\/api\/admin\/settings$/, "Changed platform settings", "admin"],
  ["POST", /^\/api\/admin\/broadcast$/, "Sent a broadcast", "admin"],
  ["DELETE", /^\/api\/admin\/reviews\/:id$/, "Deleted a review", "admin"],
  ["POST", /^\/api\/lms\/admin\//, "Made an admin change in the programme", "admin"],
  ["PUT|PATCH|DELETE", /^\/api\/lms\/admin\//, "Changed something in the programme", "admin"],
  ["POST", /^\/api\/courses$/, "Created a course", "course"],
  ["PUT|PATCH", /^\/api\/courses\/:id$/, "Edited a course", "course"],
  ["DELETE", /^\/api\/courses\/:id$/, "Deleted a course", "course"],
  ["POST", /^\/api\/courses\/:id\/submit/, "Submitted a course for review", "course"],
  ["POST", /^\/api\/(courses|reviews)\/:id\/reviews?$/, "Left a review", "course"],
  ["POST", /^\/api\/enrollments?/, "Enrolled in a course", "learning"],
  ["POST", /^\/api\/(payments?|checkout)/, "Started a payment", "payment"],
  ["POST", /^\/api\/webhooks?\//, "Payment provider notification", "payment"],
  ["POST", /^\/api\/learning\/:id\/quiz\/:id\/submit$/, "Submitted a quiz", "learning"],
  ["POST|PUT", /^\/api\/learning\//, "Learning progress saved", "learning"],
  ["POST", /^\/api\/lms\/.*\/(join|token)/, "Joined a live class", "live"],
  ["POST|PUT|PATCH|DELETE", /^\/api\/lms\/(sessions|live)/, "Changed a live class", "live"],
  ["POST", /^\/api\/lms\/.*scholarship/i, "Scholarship application activity", "tutor"],
  ["POST|PUT|PATCH|DELETE", /^\/api\/lms\//, "Programme activity", "learning"],
  ["POST", /^\/api\/(messages|conversations)/, "Sent a message", "message"],
  ["POST|PUT|PATCH|DELETE", /^\/api\/notifications/, "Updated notifications", "message"],
  ["POST|PUT|PATCH|DELETE", /^\/api\/upload/, "Uploaded a file", "course"],
  ["POST|PUT|PATCH|DELETE", /^\/api\/(tutor|tutors)/, "Tutor activity", "tutor"],
  ["POST|PUT|PATCH|DELETE", /^\/api\/institution/, "Institution activity", "institution"],
];

const SKIP = /^\/api\/(health|admin\/(live-metrics|analytics|activity))/;
const NOISY = /(heartbeat|presence|ping|typing)/i;

const describe = (method, path) => {
  for (const [methods, pattern, label, category] of RULES) {
    if (methods.split("|").includes(method) && pattern.test(path)) return { label, category };
  }
  const verb = { POST: "Created", PUT: "Updated", PATCH: "Updated", DELETE: "Deleted", GET: "Opened" }[method] || method;
  return { label: `${verb} ${path.replace(/^\/api\//, "").replace(/\/:id/g, "")}`.trim(), category: "other" };
};

const clientIp = (req) => (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || req.socket?.remoteAddress || "";

/**
 * Records what happens on the API. It writes after the response is sent, so it never slows a request down.
 * Logged: every sign-in and sign-up, every change (POST, PUT, PATCH, DELETE) and every failed request.
 * Not logged: successful reads, which would drown out everything else.
 */
export const activityLogger = (req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    try {
      const url = (req.originalUrl || req.url || "").split("?")[0];
      if (!url.startsWith("/api")) return;
      recordRequest(res.statusCode);
      if (SKIP.test(url) || NOISY.test(url)) return;

      const isAuthRoute = /^\/api\/auth\/(signin|signup)$/.test(url);
      const isChange = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
      const failed = res.statusCode >= 400;
      if (!isChange && !failed) return;
      if (req.method === "OPTIONS") return;

      const ids = url.match(OBJECT_ID) || [];
      const path = url.replace(OBJECT_ID, ":id");
      const { label, category } = describe(req.method, path);
      const user = req.user;
      const attemptedEmail = isAuthRoute && typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 120) : "";

      ActivityLog.create({
        label: failed ? `${label} (failed)` : label,
        category,
        method: req.method,
        path,
        status: res.statusCode,
        ok: !failed,
        durationMs: Date.now() - startedAt,
        actorId: user?._id || null,
        actorName: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "",
        actorEmail: user?.email || attemptedEmail,
        actorRole: user?.role || "",
        targetId: ids[0] || "",
        ip: clientIp(req).slice(0, 64),
        userAgent: (req.headers["user-agent"] || "").slice(0, 200),
      }).catch(() => undefined);
    } catch {
      // Logging must never break a request
    }
  });
  next();
};

export default activityLogger;
