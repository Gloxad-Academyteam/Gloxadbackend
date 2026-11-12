import mongoose from "mongoose";
import { Trimester } from "../models/Trimester.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { Course } from "../models/Course.model.js";
import { Enrollment } from "../models/Enrollment.model.js";
import { User } from "../models/User.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";

const TRIMESTER_STATUSES = ["upcoming", "active", "completed"];
const COHORT_STATUSES = ["enrolling", "active", "completed", "archived"];
const CURRENCY = "NGN";

const isId = (value) => mongoose.isValidObjectId(value);
const fail = (res, status, error, code) => res.status(status).json(code ? { error, code } : { error });
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

  const courseFields = withWeeks ? "title description price modules.title modules.lessons._id" : "title description price";
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
    const trimesters = await Trimester.find({ isPublished: true, status: { $in: ["upcoming", "active"] } })
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
    const trimester = await Trimester.findOne({ _id: req.params.id, isPublished: true }).lean();
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
    const trimester = cohort ? await Trimester.findOne({ _id: cohort.trimesterId, isPublished: true }) : null;
    if (!cohort || !trimester) return fail(res, 404, "Cohort not found");

    const state = enrolmentStateOf(trimester, cohort);
    if (state === "upcoming") return fail(res, 409, "Enrolment for this programme has not opened yet", "ENROLMENT_NOT_OPEN");
    if (state === "closed") return fail(res, 409, "Enrolment for this programme is closed", "ENROLMENT_CLOSED");

    const course = await Course.findById(cohort.courseId).select("price");
    if (!course) return fail(res, 404, "Programme course not found");
    if (course.price > 0) {
      return fail(res, 409, "This programme requires payment. Self-enrolment is only available for free programmes.", "PAYMENT_REQUIRED");
    }

    const seat = await takeSeat(cohort._id, req.user._id, { requireEnrolling: true });
    if (!seat.cohort) return seatFailure(res, seat.reason);

    await ensureCourseEnrollment(req.user._id, cohort.courseId);
    return res.status(201).json({
      message: "Enrolled successfully",
      cohortId: cohort._id,
      enrolment: { cohortId: cohort._id, courseId: cohort.courseId, enrolledAt: new Date() },
    });
  } catch (error) {
    next(error);
  }
};
