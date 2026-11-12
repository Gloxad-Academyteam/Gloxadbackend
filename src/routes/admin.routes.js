import { Router } from 'express';
import { authGuard } from '../middlewares/auth.middleware.js';
import { roleGuard } from '../middlewares/role.middleware.js';
import { getAnalytics, getLiveMetrics } from '../controllers/adminMetrics.controller.js';
import {
  getDashboardStatsController,
  getRecentRegistrationsController,
  getRecentTransactionsController,
  getUsersController,
  deactivateUserController,
  reactivateUserController,
  moderateTutorApprovalController,
  getPendingCoursesController,
  getAllCoursesController,
  moderateCourseStatusController,
  getAppealsController,
  moderateAppealStatusController,
  getFinanceMetricsController,
  broadcastNotificationController,
  getUserDetailsController,
  getAdminCourseDetailsController,
  getPlatformSettingsController,
  updatePlatformSettingsController,
  getAdminReviewsController,
  deleteAdminReviewController,
} from '../controllers/admin.controller.js';
import {
  listApplications,
  getApplicationDetail,
  updateApplication,
  approveApplication,
  rejectApplication,
  requestInfoApplication,
  resendInvite,
  downloadDocument,
  getPartnersOverview,
  getPartnersSummary,
  getPartnersGeo,
  getPartnersGrowth,
} from '../controllers/reviewer.controller.js';

const router = Router();

// Apply authGuard and roleGuard('admin') to all admin endpoints
router.use(authGuard, roleGuard('admin'));

router.get('/dashboard-stats', getDashboardStatsController);
router.get('/analytics', getAnalytics);
router.get('/live-metrics', getLiveMetrics);
router.get('/recent-registrations', getRecentRegistrationsController);
router.get('/recent-transactions', getRecentTransactionsController);

router.get('/users', getUsersController);
router.get('/users/:id', getUserDetailsController);
router.delete('/users/:id', deactivateUserController);
router.put('/users/:id/reactivate', reactivateUserController);
router.put('/tutors/:id/approval', moderateTutorApprovalController);

router.get('/courses/pending', getPendingCoursesController);
router.get('/courses/all', getAllCoursesController);
router.get('/courses/:id', getAdminCourseDetailsController);
router.put('/courses/:id/status', moderateCourseStatusController);

router.get('/appeals', getAppealsController);
router.put('/appeals/:id/status', moderateAppealStatusController);

router.get('/finance', getFinanceMetricsController);
router.post('/broadcast', broadcastNotificationController);

router.get('/settings', getPlatformSettingsController);
router.put('/settings', updatePlatformSettingsController);

router.get('/reviews', getAdminReviewsController);
router.delete('/reviews/:id', deleteAdminReviewController);

// Institution Partner Applications Reviewer Portal
router.get('/institution-applications', listApplications);
router.get('/institution-applications/:id', getApplicationDetail);
router.put('/institution-applications/:id', updateApplication);
router.post('/institution-applications/:id/approve', approveApplication);
router.post('/institution-applications/:id/reject', rejectApplication);
router.post('/institution-applications/:id/request-info', requestInfoApplication);
router.post('/institution-applications/:id/resend-invite', resendInvite);
router.get('/institution-applications/:id/documents/:docId/download', downloadDocument);

// Partner Analytics
router.get('/partners/overview', getPartnersOverview);
router.get('/partners/summary', getPartnersSummary);
router.get('/partners/geo', getPartnersGeo);
router.get('/partners/growth', getPartnersGrowth);

export default router;
