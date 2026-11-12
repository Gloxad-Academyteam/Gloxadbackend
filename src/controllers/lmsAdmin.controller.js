import { LmsCertificate } from "../models/LmsCertificate.model.js";
import { Enrollment } from "../models/Enrollment.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { Transaction } from "../models/Transaction.model.js";
import { checkS3Readiness } from "../utils/s3.js";
import mongoose from "mongoose";

/**
 * GET /api/lms/admin/analytics
 * Platform analytics: totalRevenue, enrollments, completionRate, platformHealth, enrollmentTrends
 */
export const getAdminAnalytics = async (req, res, next) => {
  try {
    // 1. Total Revenue calculation
    const revenueAgg = await Transaction.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    // 2. Total Enrollments (course enrollments + cohort student memberships)
    const [courseEnrollments, cohorts] = await Promise.all([
      Enrollment.countDocuments({ status: "active" }),
      Cohort.find({ status: { $ne: "archived" } }).select("studentIds"),
    ]);

    const cohortStudentCount = cohorts.reduce(
      (sum, c) => sum + (c.studentIds ? c.studentIds.length : 0),
      0
    );
    const totalEnrollments = courseEnrollments + cohortStudentCount;

    // 3. Completion Rate
    const [totalCompletedEnrollments, totalAllEnrollments] = await Promise.all([
      Enrollment.countDocuments({ isCompleted: true }),
      Enrollment.countDocuments(),
    ]);

    const completionRate =
      totalAllEnrollments > 0
        ? Math.round((totalCompletedEnrollments / totalAllEnrollments) * 100)
        : null; // No enrolments yet, so there is nothing to measure

    // 4. Platform Health Check
    const dbConnected = mongoose.connection.readyState === 1;
    const storageConnected = await checkS3Readiness();
    const isHealthy = dbConnected && storageConnected;

    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeFormatted = days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;

    // Only facts we can measure: how long this server has been up and whether its dependencies answer
    const platformHealth = {
      uptime: uptimeFormatted,
      uptimeSeconds,
      status: isHealthy ? "healthy" : "degraded",
      database: dbConnected ? "connected" : "disconnected",
      storage: storageConnected ? "connected" : "degraded",
      lastChecked: new Date(),
    };

    // 5. Enrollment trends: real enrolments per month for the last 6 months
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthly = await Enrollment.aggregate([
      { $match: { enrolledAt: { $gte: windowStart } } },
      { $group: { _id: { y: { $year: "$enrolledAt" }, m: { $month: "$enrolledAt" } }, count: { $sum: 1 } } },
    ]);
    const enrollmentTrends = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const found = monthly.find((row) => row._id.y === d.getFullYear() && row._id.m === d.getMonth() + 1);
      enrollmentTrends.push({ month: monthNames[d.getMonth()], year: d.getFullYear(), count: found ? found.count : 0 });
    }

    return res.status(200).json({
      totalRevenue,
      currency: "NGN",
      revenue: {
        total: totalRevenue,
        currency: "NGN",
      },
      enrollments: totalEnrollments,
      completionRate,
      platformHealth,
      enrollmentTrends,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/admin/certificates/recent
 * Recent certificate issuance audit feed
 */
export const getRecentCertificates = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [certificates, total] = await Promise.all([
      LmsCertificate.find()
        .populate("userId", "firstName lastName email avatarUrl avatar")
        .populate("courseId", "title thumbnail")
        .populate("cohortId", "name")
        .sort({ issuedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      LmsCertificate.countDocuments(),
    ]);

    return res.status(200).json({
      certificates,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAdminAnalytics,
  getRecentCertificates,
};
