import mongoose from "mongoose";
import { Trimester } from "../models/Trimester.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { Course } from "../models/Course.model.js";
import { Enrollment } from "../models/Enrollment.model.js";
import { User } from "../models/User.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { CohortEnrolment, ENROLMENT_STATUSES } from "../models/CohortEnrolment.model.js";
import { notifyUsers } from "../utils/notify.js";

const TRIMESTER_STATUSES = ["upcoming", "active", "completed"];
const COHORT_STATUSES = ["enrolling", "active", "completed", "archived"];
const CURRENCY = "NGN";

const isId = (value) => mongoose.isValidObjectId(value);
const fail = (res, status, error, code, extra = {}) => res.status(status).json(code ? { error, code, ...extra } : { error });
const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const fullName = (user) => [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.name || "Tutor";

/** Checks the date rules shared by create and update. Returns an error message or null. */
const trimesterDateError = ({ startDate, endDate, enrollmentOpensAt, enrollmentClosesAt }) => {
  if (!startDate || !endDate || !enrollmentClosesAt) return "startDate, endDate and enrollmentClosesAt must be valid dates";
  if (endDate <= startDate) return "endDate must be after startDate";
  if (enrollmentClosesAt > endDate) return "enrollmentClosesAt cannot be after endDate";
  if (enrollmentOpensAt && enrollmentOpensAt >= enrollmentClosesAt) return "enrollmentOpensAt must be before enrollmentClosesAt";
  return null;
};

/** Enrolment state of one programme, always computed on the server (spec 21, section 5.1). */
const enrolmentStateOf = (trimester, cohort, now = new Date()) => {
  if (cohort.status !== "enrolling") return "closed";
  if (trimester.enrollmentOpensAt && now < new Date(trimester.enrollmentOpensAt)) return "upcoming";
  if (now > new Date(trimester.enrollmentClosesAt)) return "closed";
  return "open";
};

const seatsLeftOf = (cohort) => Math.max(0, (cohort.capacity ?? 0) - (cohort.studentIds?.length ?? 0));

/** Every instructor id must belong to an approved tutor. Returns the cleaned id list or null. */
const approvedInstructorIds = async (ids) => {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.map(String))];
  if (unique.some((id) => !isId(id))) return null;
  if (unique.length === 0) return [];
  const count = await User.countDocuments({ _id: { $in: unique }, role: "instructor", approvalStatus: "approved" });
  return count === unique.length ? unique : null;
};

/**
 * Takes one seat with a single atomic update, so two students racing for the last seat cannot both win.
 * Returns { cohort } on success or { reason } with ALREADY_ENROLLED, COHORT_FULL, ENROLMENT_CLOSED or NOT_FOUND.
 */
const takeSeat = async (cohortId, userId, { requireEnrolling }) => {
  const filter = {
    _id: cohortId,
    studentIds: { $ne: userId },
    $expr: { $lt: [{ $size: "$studentIds" }, "$capacity"] },
  };
  if (requireEnrolling) filter.status = "enrolling";

  const updated = await Cohort.findOneAndUpdate(filter, { $addToSet: { studentIds: userId } }, { returnDocument: "after" });
  if (updated) return { cohort: updated };

  const current = await Cohort.findById(cohortId).select("status capacity studentIds");
  if (!current) return { reason: "NOT_FOUND" };
  if (current.studentIds.some((id) => String(id) === String(userId))) return { reason: "ALREADY_ENROLLED" };
  if (requireEnrolling && current.status !== "enrolling") return { reason: "ENROLMENT_CLOSED" };
  return { reason: "COHORT_FULL" };
};

/** Makes sure the programme shows in the student's enrolled courses. Counts a student once per course. */
const ensureCourseEnrollment = async (userId, courseId) => {
  const result = await Enrollment.updateOne(
    { user: userId, course: courseId },
    { $setOnInsert: { user: userId, course: courseId, enrolledAt: new Date() } },
    { upsert: true }
  );
  if (result.upsertedCount > 0) await Course.updateOne({ _id: courseId }, { $inc: { enrolledCount: 1 } });
};

const seatFailure = (res, reason) => {
  if (reason === "NOT_FOUND") return fail(res, 404, "Cohort not found");
  if (reason === "ALREADY_ENROLLED") return fail(res, 409, "Already enrolled in this programme", "ALREADY_ENROLLED");
  if (reason === "ENROLMENT_CLOSED") return fail(res, 409, "Enrolment for this programme is closed", "ENROLMENT_CLOSED");
  return fail(res, 409, "This programme is full", "COHORT_FULL");
};


