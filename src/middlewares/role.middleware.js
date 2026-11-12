export const roleGuard = (...allowedRoles) => {
  return (req, res, next) => {
    const isAllowed =
      req.user &&
      (allowedRoles.includes(req.user.role) ||
        (req.user.role === "admin" && allowedRoles.includes("instructor")));

    if (!isAllowed) {
      if (allowedRoles.includes("instructor")) {
        return res.status(403).json({
          error: "Access denied. Instructor role required",
        });
      }
      if (allowedRoles.includes("admin")) {
        return res.status(403).json({
          error: "Access denied. Admin role required",
        });
      }
      if (allowedRoles.includes("institution_admin")) {
        return res.status(403).json({
          error: "Access denied. Institution admin role required",
        });
      }
      return res.status(403).json({
        error: "Access forbidden: insufficient role permissions",
      });
    }
    next();
  };
};

/**
 * Course authoring is only for tutors an administrator has approved (architecture: Auth and Access Model).
 * Use after the role guard. A pending or rejected tutor can still sign in and apply, but cannot author.
 */
export const approvedTutorGuard = (req, res, next) => {
  if (req.user?.approvalStatus !== "approved") {
    const status = req.user?.approvalStatus ?? "pending";
    return res.status(403).json({
      error:
        status === "rejected"
          ? "Your tutor application was not approved, so you cannot create courses"
          : "Your tutor account is awaiting approval, so you cannot create courses yet",
      code: "TUTOR_NOT_APPROVED",
      approvalStatus: status,
    });
  }
  next();
};

export const roleMiddleware = roleGuard;
export default roleGuard;

