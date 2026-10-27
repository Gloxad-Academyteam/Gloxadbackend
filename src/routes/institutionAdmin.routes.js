import { Router } from "express";
import {
  getInstitutionMe,
  updateBranding,
} from "../controllers/institutionAdmin.controller.js";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/department.controller.js";
import {
  getMembers,
  addMember,
  importMembers,
  getMemberTemplate,
  resendInvite,
  deleteMember,
} from "../controllers/member.controller.js";
import {
  createCheckout,
  getSubscription,
} from "../controllers/subscription.controller.js";
import { getInstitutionDashboard } from "../controllers/institutionDashboard.controller.js";
import { memberInviteLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

// 1. Workspace Profile & Onboarding Resume
router.get("/", getInstitutionMe);
router.put("/branding", updateBranding);

// 2. Multi-Tenant Department Management (Step 2)
router.get("/departments", getDepartments);
router.post("/departments", createDepartment);
router.put("/departments/:id", updateDepartment);
router.delete("/departments/:id", deleteDepartment);

// 3. Member Roster Management (Step 3 & 4)
router.get("/members/template", getMemberTemplate);
router.get("/members", getMembers);
router.post("/members", addMember);
router.post("/members/import", importMembers);
router.post("/members/:id/invite", memberInviteLimiter, resendInvite);
router.delete("/members/:id", deleteMember);

// 4. Paystack Subscription & Billing (Step 5)
router.post("/subscription/checkout", createCheckout);
router.get("/subscription", getSubscription);

// 5. Institution Dashboard Analytics
router.get("/dashboard", getInstitutionDashboard);

export default router;