// ---------------------------------------------------------------------------------------------------------------
// Enrolment lifecycle (spec 26)
// ---------------------------------------------------------------------------------------------------------------

const ENROLMENT_MOVES = {
  active: ["suspended", "withdrawn", "completed"],
  suspended: ["active", "withdrawn"],
  completed: [],
  withdrawn: [],
};
// These moves must carry a reason the student can be shown
const NEEDS_REASON = ["suspended", "withdrawn"];

/** Appends a history entry and sets the status, creating the record on first use. */
const recordEnrolment = (cohortId, userId, status, { note = "", by = null } = {}) =>
  CohortEnrolment.findOneAndUpdate(
    { cohortId, userId },
    { $set: { status }, $setOnInsert: { enrolledAt: new Date() }, $push: { history: { status, note, by, at: new Date() } } },
    { upsert: true, returnDocument: "after" }
  );

/** Current status of a student in a cohort. Members with no record yet (joined before spec 26) count as active. */
const enrolmentStatusOf = async (cohort, userId) => {
  const record = await CohortEnrolment.findOne({ cohortId: cohort._id, userId });
  if (record) return { record, status: record.status };
  const member = (cohort.studentIds ?? []).some((id) => String(id) === String(userId));
  return { record: null, status: member ? "active" : null };
};

/** What is still missing before a Trimester may be published. Empty means ready. */
const readinessOf = async (trimester, now = new Date()) => {
  const missing = [];
  if (!trimester.title?.trim()) missing.push("a title");
  if (!trimester.description?.trim()) missing.push("a description");
  if (!trimester.enrollmentClosesAt || new Date(trimester.enrollmentClosesAt) <= now) missing.push("an enrolment close date in the future");

  const cohorts = await Cohort.find({ trimesterId: trimester._id }).select("name instructorIds capacity courseId").lean();
  if (cohorts.length === 0) {
    missing.push("at least one programme (cohort)");
    return missing;
  }
  const courses = await Course.find({ _id: { $in: cohorts.map((c) => c.courseId) } }).select("status").lean();
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  for (const cohort of cohorts) {
    if (!cohort.instructorIds?.length) missing.push(`a tutor for "${cohort.name}"`);
    if (!(cohort.capacity >= 1)) missing.push(`seats for "${cohort.name}"`);
    if (courseById.get(String(cohort.courseId))?.status !== "published") missing.push(`a published course for "${cohort.name}"`);
  }
  return missing;
};

// ---------------------------------------------------------------------------------------------------------------
// Admin: Trimesters
// ---------------------------------------------------------------------------------------------------------------

