import mongoose from "mongoose";
import User from "../models/User.model.js";
import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import Transaction from "../models/Transaction.model.js";
import Appeal from "../models/Appeal.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { CohortEnrolment } from "../models/CohortEnrolment.model.js";
import { ScholarshipApplication } from "../models/ScholarshipApplication.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsCertificate } from "../models/LmsCertificate.model.js";
import { presenceSummary } from "../utils/presence.js";
import { getLiveRoomCount } from "../socket/live.handler.js";

// Nigeria has no daylight saving, so days are cut at UTC+1
const TZ = "Africa/Lagos";
const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const watParts = (date) => {
  const shifted = new Date(date.getTime() + WAT_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
};
const startOfWatDay = (date) => {
  const { y, m, d } = watParts(date);
  return new Date(Date.UTC(y, m, d) - WAT_OFFSET_MS);
};

// Every bucket in the range, so quiet days show as zero instead of disappearing
const buildBuckets = (days, bucket) => {
  const buckets = [];
  const today = startOfWatDay(new Date());
  if (bucket === "month") {
    const { y, m } = watParts(today);
    for (let i = 11; i >= 0; i -= 1) {
      const index = m - i;
      const year = y + Math.floor(index / 12);
      const month = ((index % 12) + 12) % 12;
      buckets.push({ key: `${year}-${String(month + 1).padStart(2, "0")}`, label: MONTHS[month] });
    }
  } else {
    for (let i = days - 1; i >= 0; i -= 1) {
      const { y, m, d } = watParts(new Date(today.getTime() - i * DAY_MS));
      buckets.push({ key: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, label: `${d} ${MONTHS[m]}` });
    }
  }
  return buckets;
};

const groupByBucket = (dateField, bucket, extra = {}) => ({
  _id: { $dateToString: { format: bucket === "month" ? "%Y-%m" : "%Y-%m-%d", date: dateField, timezone: TZ } },
  count: { $sum: 1 },
  ...extra,
});

const fillSeries = (buckets, rows, pick) => {
  const byKey = new Map(rows.map((row) => [row._id, row]));
  return buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, ...pick(byKey.get(bucket.key)) }));
};

