/**
 * Unit 24: live class scheduling and lifecycle (spec 24).
 *   node scripts/test-unit24-live-classes.js   # starts its own server
 */
import dotenv from "dotenv";
dotenv.config();
import http from "http";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { app } from "../src/app.js";
import { User } from "../src/models/User.model.js";
import { Course } from "../src/models/Course.model.js";
import { Cohort } from "../src/models/Cohort.model.js";
import { LmsLiveSession } from "../src/models/LmsLiveSession.model.js";
import { LmsAttendance } from "../src/models/LmsAttendance.model.js";
import { LmsChatMessage } from "../src/models/LmsChatMessage.model.js";
import { Notification } from "../src/models/Notification.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3024;
const API = `http://localhost:${PORT}/api/lms`;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const at = (ms) => new Date(Date.now() + ms).toISOString();
let failures = 0, total = 0;
const check = (label, ok, detail) => {
  total += 1;
  if (ok) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const section = (t) => console.log(`\n${t}`);
const call = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined || method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const created = { users: [], courses: [], cohorts: [], sessions: [] };
const make = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({ firstName: label, lastName: "Unit24", username: `u24_${label}_${stamp}`.toLowerCase(), email: `u24_${label}_${stamp}@test.com`.toLowerCase(), password: "Password123!", role, isEmailVerified: true, ...extra });
  created.users.push(user._id);
  return { user, token: generateToken(user) };
};

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));
  try {
    const admin = await make("admin", "admin");
    const tutor = await make("instructor", "tutor", { approvalStatus: "approved" });
    const otherTutor = await make("instructor", "othertutor", { approvalStatus: "approved" });
    const alice = await make("student", "alice");
    const bob = await make("student", "bob");
    const outsider = await make("student", "outsider");

    const course = await Course.create({ title: "U24 Course", slug: `u24-${Date.now()}`, category: { name: "Software Development", slug: "software-development" }, courseType: "trimester", status: "published", instructor: tutor.user._id, modules: [] });
    created.courses.push(course._id);
    const cohort = await Cohort.create({ name: `U24 Cohort ${Date.now()}`, courseId: course._id, trimesterId: new mongoose.Types.ObjectId(), instructorIds: [tutor.user._id], studentIds: [alice.user._id, bob.user._id], status: "active" });
    const emptyCohort = await Cohort.create({ name: `U24 Empty ${Date.now()}`, courseId: course._id, trimesterId: new mongoose.Types.ObjectId(), instructorIds: [], studentIds: [], status: "active" });
    created.cohorts.push(cohort._id, emptyCohort._id);

    const body = (extra = {}) => ({ cohortId: cohort._id, title: "Week 1 live class", description: "Intro", startsAt: at(2 * HOUR), endsAt: at(4 * HOUR), ...extra });

    section("1. Scheduling rules");
    check("missing fields are 400", (await call("POST", "/live-sessions", tutor.token, { cohortId: cohort._id })).status === 400);
    check("invalid dates are 400", (await call("POST", "/live-sessions", tutor.token, body({ startsAt: "soon" }))).status === 400);
    check("end before start is 400", (await call("POST", "/live-sessions", tutor.token, body({ endsAt: at(HOUR) }))).status === 400);
    check("a start in the past is 400", (await call("POST", "/live-sessions", tutor.token, body({ startsAt: at(-HOUR), endsAt: at(HOUR) }))).status === 400);
    check("an invalid cohort id is 400", (await call("POST", "/live-sessions", tutor.token, body({ cohortId: "nope" }))).status === 400);
    check("an unknown cohort is 404", (await call("POST", "/live-sessions", tutor.token, body({ cohortId: new mongoose.Types.ObjectId() }))).status === 404);
    check("a student cannot schedule", (await call("POST", "/live-sessions", alice.token, body())).status === 403);
    check("signed-out is 401", (await call("POST", "/live-sessions", null, body())).status === 401);
    check("a tutor of another cohort cannot schedule", (await call("POST", "/live-sessions", otherTutor.token, body())).status === 403);

    const own = await call("POST", "/live-sessions", tutor.token, body());
    const ownSession = own.data.session;
    if (ownSession) created.sessions.push(ownSession._id);
    check("the cohort's tutor schedules their own class", own.status === 201 && ownSession?.instructorId === String(tutor.user._id) && ownSession?.status === "scheduled", own.data);
    check("times are stored as UTC instants", ownSession?.startsAt.endsWith("Z"));
    check("each student got a 'New live class' notification", (await Notification.countDocuments({ recipient: { $in: [alice.user._id, bob.user._id] }, type: "live_class_scheduled" })) === 2);
    check("the tutor and outsiders did not", (await Notification.countDocuments({ recipient: { $in: [tutor.user._id, outsider.user._id] }, type: "live_class_scheduled" })) === 0);

    section("2. Admin schedules on behalf of a tutor");
    const byAdmin = await call("POST", "/live-sessions", admin.token, body({ title: "Admin scheduled", instructorId: tutor.user._id }));
    if (byAdmin.data.session) created.sessions.push(byAdmin.data.session._id);
    check("admin schedules with the cohort's tutor as host", byAdmin.status === 201 && byAdmin.data.session.instructorId === String(tutor.user._id), byAdmin.data);
    const defaultHost = await call("POST", "/live-sessions", admin.token, body({ title: "Default host" }));
    if (defaultHost.data.session) created.sessions.push(defaultHost.data.session._id);
    check("without instructorId the cohort's first tutor hosts", defaultHost.status === 201 && defaultHost.data.session.instructorId === String(tutor.user._id), defaultHost.data);
    check("a host who is not in the cohort is 422", (await call("POST", "/live-sessions", admin.token, body({ instructorId: otherTutor.user._id }))).status === 422);
    check("a cohort without tutors is 422", (await call("POST", "/live-sessions", admin.token, body({ cohortId: emptyCohort._id }))).status === 422);

    section("3. Rescheduling and status moves");
    const id = ownSession._id;
    check("end before start on update is 400", (await call("PUT", `/live-sessions/${id}`, tutor.token, { startsAt: at(5 * HOUR), endsAt: at(4 * HOUR) })).status === 400);
    check("an invalid status is 400", (await call("PUT", `/live-sessions/${id}`, tutor.token, { status: "cancelled" })).status === 400);
    check("another tutor cannot update it", (await call("PUT", `/live-sessions/${id}`, otherTutor.token, { title: "Hijack" })).status === 403);
    const before = await Notification.countDocuments({ type: "live_class_rescheduled", recipient: alice.user._id });
    const moved = await call("PUT", `/live-sessions/${id}`, tutor.token, { startsAt: at(3 * HOUR), endsAt: at(5 * HOUR) });
    check("a scheduled class can be rescheduled", moved.status === 200 && new Date(moved.data.session.startsAt) > new Date(at(2.5 * HOUR)), moved.data);
    check("students were told about the new time", (await Notification.countDocuments({ type: "live_class_rescheduled", recipient: alice.user._id })) === before + 1);
    check("a plain title change does not notify", ((await call("PUT", `/live-sessions/${id}`, tutor.token, { title: "Renamed" })).status === 200) && (await Notification.countDocuments({ type: "live_class_rescheduled", recipient: alice.user._id })) === before + 1);

    section("4. Join rules and attendance");
    const window = await call("POST", `/live-sessions/${id}/join`, alice.token);
    check("a student cannot join earlier than 10 minutes before the start", window.status === 400, window.data);
    check("an outsider cannot join at all", (await call("POST", `/live-sessions/${id}/join`, outsider.token)).status === 403);
    const hostJoin = await call("POST", `/live-sessions/${id}/join`, tutor.token);
    check("the host joins early and the class goes live", hostJoin.status === 200 && (await LmsLiveSession.findById(id)).status === "live", hostJoin.data);
    await LmsLiveSession.updateOne({ _id: id }, { startsAt: new Date(Date.now() + 5 * MIN) });
    const studentJoin = await call("POST", `/live-sessions/${id}/join`, alice.token);
    check("a student joins inside the 10 minute window", studentJoin.status === 200, studentJoin.data);
    check("attendance is recorded as present", (await LmsAttendance.findOne({ sessionId: id, userId: alice.user._id }))?.status === "present");
    await LmsAttendance.updateOne({ sessionId: id, userId: alice.user._id }, { joinedAt: new Date(Date.now() - 20 * MIN) });
    const left = await call("POST", `/live-sessions/${id}/leave`, alice.token);
    check("leaving records a duration", left.status === 200 && left.data.attendance.durationMinutes >= 19, left.data);
    await call("POST", `/live-sessions/${id}/join`, alice.token);
    check("coming back clears the leave time", (await LmsAttendance.findOne({ sessionId: id, userId: alice.user._id })).leftAt === null);
    await call("POST", `/live-sessions/${id}/join`, bob.token);
    await LmsAttendance.updateOne({ sessionId: id, userId: bob.user._id }, { joinedAt: new Date(Date.now() - 30 * MIN) });

    section("5. Chat and list permissions");
    await LmsChatMessage.create({ sessionId: id, userId: alice.user._id, content: "hello" }).catch(() => null);
    check("a member reads the chat history", (await call("GET", `/live-sessions/${id}/chat`, alice.token)).status === 200);
    check("a student outside the cohort cannot read the chat", (await call("GET", `/live-sessions/${id}/chat`, outsider.token)).status === 403);
    check("an invalid session id is 400", (await call("GET", "/live-sessions/nope/chat", alice.token)).status === 400);
    check("a member lists the cohort's sessions", (await call("GET", `/live-sessions?cohortId=${cohort._id}`, alice.token)).status === 200);
    check("an outsider cannot list another cohort's sessions", (await call("GET", `/live-sessions?cohortId=${cohort._id}`, outsider.token)).status === 403);
    check("without cohortId a user only sees their own cohorts", (await call("GET", "/live-sessions", outsider.token)).data.sessions.length === 0);
    check("another tutor cannot read the attendance report", (await call("GET", `/live-sessions/${id}/attendance`, otherTutor.token)).status === 403);

    section("6. Ending a class");
    check("a live class cannot go back to scheduled", (await call("PUT", `/live-sessions/${id}`, tutor.token, { status: "scheduled" })).data.code === "INVALID_TRANSITION");
    check("a live class cannot be rescheduled (SESSION_LOCKED)", (await call("PUT", `/live-sessions/${id}`, tutor.token, { startsAt: at(9 * HOUR), endsAt: at(10 * HOUR) })).data.code === "SESSION_LOCKED");
    check("a live class cannot be cancelled", (await call("DELETE", `/live-sessions/${id}`, tutor.token)).status === 409);
    const ended = await call("PUT", `/live-sessions/${id}`, tutor.token, { status: "ended" });
    check("the tutor ends the class", ended.status === 200 && ended.data.session.status === "ended" && Boolean(ended.data.session.endedAt), ended.data);
    const bobAttendance = await LmsAttendance.findOne({ sessionId: id, userId: bob.user._id });
    check("everyone still in the room is closed out automatically", Boolean(bobAttendance.leftAt) && bobAttendance.durationMinutes >= 29, bobAttendance);
    const aliceAttendance = await LmsAttendance.findOne({ sessionId: id, userId: alice.user._id });
    check("and the same for Alice, who had rejoined", Boolean(aliceAttendance.leftAt) && aliceAttendance.durationMinutes >= 19, aliceAttendance);
    check("nobody can join after the class ended", (await call("POST", `/live-sessions/${id}/join`, alice.token)).status === 400);
    check("an ended class is final", (await call("PUT", `/live-sessions/${id}`, tutor.token, { status: "live" })).data.code === "INVALID_TRANSITION");
    const report = await call("GET", `/live-sessions/${id}/attendance`, tutor.token);
    check("the attendance report counts both students present", report.status === 200 && JSON.stringify(report.data).includes("alice"), report.status);

    section("7. Cancelling a class that has not started");
    check("a scheduled class can be cancelled", (await call("DELETE", `/live-sessions/${byAdmin.data.session._id}`, admin.token)).status === 200);
    check("it is gone", (await LmsLiveSession.findById(byAdmin.data.session._id)) === null);
    check("another tutor cannot cancel someone else's class", (await call("DELETE", `/live-sessions/${defaultHost.data.session._id}`, otherTutor.token)).status === 403);
  } catch (error) {
    failures += 1;
    console.error("Unexpected error:", error);
  } finally {
    await LmsAttendance.deleteMany({ cohortId: { $in: created.cohorts } });
    await LmsChatMessage.deleteMany({ sessionId: { $in: created.sessions } });
    await LmsLiveSession.deleteMany({ cohortId: { $in: created.cohorts } });
    await Notification.deleteMany({ recipient: { $in: created.users } });
    await Cohort.deleteMany({ _id: { $in: created.cohorts } });
    await Course.deleteMany({ _id: { $in: created.courses } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  }
  console.log(failures === 0 ? `\n   UNIT 24 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `\n   UNIT 24: ${failures} FAILED of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