/** POST /api/lms/admin/trimesters */
export const createTrimester = async (req, res, next) => {
  try {
    const { number, title, description, weeks } = req.body || {};
    const startDate = toDate(req.body?.startDate);
    const endDate = toDate(req.body?.endDate);
    const enrollmentClosesAt = toDate(req.body?.enrollmentClosesAt);
    const enrollmentOpensAt = req.body?.enrollmentOpensAt ? toDate(req.body.enrollmentOpensAt) : null;

    if (![1, 2, 3].includes(Number(number))) return fail(res, 400, "number must be 1, 2 or 3");
    if (!title || !String(title).trim()) return fail(res, 400, "title is required");
    if (req.body?.enrollmentOpensAt && !enrollmentOpensAt) return fail(res, 400, "enrollmentOpensAt must be a valid date");
    const weekCount = weeks === undefined ? 12 : Number(weeks);
    if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) return fail(res, 400, "weeks must be a whole number from 1 to 52");

    const dateError = trimesterDateError({ startDate, endDate, enrollmentOpensAt, enrollmentClosesAt });
    if (dateError) return fail(res, 400, dateError);

    const trimester = await Trimester.create({
      number: Number(number),
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      startDate,
      endDate,
      weeks: weekCount,
      enrollmentOpensAt,
      enrollmentClosesAt,
      status: "upcoming",
      isPublished: false,
    });
    return res.status(201).json({ trimester });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/trimesters */
export const listTrimesters = async (req, res, next) => {
  try {
    const trimesters = await Trimester.find().sort({ startDate: -1 }).lean();
    const cohorts = await Cohort.find({ trimesterId: { $in: trimesters.map((t) => t._id) } })
      .select("trimesterId studentIds")
      .lean();

    const totals = new Map();
    for (const cohort of cohorts) {
      const key = String(cohort.trimesterId);
      const entry = totals.get(key) || { cohortCount: 0, studentCount: 0 };
      entry.cohortCount += 1;
      entry.studentCount += cohort.studentIds?.length ?? 0;
      totals.set(key, entry);
    }

    return res.status(200).json({
      trimesters: trimesters.map((t) => ({ ...t, ...(totals.get(String(t._id)) || { cohortCount: 0, studentCount: 0 }) })),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/admin/trimesters/:id */
export const updateTrimester = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid trimester ID format");
    const trimester = await Trimester.findById(req.params.id);
    if (!trimester) return fail(res, 404, "Trimester not found");

    const body = req.body || {};
    if (body.number !== undefined) {
      if (![1, 2, 3].includes(Number(body.number))) return fail(res, 400, "number must be 1, 2 or 3");
      trimester.number = Number(body.number);
    }
    if (body.title !== undefined) {
      if (!String(body.title).trim()) return fail(res, 400, "title cannot be empty");
      trimester.title = String(body.title).trim();
    }
    if (body.description !== undefined) trimester.description = String(body.description).trim();
    if (body.weeks !== undefined) {
      const weekCount = Number(body.weeks);
      if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) return fail(res, 400, "weeks must be a whole number from 1 to 52");
      trimester.weeks = weekCount;
    }
    if (body.status !== undefined) {
      if (!TRIMESTER_STATUSES.includes(body.status)) return fail(res, 400, `status must be one of: ${TRIMESTER_STATUSES.join(", ")}`);
      trimester.status = body.status;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") return fail(res, 400, "archived must be true or false");
      trimester.archivedAt = body.archived ? trimester.archivedAt ?? new Date() : null;
    }
    const publishing = body.isPublished === true && !trimester.isPublished;
    if (body.isPublished !== undefined) {
      if (typeof body.isPublished !== "boolean") return fail(res, 400, "isPublished must be true or false");
      trimester.isPublished = body.isPublished;
    }

    const dates = {
      startDate: body.startDate !== undefined ? toDate(body.startDate) : trimester.startDate,
      endDate: body.endDate !== undefined ? toDate(body.endDate) : trimester.endDate,
      enrollmentClosesAt: body.enrollmentClosesAt !== undefined ? toDate(body.enrollmentClosesAt) : trimester.enrollmentClosesAt,
      enrollmentOpensAt:
        body.enrollmentOpensAt === undefined ? trimester.enrollmentOpensAt : body.enrollmentOpensAt === null ? null : toDate(body.enrollmentOpensAt),
    };
    if (body.enrollmentOpensAt && !dates.enrollmentOpensAt) return fail(res, 400, "enrollmentOpensAt must be a valid date");
    const dateError = trimesterDateError(dates);
    if (dateError) return fail(res, 400, dateError);
    Object.assign(trimester, dates);

    // Publishing is checked on the server against everything the update just set
    if (publishing) {
      const missing = await readinessOf(trimester);
      if (missing.length) return fail(res, 422, `Not ready to publish. Missing: ${missing.join(", ")}`, "NOT_READY_TO_PUBLISH", { missing });
    }

    await trimester.save();
    return res.status(200).json({ trimester });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Admin: cohorts (programmes) and rosters
// ---------------------------------------------------------------------------------------------------------------

const cohortSummary = (cohort, course, instructors) => ({
  _id: cohort._id,
  name: cohort.name,
  trimesterId: cohort.trimesterId,
  courseId: cohort.courseId,
  courseTitle: course?.title ?? null,
  status: cohort.status,
  capacity: cohort.capacity,
  studentCount: cohort.studentIds?.length ?? 0,
  seatsLeft: seatsLeftOf(cohort),
  currentWeek: cohort.currentWeek,
  timezone: cohort.timezone,
  instructors: instructors.map((tutor) => ({ _id: tutor._id, name: fullName(tutor) })),
});

/** POST /api/lms/admin/cohorts */
export const createCohort = async (req, res, next) => {
  try {
    const { trimesterId, courseId, name, timezone } = req.body || {};
    if (!isId(trimesterId) || !isId(courseId)) return fail(res, 400, "trimesterId and courseId are required valid IDs");
    if (!name || !String(name).trim()) return fail(res, 400, "name is required");

    const capacity = req.body?.capacity === undefined ? 50 : Number(req.body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return fail(res, 400, "capacity must be a whole number of at least 1");

    const [trimester, course] = await Promise.all([Trimester.findById(trimesterId), Course.findById(courseId)]);
    if (!trimester) return fail(res, 404, "Trimester not found");
    if (!course) return fail(res, 404, "Course not found");
    if (course.status !== "published" || course.courseType !== "trimester") {
      return fail(res, 422, "A cohort can only run a published course of type trimester");
    }

    const instructorIds = await approvedInstructorIds(req.body?.instructorIds ?? []);
    if (!instructorIds) return fail(res, 422, "Every instructor must be an approved tutor");

    if (await Cohort.exists({ trimesterId, name: String(name).trim() })) {
      return fail(res, 409, "A cohort with this name already exists in this trimester");
    }

    const cohort = await Cohort.create({
      name: String(name).trim(),
      courseId,
      trimesterId,
      instructorIds,
      capacity,
      timezone: timezone || undefined,
      status: "enrolling",
    });
    const instructors = await User.find({ _id: { $in: instructorIds } }).select("firstName lastName name");
    return res.status(201).json({ cohort: cohortSummary(cohort, course, instructors) });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/cohorts?trimesterId= */
export const listCohorts = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.trimesterId) {
      if (!isId(req.query.trimesterId)) return fail(res, 400, "Invalid trimesterId format");
      filter.trimesterId = req.query.trimesterId;
    }
    const cohorts = await Cohort.find(filter).sort({ createdAt: -1 }).lean();
    const [courses, tutors] = await Promise.all([
      Course.find({ _id: { $in: cohorts.map((c) => c.courseId) } }).select("title").lean(),
      User.find({ _id: { $in: cohorts.flatMap((c) => c.instructorIds ?? []) } }).select("firstName lastName name").lean(),
    ]);
    const courseById = new Map(courses.map((c) => [String(c._id), c]));
    const tutorById = new Map(tutors.map((t) => [String(t._id), t]));

    return res.status(200).json({
      cohorts: cohorts.map((cohort) =>
        cohortSummary(cohort, courseById.get(String(cohort.courseId)), (cohort.instructorIds ?? []).map((id) => tutorById.get(String(id))).filter(Boolean))
      ),
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/admin/cohorts/:id */
export const updateCohort = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid cohort ID format");
    const cohort = await Cohort.findById(req.params.id);
    if (!cohort) return fail(res, 404, "Cohort not found");
    const body = req.body || {};

    if (body.name !== undefined) {
      if (!String(body.name).trim()) return fail(res, 400, "name cannot be empty");
      cohort.name = String(body.name).trim();
    }
    if (body.timezone !== undefined) cohort.timezone = String(body.timezone).trim();
    if (body.currentWeek !== undefined) {
      const week = Number(body.currentWeek);
      if (!Number.isInteger(week) || week < 1 || week > 52) return fail(res, 400, "currentWeek must be a whole number from 1 to 52");
      cohort.currentWeek = week;
    }
    if (body.status !== undefined) {
      if (!COHORT_STATUSES.includes(body.status)) return fail(res, 400, `status must be one of: ${COHORT_STATUSES.join(", ")}`);
      cohort.status = body.status;
    }
    if (body.capacity !== undefined) {
      const capacity = Number(body.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) return fail(res, 400, "capacity must be a whole number of at least 1");
      if (capacity < cohort.studentIds.length) return fail(res, 422, `capacity cannot be below the ${cohort.studentIds.length} students already enrolled`);
      cohort.capacity = capacity;
    }
    if (body.instructorIds !== undefined) {
      const instructorIds = await approvedInstructorIds(body.instructorIds);
      if (!instructorIds) return fail(res, 422, "Every instructor must be an approved tutor");
      cohort.instructorIds = instructorIds;
    }

    await cohort.save();
    const [course, instructors] = await Promise.all([
      Course.findById(cohort.courseId).select("title"),
      User.find({ _id: { $in: cohort.instructorIds } }).select("firstName lastName name"),
    ]);
    return res.status(200).json({ cohort: cohortSummary(cohort, course, instructors) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/admin/cohorts/:id/students  { userId | email } */
export const addCohortStudent = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid cohort ID format");
    const { userId, email } = req.body || {};
    if (!userId && !email) return fail(res, 400, "userId or email is required");
    if (userId && !isId(userId)) return fail(res, 400, "Invalid userId format");

    const student = userId ? await User.findById(userId) : await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!student) return fail(res, 404, "User not found");
    if (student.role !== "student") return fail(res, 422, "Only students can be added to a cohort");
    if (student.isActive === false) return fail(res, 422, "This account is deactivated");

    const cohort = await Cohort.findById(req.params.id).select("courseId");
    if (!cohort) return fail(res, 404, "Cohort not found");

    // An admin may add a student outside the enrolment window and without payment, but never beyond capacity
    const seat = await takeSeat(req.params.id, student._id, { requireEnrolling: false });
    if (!seat.cohort) return seatFailure(res, seat.reason);

    await ensureCourseEnrollment(student._id, cohort.courseId);
    await recordEnrolment(seat.cohort._id, student._id, "active", { note: "Added by an administrator", by: req.user._id });
    await notifyUsers([student._id], { title: "Enrolment confirmed", message: `You have been enrolled in "${seat.cohort.name}".`, type: "enrolment_confirmed", link: "/lms" });
    return res.status(201).json({ message: "Student added to cohort", studentCount: seat.cohort.studentIds.length });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/lms/admin/cohorts/:id/students/:userId */
export const removeCohortStudent = async (req, res, next) => {
  try {
    if (!isId(req.params.id) || !isId(req.params.userId)) return fail(res, 400, "Invalid ID format");
    const cohort = await Cohort.findOneAndUpdate(
      { _id: req.params.id, studentIds: req.params.userId },
      { $pull: { studentIds: req.params.userId } },
      { returnDocument: "after" }
    );
    if (!cohort) {
      const exists = await Cohort.exists({ _id: req.params.id });
      return fail(res, 404, exists ? "This student is not in the cohort" : "Cohort not found");
    }
    await recordEnrolment(cohort._id, req.params.userId, "withdrawn", { note: "Removed by an administrator", by: req.user._id });
    return res.status(200).json({ message: "Student removed from cohort", studentCount: cohort.studentIds.length });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Public Trimesters and self-enrolment
// ---------------------------------------------------------------------------------------------------------------

const PUBLIC_COHORT_STATUSES = ["enrolling", "active"];

/** Loads the programmes of the given Trimesters, with their course and tutor details, for the public routes. */
const loadProgrammes = async (trimesterIds, viewerId, { withWeeks }) => {
  const cohorts = await Cohort.find({ trimesterId: { $in: trimesterIds }, status: { $in: PUBLIC_COHORT_STATUSES } })
    .sort({ createdAt: 1 })
    .lean();

  const baseFields = "title slug description price thumbnail trailerVideoUrl level language skills targetAudience requirements";
  const courseFields = withWeeks ? `${baseFields} modules.title modules.lessons._id` : baseFields;
  const [courses, tutors] = await Promise.all([
    Course.find({ _id: { $in: cohorts.map((c) => c.courseId) } }).select(courseFields).lean(),
    User.find({ _id: { $in: cohorts.flatMap((c) => c.instructorIds ?? []) } }).select("firstName lastName name").lean(),
  ]);
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const tutorById = new Map(tutors.map((t) => [String(t._id), t]));

  let sessionsByCohort = new Map();
  if (withWeeks) {
    const sessions = await LmsLiveSession.find({ cohortId: { $in: cohorts.map((c) => c._id) }, startsAt: { $gte: new Date() }, status: { $ne: "ended" } })
      .sort({ startsAt: 1 })
      .select("cohortId title startsAt endsAt")
      .lean();
    for (const session of sessions) {
      const key = String(session.cohortId);
      const list = sessionsByCohort.get(key) || [];
      if (list.length < 5) list.push({ _id: session._id, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt });
      sessionsByCohort.set(key, list);
    }
  }

  return cohorts.map((cohort) => {
    const course = courseById.get(String(cohort.courseId));
    const programme = {
      _id: cohort._id,
      trimesterId: cohort.trimesterId,
      name: cohort.name,
      courseId: cohort.courseId,
      title: course?.title ?? cohort.name,
      description: course?.description ?? "",
      slug: course?.slug ?? null,
      // Landing page content comes from the course the tutor authored
      thumbnail: course?.thumbnail || null,
      trailerVideoUrl: course?.trailerVideoUrl || null,
      level: course?.level ?? null,
      language: course?.language ?? null,
      skills: course?.skills ?? [],
      targetAudience: course?.targetAudience ?? [],
      requirements: course?.requirements ?? [],
      price: course?.price ?? 0,
      currency: CURRENCY,
      seats: cohort.capacity,
      seatsLeft: seatsLeftOf(cohort),
      instructors: (cohort.instructorIds ?? []).map((id) => tutorById.get(String(id))).filter(Boolean).map((tutor) => ({ _id: tutor._id, name: fullName(tutor) })),
      enrolled: Boolean(viewerId) && (cohort.studentIds ?? []).some((id) => String(id) === String(viewerId)),
    };
    if (withWeeks) {
      programme.weeks = (course?.modules ?? []).map((module, index) => ({ weekNumber: index + 1, title: module.title, lessonCount: module.lessons?.length ?? 0 }));
      programme.sessions = sessionsByCohort.get(String(cohort._id)) || [];
    }
    return { cohort, programme };
  });
};

const publicTrimester = (trimester, programmes) => ({
  _id: trimester._id,
  number: trimester.number,
  title: trimester.title,
  description: trimester.description ?? "",
  startDate: trimester.startDate,
  endDate: trimester.endDate,
  weeks: trimester.weeks,
  enrollmentOpensAt: trimester.enrollmentOpensAt ?? null,
  enrollmentClosesAt: trimester.enrollmentClosesAt,
  status: trimester.status,
  programmes: programmes.map(({ cohort, programme }) => ({ ...programme, enrolmentState: enrolmentStateOf(trimester, cohort) })),
});

/** GET /api/lms/public/trimesters */
export const getPublicTrimesters = async (req, res, next) => {
  try {
    const trimesters = await Trimester.find({ isPublished: true, archivedAt: null, status: { $in: ["upcoming", "active"] } })
      .sort({ startDate: 1 })
      .lean();
    const programmes = await loadProgrammes(trimesters.map((t) => t._id), req.user?._id, { withWeeks: false });
    const byTrimester = new Map();
    for (const entry of programmes) {
      const key = String(entry.cohort.trimesterId);
      byTrimester.set(key, [...(byTrimester.get(key) || []), entry]);
    }
    return res.status(200).json({ trimesters: trimesters.map((t) => publicTrimester(t, byTrimester.get(String(t._id)) || [])) });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/public/trimesters/:id */
export const getPublicTrimester = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid trimester ID format");
    const trimester = await Trimester.findOne({ _id: req.params.id, isPublished: true, archivedAt: null }).lean();
    if (!trimester) return fail(res, 404, "Trimester not found");
    const programmes = await loadProgrammes([trimester._id], req.user?._id, { withWeeks: true });
    return res.status(200).json({ trimester: publicTrimester(trimester, programmes) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/cohorts/:cohortId/enrol */
export const enrolInCohort = async (req, res, next) => {
  try {
    if (req.user.role !== "student") return fail(res, 403, "Only students can enrol in a programme");
    if (!isId(req.params.cohortId)) return fail(res, 400, "Invalid cohort ID format");

    const cohort = await Cohort.findById(req.params.cohortId);
    const trimester = cohort ? await Trimester.findOne({ _id: cohort.trimesterId, isPublished: true, archivedAt: null }) : null;
    if (!cohort || !trimester) return fail(res, 404, "Cohort not found");

    const state = enrolmentStateOf(trimester, cohort);
    if (state === "upcoming") return fail(res, 409, "Enrolment for this programme has not opened yet", "ENROLMENT_NOT_OPEN");
    if (state === "closed") return fail(res, 409, "Enrolment for this programme is closed", "ENROLMENT_CLOSED");

    const course = await Course.findById(cohort.courseId).select("price");
    if (!course) return fail(res, 404, "Programme course not found");
    if (course.price > 0) {
      return fail(res, 409, "This programme requires payment. Self-enrolment is only available for free programmes.", "PAYMENT_REQUIRED");
    }

    const existing = await CohortEnrolment.findOne({ cohortId: cohort._id, userId: req.user._id }).select("status");
    if (existing?.status === "suspended") {
      return fail(res, 409, "Your enrolment in this programme is suspended. Please contact support.", "ENROLMENT_SUSPENDED");
    }

    const seat = await takeSeat(cohort._id, req.user._id, { requireEnrolling: true });
    if (!seat.cohort) return seatFailure(res, seat.reason);

    await ensureCourseEnrollment(req.user._id, cohort.courseId);
    await recordEnrolment(cohort._id, req.user._id, "active", { note: existing ? "Re-enrolled" : "Enrolled" });
    await notifyUsers([req.user._id], { title: "Enrolment confirmed", message: `You are enrolled in "${cohort.name}".`, type: "enrolment_confirmed", link: "/lms" });
    return res.status(201).json({
      message: "Enrolled successfully",
      cohortId: cohort._id,
      enrolment: { cohortId: cohort._id, courseId: cohort.courseId, enrolledAt: new Date() },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Enrolment lifecycle endpoints (spec 26)
// ---------------------------------------------------------------------------------------------------------------

const enrolmentView = (record, user) => ({
  userId: record.userId,
  name: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : null,
  email: user?.email ?? null,
  status: record.status,
  enrolledAt: record.enrolledAt ?? null,
  history: record.history ?? [],
});

/** GET /api/lms/admin/cohorts/:id/enrolments */
export const listCohortEnrolments = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid cohort ID format");
    const cohort = await Cohort.findById(req.params.id).select("studentIds").lean();
    if (!cohort) return fail(res, 404, "Cohort not found");

    const records = await CohortEnrolment.find({ cohortId: cohort._id }).lean();
    const recorded = new Set(records.map((r) => String(r.userId)));
    // Members from before spec 26 have no record yet: show them as active
    const implicit = (cohort.studentIds ?? []).filter((id) => !recorded.has(String(id))).map((id) => ({ userId: id, status: "active", enrolledAt: null, history: [] }));
    const all = [...records, ...implicit];
    const users = await User.find({ _id: { $in: all.map((r) => r.userId) } }).select("firstName lastName email").lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const enrolments = all.map((r) => enrolmentView(r, userById.get(String(r.userId))));
    const counts = Object.fromEntries(ENROLMENT_STATUSES.map((status) => [status, enrolments.filter((e) => e.status === status).length]));
    return res.status(200).json({ enrolments, counts });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/admin/cohorts/:id/enrolments/:userId/status  { status, reason } */
export const setEnrolmentStatus = async (req, res, next) => {
  try {
    if (!isId(req.params.id) || !isId(req.params.userId)) return fail(res, 400, "Invalid ID format");
    const status = req.body?.status;
    const reason = req.body?.reason ? String(req.body.reason).trim() : "";
    if (!ENROLMENT_STATUSES.includes(status)) return fail(res, 400, `status must be one of: ${ENROLMENT_STATUSES.join(", ")}`);

    const cohort = await Cohort.findById(req.params.id);
    if (!cohort) return fail(res, 404, "Cohort not found");
    const { record, status: current } = await enrolmentStatusOf(cohort, req.params.userId);
    if (!current) return fail(res, 404, "This student has no enrolment in the cohort");

    const allowed = ENROLMENT_MOVES[current] ?? [];
    if (!allowed.includes(status)) {
      return fail(res, 409, `An enrolment that is ${current} cannot become ${status}`, "INVALID_TRANSITION", { allowed });
    }
    if (NEEDS_REASON.includes(status) && !reason) return fail(res, 400, `A reason is required to make an enrolment ${status}`, "REASON_REQUIRED");

    // Create the record for a member who joined before spec 26, so the conditional update below has something to guard
    if (!record) await CohortEnrolment.updateOne({ cohortId: cohort._id, userId: req.params.userId }, { $setOnInsert: { status: "active", enrolledAt: new Date(), history: [{ status: "active", note: "Existing member", at: new Date() }] } }, { upsert: true });

    if (status === "active") {
      const seat = await takeSeat(cohort._id, req.params.userId, { requireEnrolling: false });
      if (!seat.cohort) return seatFailure(res, seat.reason);
    }

    const updated = await CohortEnrolment.findOneAndUpdate(
      { cohortId: cohort._id, userId: req.params.userId, status: current },
      { $set: { status }, $push: { history: { status, note: reason, by: req.user._id, at: new Date() } } },
      { returnDocument: "after" }
    );
    if (!updated) {
      if (status === "active") await Cohort.updateOne({ _id: cohort._id }, { $pull: { studentIds: req.params.userId } });
      return fail(res, 409, "This enrolment was changed by someone else. Reload and try again.", "CONCURRENT_CHANGE");
    }

    // Suspended and withdrawn students lose access and free their seat; their record and progress stay
    if (status === "suspended" || status === "withdrawn") await Cohort.updateOne({ _id: cohort._id }, { $pull: { studentIds: req.params.userId } });

    if (status !== "completed") {
      const text = { suspended: "suspended", active: "reinstated", withdrawn: "ended by an administrator" }[status];
      await notifyUsers([req.params.userId], { title: "Enrolment update", message: `Your enrolment in "${cohort.name}" was ${text}.${reason ? ` ${reason}` : ""}`, type: "enrolment_update", link: "/lms" });
    }
    return res.status(200).json({ enrolment: enrolmentView(updated, null) });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/cohorts/:cohortId/withdraw  (student withdraws themselves) */
export const withdrawFromCohort = async (req, res, next) => {
  try {
    if (req.user.role !== "student") return fail(res, 403, "Only students can withdraw from a programme");
    if (!isId(req.params.cohortId)) return fail(res, 400, "Invalid cohort ID format");
    const cohort = await Cohort.findById(req.params.cohortId);
    if (!cohort) return fail(res, 404, "Cohort not found");

    const { status } = await enrolmentStatusOf(cohort, req.user._id);
    if (!status) return fail(res, 404, "You are not enrolled in this programme");
    if (status !== "active") return fail(res, 409, `An enrolment that is ${status} cannot be withdrawn`, "INVALID_TRANSITION");
    if (["completed", "archived"].includes(cohort.status)) return fail(res, 409, "This programme has finished, so it can no longer be withdrawn from", "COHORT_FINISHED");

    const updated = await recordEnrolment(cohort._id, req.user._id, "withdrawn", { note: req.body?.reason ? String(req.body.reason).trim() : "Withdrew" , by: req.user._id });
    await Cohort.updateOne({ _id: cohort._id }, { $pull: { studentIds: req.user._id } });
    return res.status(200).json({ message: "You have withdrawn from this programme", enrolment: enrolmentView(updated, null) });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/enrolments/me */
export const getMyEnrolments = async (req, res, next) => {
  try {
    const [records, memberCohorts] = await Promise.all([
      CohortEnrolment.find({ userId: req.user._id }).lean(),
      Cohort.find({ studentIds: req.user._id }).select("_id").lean(),
    ]);
    const recorded = new Set(records.map((r) => String(r.cohortId)));
    const implicit = memberCohorts.filter((c) => !recorded.has(String(c._id))).map((c) => ({ cohortId: c._id, status: "active", enrolledAt: null, history: [] }));
    const all = [...records, ...implicit];

    const cohorts = await Cohort.find({ _id: { $in: all.map((r) => r.cohortId) } }).populate("trimesterId", "title").populate("courseId", "title").lean();
    const cohortById = new Map(cohorts.map((c) => [String(c._id), c]));
    return res.status(200).json({
      enrolments: all
        .filter((r) => cohortById.has(String(r.cohortId)))
        .map((r) => {
          const c = cohortById.get(String(r.cohortId));
          return {
            cohortId: r.cohortId,
            cohortName: c.name,
            programmeTitle: c.courseId?.title ?? c.name,
            trimester: c.trimesterId ? { _id: c.trimesterId._id, title: c.trimesterId.title } : null,
            status: r.status,
            enrolledAt: r.enrolledAt ?? null,
            history: (r.history ?? []).map(({ status, note, at }) => ({ status, note, at })),
          };
        }),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/trimesters/:id/preview  (the public view of a Trimester even when it is a draft or archived, plus readiness) */
export const previewTrimester = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid trimester ID format");
    const trimester = await Trimester.findById(req.params.id).lean();
    if (!trimester) return fail(res, 404, "Trimester not found");
    const programmes = await loadProgrammes([trimester._id], req.user._id, { withWeeks: true });
    const missing = await readinessOf(trimester);
    return res.status(200).json({
      trimester: { ...publicTrimester(trimester, programmes), isPublished: trimester.isPublished, archivedAt: trimester.archivedAt ?? null },
      readiness: { ready: missing.length === 0, missing },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/public/programmes/:cohortId  (the public landing page of one Trimester course; optional token) */
export const getPublicProgramme = async (req, res, next) => {
  try {
    if (!isId(req.params.cohortId)) return fail(res, 400, "Invalid programme ID format");
    const cohort = await Cohort.findById(req.params.cohortId).select("trimesterId status").lean();
    const trimester = cohort ? await Trimester.findOne({ _id: cohort.trimesterId, isPublished: true, archivedAt: null }).lean() : null;
    if (!cohort || !trimester || !PUBLIC_COHORT_STATUSES.includes(cohort.status)) return fail(res, 404, "Programme not found");

    const programmes = await loadProgrammes([trimester._id], req.user?._id, { withWeeks: true });
    const entry = programmes.find(({ programme }) => String(programme._id) === String(cohort._id));
    if (!entry) return fail(res, 404, "Programme not found");

    const { programmes: _omitted, ...trimesterSummary } = publicTrimester(trimester, [entry]);
    return res.status(200).json({
      trimester: trimesterSummary,
      programme: { ...entry.programme, enrolmentState: enrolmentStateOf(trimester, entry.cohort) },
    });
  } catch (error) {
    next(error);
  }
};