const sumRevenue = async (match) => {
  const [row] = await Transaction.aggregate([
    { $match: { status: "success", ...match } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: row?.total || 0, count: row?.count || 0 };
};

const pct = (current, previous) => {
  if (!previous) return current > 0 ? null : 0; // null means "new, nothing to compare with"
  return Math.round(((current - previous) / previous) * 100);
};

/**
 * GET /api/admin/analytics?days=7|30|90|365
 * Real platform analytics. Every number comes from the database; nothing is estimated.
 */
export const getAnalytics = async (req, res, next) => {
  try {
    const requested = Number(req.query.days);
    const days = [7, 30, 90, 365].includes(requested) ? requested : 30;
    const bucket = days === 365 ? "month" : "day";
    const buckets = buildBuckets(days, bucket);

    const now = new Date();
    const from = bucket === "month" ? new Date(Date.UTC(Number(buckets[0].key.slice(0, 4)), Number(buckets[0].key.slice(5)) - 1, 1) - WAT_OFFSET_MS) : startOfWatDay(new Date(now.getTime() - (days - 1) * DAY_MS));
    const previousFrom = new Date(from.getTime() - (now.getTime() - from.getTime()));
    const activeSince = new Date(now.getTime() - 30 * DAY_MS);

    const [
      totalUsers,
      totalStudents,
      totalTutors,
      courseStatusRows,
      newUsers,
      previousNewUsers,
      revenue,
      previousRevenue,
      revenueAllTime,
      enrolmentsInRange,
      previousEnrolments,
      totalEnrolments,
      completedEnrolments,
      signupRows,
      revenueRows,
      enrolmentRows,
      activeRows,
      topCourseRows,
      topTutorRows,
      tutorCourseCounts,
      cohortEnrolmentRows,
      scholarshipRows,
      certificatesIssued,
      sessionsHeld,
      cohortsRunning,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "instructor" }),
      Course.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      User.countDocuments({ createdAt: { $gte: from } }),
      User.countDocuments({ createdAt: { $gte: previousFrom, $lt: from } }),
      sumRevenue({ createdAt: { $gte: from } }),
      sumRevenue({ createdAt: { $gte: previousFrom, $lt: from } }),
      sumRevenue({}),
      Enrollment.countDocuments({ enrolledAt: { $gte: from } }),
      Enrollment.countDocuments({ enrolledAt: { $gte: previousFrom, $lt: from } }),
      Enrollment.countDocuments(),
      Enrollment.countDocuments({ isCompleted: true }),
      User.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: groupByBucket("$createdAt", bucket, { students: { $sum: { $cond: [{ $eq: ["$role", "student"] }, 1, 0] } }, tutors: { $sum: { $cond: [{ $eq: ["$role", "instructor"] }, 1, 0] } } }) },
      ]),
      Transaction.aggregate([
        { $match: { status: "success", createdAt: { $gte: from } } },
        { $group: groupByBucket("$createdAt", bucket, { value: { $sum: "$amount" } }) },
      ]),
      Enrollment.aggregate([
        { $match: { enrolledAt: { $gte: from } } },
        { $group: groupByBucket("$enrolledAt", bucket) },
      ]),
      User.aggregate([
        { $match: { role: { $in: ["student", "instructor"] }, isActive: { $ne: false } } },
        { $group: { _id: { role: "$role", active: { $cond: [{ $gte: ["$lastLoginAt", activeSince] }, true, false] } }, count: { $sum: 1 } } },
      ]),
      Enrollment.aggregate([
        { $group: { _id: "$course", enrolments: { $sum: 1 } } },
        { $sort: { enrolments: -1 } },
        { $limit: 5 },
        { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } },
        { $unwind: "$course" },
        { $project: { _id: 0, id: "$_id", title: "$course.title", enrolments: 1 } },
      ]),
      Enrollment.aggregate([
        { $lookup: { from: "courses", localField: "course", foreignField: "_id", as: "course" } },
        { $unwind: "$course" },
        { $group: { _id: "$course.instructor", students: { $sum: 1 } } },
        { $sort: { students: -1 } },
        { $limit: 5 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "tutor" } },
        { $unwind: "$tutor" },
        { $project: { _id: 0, id: "$_id", students: 1, firstName: "$tutor.firstName", lastName: "$tutor.lastName", avatar: { $ifNull: ["$tutor.avatarUrl", "$tutor.avatar"] } } },
      ]),
      Course.aggregate([{ $group: { _id: "$instructor", courses: { $sum: 1 } } }]),
      CohortEnrolment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ScholarshipApplication.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      LmsCertificate.countDocuments(),
      LmsLiveSession.countDocuments({ status: "ended", startsAt: { $gte: from } }),
      Cohort.countDocuments({ status: { $nin: ["archived", "completed"] } }),
    ]);

    // Revenue per course for the top list (all time)
    const revenueByCourse = await Transaction.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: "$course", revenue: { $sum: "$amount" } } },
    ]);
    const revenueMap = new Map(revenueByCourse.map((row) => [String(row._id), row.revenue]));
    const courseCountMap = new Map(tutorCourseCounts.map((row) => [String(row._id), row.courses]));

    const engagement = { activeStudents: 0, passiveStudents: 0, activeTutors: 0, passiveTutors: 0, windowDays: 30 };
    for (const row of activeRows) {
      const key = `${row._id.active ? "active" : "passive"}${row._id.role === "student" ? "Students" : "Tutors"}`;
      engagement[key] += row.count;
    }

    const statusCounts = (rows) => Object.fromEntries(rows.map((row) => [row._id || "unknown", row.count]));

    return res.status(200).json({
      range: { days, bucket, from, to: now },
      totals: {
        users: totalUsers,
        students: totalStudents,
        tutors: totalTutors,
        enrolments: totalEnrolments,
        revenueAllTime: revenueAllTime.total,
        // null when nobody has enrolled yet, instead of an invented figure
        completionRate: totalEnrolments > 0 ? Math.round((completedEnrolments / totalEnrolments) * 100) : null,
        certificatesIssued,
        sessionsHeld,
        cohortsRunning,
      },
      period: {
        newUsers,
        newUsersChange: pct(newUsers, previousNewUsers),
        revenue: revenue.total,
        revenueChange: pct(revenue.total, previousRevenue.total),
        transactions: revenue.count,
        enrolments: enrolmentsInRange,
        enrolmentsChange: pct(enrolmentsInRange, previousEnrolments),
      },
      series: {
        signups: fillSeries(buckets, signupRows, (row) => ({ students: row?.students || 0, tutors: row?.tutors || 0, total: row?.count || 0 })),
        revenue: fillSeries(buckets, revenueRows, (row) => ({ value: row?.value || 0, transactions: row?.count || 0 })),
        enrolments: fillSeries(buckets, enrolmentRows, (row) => ({ value: row?.count || 0 })),
      },
      engagement,
      courseStatus: statusCounts(courseStatusRows),
      topCourses: topCourseRows.map((row) => ({ ...row, id: String(row.id), revenue: revenueMap.get(String(row.id)) || 0 })),
      topTutors: topTutorRows.map((row) => ({
        id: String(row.id),
        name: [row.firstName, row.lastName].filter(Boolean).join(" "),
        avatar: row.avatar || "",
        students: row.students,
        courses: courseCountMap.get(String(row.id)) || 0,
      })),
      programme: {
        enrolmentsByStatus: statusCounts(cohortEnrolmentRows),
        scholarshipApplicationsByStatus: statusCounts(scholarshipRows),
      },
    });
  } catch (error) {
    next(error);
  }
};

const ROLE_WORDS = { student: "a student", instructor: "a tutor", admin: "an admin", institution_admin: "an institution admin" };

const describeActivity = {
  user: (u) => ({ type: "signup", text: `${[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email} joined as ${ROLE_WORDS[u.role] || "a member"}`, at: u.createdAt }),
  enrolment: (e) => ({ type: "enrolment", text: `${[e.user?.firstName, e.user?.lastName].filter(Boolean).join(" ") || "A learner"} enrolled in ${e.course?.title || "a course"}`, at: e.enrolledAt || e.createdAt }),
  payment: (t) => ({ type: "payment", text: `₦${(t.amount || 0).toLocaleString()} paid for ${t.course?.title || "a course"}`, at: t.createdAt }),
  scholarship: (a) => ({ type: "scholarship", text: `${[a.userId?.firstName, a.userId?.lastName].filter(Boolean).join(" ") || "Someone"} applied for a scholarship`, at: a.submittedAt }),
  certificate: (c) => ({ type: "certificate", text: `Certificate issued to ${[c.userId?.firstName, c.userId?.lastName].filter(Boolean).join(" ") || "a learner"}`, at: c.issuedAt }),
};

/**
 * GET /api/admin/live-metrics
 * What is happening right now. The admin screen polls this every few seconds.
 */
export const getLiveMetrics = async (req, res, next) => {
  try {
    const now = new Date();
    const dayStart = startOfWatDay(now);

    const [
      liveSessions,
      upcoming,
      signupsToday,
      enrolmentsToday,
      revenueToday,
      scholarshipToday,
      pendingTutors,
      pendingCourses,
      applicationsToReview,
      openAppeals,
      recentUsers,
      recentEnrolments,
      recentPayments,
      recentScholarships,
      recentCertificates,
    ] = await Promise.all([
      LmsLiveSession.find({ status: "live" }).populate("instructorId", "firstName lastName").populate("cohortId", "name").sort({ startsAt: 1 }).lean(),
      LmsLiveSession.find({ status: "scheduled", startsAt: { $gt: now } }).populate("instructorId", "firstName lastName").populate("cohortId", "name").sort({ startsAt: 1 }).limit(5).lean(),
      User.countDocuments({ createdAt: { $gte: dayStart } }),
      Enrollment.countDocuments({ enrolledAt: { $gte: dayStart } }),
      sumRevenue({ createdAt: { $gte: dayStart } }),
      ScholarshipApplication.countDocuments({ submittedAt: { $gte: dayStart } }),
      User.countDocuments({ role: "instructor", approvalStatus: "pending" }),
      Course.countDocuments({ status: "pending" }),
      ScholarshipApplication.countDocuments({ status: { $in: ["submitted", "under_review"] } }),
      Appeal.countDocuments({ status: "pending" }),
      User.find().sort({ createdAt: -1 }).limit(8).select("firstName lastName email role createdAt").lean(),
      Enrollment.find().sort({ enrolledAt: -1 }).limit(8).populate("user", "firstName lastName").populate("course", "title").lean(),
      Transaction.find({ status: "success" }).sort({ createdAt: -1 }).limit(8).populate("course", "title").lean(),
      ScholarshipApplication.find().sort({ submittedAt: -1 }).limit(5).populate("userId", "firstName lastName").lean(),
      LmsCertificate.find().sort({ issuedAt: -1 }).limit(5).populate("userId", "firstName lastName").lean(),
    ]);

    const person = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ");
    const shapeSession = (session) => ({
      id: String(session._id),
      title: session.title,
      tutor: person(session.instructorId),
      cohort: session.cohortId?.name || "",
      startsAt: session.startsAt,
      participants: getLiveRoomCount(String(session._id)),
    });

    const recent = [
      ...recentUsers.map(describeActivity.user),
      ...recentEnrolments.map(describeActivity.enrolment),
      ...recentPayments.map(describeActivity.payment),
      ...recentScholarships.map(describeActivity.scholarship),
      ...recentCertificates.map(describeActivity.certificate),
    ]
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 14);

    const memory = process.memoryUsage();
    return res.status(200).json({
      asOf: now,
      online: presenceSummary(),
      liveClasses: liveSessions.map(shapeSession),
      upcomingClasses: upcoming.map(shapeSession),
      today: { signups: signupsToday, enrolments: enrolmentsToday, revenue: revenueToday.total, payments: revenueToday.count, scholarshipApplications: scholarshipToday },
      queue: { pendingTutors, pendingCourses, scholarshipApplications: applicationsToReview, appeals: openAppeals },
      recent,
      system: {
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(memory.rss / 1024 / 1024),
        environment: process.env.NODE_ENV || "development",
      },
    });
  } catch (error) {
    next(error);
  }
};

export default { getAnalytics, getLiveMetrics };
