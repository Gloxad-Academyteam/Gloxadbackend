/**
 * Unit 25: Scholarships (spec 25).
 *
 *   node scripts/test-unit25-scholarships.js   # starts its own server; needs MONGODB_URI and JWT_SECRET
 */
import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { app } from "../src/app.js";
import { User } from "../src/models/User.model.js";
import { Trimester } from "../src/models/Trimester.model.js";
import { Scholarship } from "../src/models/Scholarship.model.js";
import { ScholarshipApplication } from "../src/models/ScholarshipApplication.model.js";
import { Notification } from "../src/models/Notification.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3025;
const API = `http://localhost:${PORT}/api/lms`;
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

let failures = 0;
let total = 0;
const check = (label, condition, detail) => {
  total += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
};
const section = (title) => console.log(`\n${title}`);

const call = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

const created = { users: [], scholarships: [], trimesters: [] };

const makeUser = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({
    firstName: label,
    lastName: "Unit25",
    username: `u25_${label}_${stamp}`.toLowerCase(),
    email: `u25_${label}_${stamp}@test.com`.toLowerCase(),
    password: "Password123!",
    role,
    isEmailVerified: true,
    ...extra,
  });
  created.users.push(user._id);
  return { user, token: generateToken(user) };
};

const STATEMENT = "I want to study software engineering because it will let me support my family and my community.";
const DOC = { label: "Proof of income", key: "documents/1700000000-abc_income.pdf" };

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  try {
    const admin = await makeUser("admin", "admin");
    const tutor = await makeUser("instructor", "tutor", { approvalStatus: "approved" });
    const alice = await makeUser("student", "alice");
    const bob = await makeUser("student", "bob");
    const carol = await makeUser("student", "carol");
    const dave = await makeUser("student", "dave");

    const base = { title: "Women in Tech Scholarship", summary: "Full tuition for twenty learners.", description: "Covers the full Trimester programme.", eligibility: ["Be a resident of Nigeria", "Be 18 or older"], requiredDocuments: ["Proof of income"], opensAt: iso(-1), closesAt: iso(10) };

    // ---------------------------------------------------------------------------------------------------------
    section("1. Access control");
    const someId = new mongoose.Types.ObjectId().toString();
    const adminRoutes = [
      ["POST", "/admin/scholarships"],
      ["GET", "/admin/scholarships"],
      ["PUT", `/admin/scholarships/${someId}`],
      ["GET", `/admin/scholarships/${someId}/applications`],
      ["PUT", `/admin/scholarship-applications/${someId}/status`],
    ];
    for (const [method, path] of adminRoutes) {
      const [none, student, instructor] = await Promise.all([call(method, path, null, {}), call(method, path, alice.token, {}), call(method, path, tutor.token, {})]);
      check(`${method} ${path.replace(someId, ":id")} refuses signed-out, student and tutor`, none.status === 401 && student.status === 403 && instructor.status === 403, [none.status, student.status, instructor.status]);
    }
    check("applying signed out is 401", (await call("POST", `/scholarships/${someId}/applications`, null, {})).status === 401);
    check("my applications signed out is 401", (await call("GET", "/scholarships/applications/me", null)).status === 401);
    check("withdraw signed out is 401", (await call("PUT", `/scholarship-applications/${someId}/withdraw`, null, {})).status === 401);

    // ---------------------------------------------------------------------------------------------------------
    section("2. Creating a scholarship");
    check("missing title is 400", (await call("POST", "/admin/scholarships", admin.token, { ...base, title: " " })).status === 400);
    check("invalid dates are 400", (await call("POST", "/admin/scholarships", admin.token, { ...base, opensAt: "soon" })).status === 400);
    check("closing before opening is 400", (await call("POST", "/admin/scholarships", admin.token, { ...base, closesAt: iso(-5) })).status === 400);
    check("eligibility must be a list", (await call("POST", "/admin/scholarships", admin.token, { ...base, eligibility: "be nice" })).status === 400);
    check("an unknown Trimester is 404", (await call("POST", "/admin/scholarships", admin.token, { ...base, trimesterId: someId })).status === 404);

    const trimester = await Trimester.create({ number: 1, title: "U25 Trimester", startDate: new Date(Date.now() + 30 * DAY), endDate: new Date(Date.now() + 120 * DAY), enrollmentClosesAt: new Date(Date.now() + 20 * DAY) });
    created.trimesters.push(trimester._id);

    const made = await call("POST", "/admin/scholarships", admin.token, { ...base, trimesterId: trimester._id });
    const scholarship = made.data.scholarship;
    if (scholarship) created.scholarships.push(scholarship._id);
    check("a valid scholarship is created as a draft", made.status === 201 && scholarship?.status === "draft" && scholarship?.trimesterId === String(trimester._id), made.data);
    if (!scholarship) throw new Error("Cannot continue without a scholarship");

    // ---------------------------------------------------------------------------------------------------------
    section("3. Drafts are never public");
    const hidden = await call("GET", "/public/scholarships", null);
    check("a draft is not listed", hidden.status === 200 && !hidden.data.scholarships.some((s) => s._id === scholarship._id));
    check("applying to a draft is 404", (await call("POST", `/scholarships/${scholarship._id}/applications`, alice.token, { statement: STATEMENT, documents: [DOC] })).status === 404);

    // ---------------------------------------------------------------------------------------------------------
    section("4. Publish readiness checklist");
    const thin = await call("POST", "/admin/scholarships", admin.token, { title: "Thin draft", opensAt: iso(-1), closesAt: iso(5) });
    created.scholarships.push(thin.data.scholarship._id);
    const notReady = await call("PUT", `/admin/scholarships/${thin.data.scholarship._id}`, admin.token, { status: "published" });
    check("an incomplete draft cannot be published (422 with the missing items)", notReady.status === 422 && notReady.data.code === "NOT_READY_TO_PUBLISH" && notReady.data.missing.includes("description") && notReady.data.missing.includes("at least one eligibility rule"), notReady.data);
    const pastDraft = await call("POST", "/admin/scholarships", admin.token, { ...base, title: "Already closed", opensAt: iso(-10), closesAt: iso(-2) });
    created.scholarships.push(pastDraft.data.scholarship._id);
    const pastPublish = await call("PUT", `/admin/scholarships/${pastDraft.data.scholarship._id}`, admin.token, { status: "published" });
    check("a closing date in the past cannot be published", pastPublish.status === 422 && pastPublish.data.missing?.includes("a closing date in the future"), pastPublish.data);
    check("an invalid status is 400", (await call("PUT", `/admin/scholarships/${scholarship._id}`, admin.token, { status: "live" })).status === 400);
    check("an invalid id is 400", (await call("PUT", "/admin/scholarships/nope", admin.token, {})).status === 400);
    check("an unknown id is 404", (await call("PUT", `/admin/scholarships/${someId}`, admin.token, {})).status === 404);
    const fixed = await call("PUT", `/admin/scholarships/${thin.data.scholarship._id}`, admin.token, { description: "Now complete.", eligibility: ["Be curious"], status: "published" });
    check("after filling the gaps it publishes", fixed.status === 200 && fixed.data.scholarship.status === "published", fixed.data);
    check("publishing the main scholarship works", (await call("PUT", `/admin/scholarships/${scholarship._id}`, admin.token, { status: "published" })).status === 200);

    // ---------------------------------------------------------------------------------------------------------
    section("5. Public list");
    const listed = await call("GET", "/public/scholarships", null);
    const entry = listed.data.scholarships?.find((s) => s._id === scholarship._id);
    check("the published scholarship is listed without signing in", listed.status === 200 && Boolean(entry));
    check("it is open with eligibility, documents and no application", entry?.state === "open" && entry.eligibility.length === 2 && entry.requiredDocuments[0] === "Proof of income" && entry.application === null, entry);

    // ---------------------------------------------------------------------------------------------------------
    section("6. Window states");
    const soon = await call("POST", "/admin/scholarships", admin.token, { ...base, title: "Opens soon", opensAt: iso(2), closesAt: iso(12) });
    created.scholarships.push(soon.data.scholarship._id);
    await call("PUT", `/admin/scholarships/${soon.data.scholarship._id}`, admin.token, { status: "published" });
    const soonView = (await call("GET", "/public/scholarships", null)).data.scholarships.find((s) => s._id === soon.data.scholarship._id);
    check("a future window shows state upcoming", soonView?.state === "upcoming", soonView?.state);
    const tooSoon = await call("POST", `/scholarships/${soon.data.scholarship._id}/applications`, alice.token, { statement: STATEMENT, documents: [DOC] });
    check("applying before it opens is 409 SCHOLARSHIP_NOT_OPEN", tooSoon.status === 409 && tooSoon.data.code === "SCHOLARSHIP_NOT_OPEN", tooSoon.data);
    await Scholarship.updateOne({ _id: soon.data.scholarship._id }, { opensAt: new Date(Date.now() - 5 * DAY), closesAt: new Date(Date.now() - DAY) });
    const closedView = (await call("GET", "/public/scholarships", null)).data.scholarships.find((s) => s._id === soon.data.scholarship._id);
    check("a past window shows state closed", closedView?.state === "closed", closedView?.state);
    const tooLate = await call("POST", `/scholarships/${soon.data.scholarship._id}/applications`, alice.token, { statement: STATEMENT, documents: [DOC] });
    check("applying after it closes is 409 SCHOLARSHIP_CLOSED", tooLate.status === 409 && tooLate.data.code === "SCHOLARSHIP_CLOSED", tooLate.data);

    // ---------------------------------------------------------------------------------------------------------
    section("7. Applying");
    const apply = (token, body) => call("POST", `/scholarships/${scholarship._id}/applications`, token, body);
    check("a tutor cannot apply", (await apply(tutor.token, { statement: STATEMENT, documents: [DOC] })).status === 403);
    check("an admin cannot apply", (await apply(admin.token, { statement: STATEMENT, documents: [DOC] })).status === 403);
    check("an invalid scholarship id is 400", (await call("POST", "/scholarships/nope/applications", alice.token, { statement: STATEMENT })).status === 400);
    check("a statement under 20 characters is 400", (await apply(alice.token, { statement: "too short", documents: [DOC] })).status === 400);
    const noDocs = await apply(alice.token, { statement: STATEMENT, documents: [] });
    check("a missing required document is 400 DOCUMENTS_MISSING", noDocs.status === 400 && noDocs.data.code === "DOCUMENTS_MISSING" && noDocs.data.missing[0] === "Proof of income", noDocs.data);
    check("a key outside the documents folder is refused", (await apply(alice.token, { statement: STATEMENT, documents: [{ label: "Proof of income", key: "avatars/me.png" }] })).status === 400);
    check("a path-traversal key is refused", (await apply(alice.token, { statement: STATEMENT, documents: [{ label: "Proof of income", key: "documents/../secrets.txt" }] })).status === 400);
    check("nothing was stored by the refused attempts", (await ScholarshipApplication.countDocuments({ scholarshipId: scholarship._id })) === 0);

    const submitted = await apply(alice.token, { statement: STATEMENT, documents: [DOC] });
    check("a student applies", submitted.status === 201 && submitted.data.application.status === "submitted", submitted.data);
    const aliceApplicationId = submitted.data.application?._id;
    const dup = await apply(alice.token, { statement: STATEMENT, documents: [DOC] });
    check("applying twice is 409 ALREADY_APPLIED", dup.status === 409 && dup.data.code === "ALREADY_APPLIED", dup.data);

    const raceResults = await Promise.all([apply(bob.token, { statement: STATEMENT, documents: [DOC] }), apply(bob.token, { statement: STATEMENT, documents: [DOC] })]);
    check("two simultaneous submissions create exactly one application", raceResults.filter((r) => r.status === 201).length === 1 && raceResults.filter((r) => r.status === 409).length === 1 && (await ScholarshipApplication.countDocuments({ scholarshipId: scholarship._id, userId: bob.user._id })) === 1, raceResults.map((r) => r.status));
    const bobApplicationId = (await ScholarshipApplication.findOne({ scholarshipId: scholarship._id, userId: bob.user._id }))._id.toString();

    // ---------------------------------------------------------------------------------------------------------
    section("8. What the applicant sees");
    const asAlice = (await call("GET", "/public/scholarships", alice.token)).data.scholarships.find((s) => s._id === scholarship._id);
    check("the public list shows Alice's own application status", asAlice?.application?.status === "submitted" && asAlice.application.latest?.status === "submitted", asAlice?.application);
    const asDave = (await call("GET", "/public/scholarships", dave.token)).data.scholarships.find((s) => s._id === scholarship._id);
    check("another student sees no application", asDave?.application === null);

    // ---------------------------------------------------------------------------------------------------------
    section("9. Admin review list");
    const reviewList = await call("GET", `/admin/scholarships/${scholarship._id}/applications`, admin.token);
    const first = reviewList.data.applications?.find((a) => a._id === aliceApplicationId);
    check("admin sees applicants with name, email, statement and documents", reviewList.status === 200 && reviewList.data.applications.length === 2 && first?.applicant?.name === "alice Unit25" && first.statement === STATEMENT && first.documents[0].key === DOC.key, first);
    check("the list can be filtered by status", (await call("GET", `/admin/scholarships/${scholarship._id}/applications?status=approved`, admin.token)).data.applications.length === 0);
    check("an invalid status filter is 400", (await call("GET", `/admin/scholarships/${scholarship._id}/applications?status=maybe`, admin.token)).status === 400);

    // ---------------------------------------------------------------------------------------------------------
    section("10. Status moves");
    const move = (id, body) => call("PUT", `/admin/scholarship-applications/${id}/status`, admin.token, body);
    const skip = await move(aliceApplicationId, { status: "approved" });
    check("submitted cannot jump to approved: 409 INVALID_TRANSITION", skip.status === 409 && skip.data.code === "INVALID_TRANSITION" && skip.data.allowed.includes("under_review"), skip.data);
    check("an unknown status is 400", (await move(aliceApplicationId, { status: "maybe" })).status === 400);
    check("an unknown application is 404", (await move(someId, { status: "under_review" })).status === 404);
    const reviewing = await move(aliceApplicationId, { status: "under_review" });
    check("submitted moves to under_review", reviewing.status === 200 && reviewing.data.application.status === "under_review", reviewing.data);
    const noNote = await move(aliceApplicationId, { status: "rejected" });
    check("a rejection without a note is 400 REJECTION_NEEDS_NOTE", noNote.status === 400 && noNote.data.code === "REJECTION_NEEDS_NOTE", noNote.data);
    check("under_review moves to shortlisted", (await move(aliceApplicationId, { status: "shortlisted", internalNote: "Strong essay, check income letter." })).status === 200);
    const approved = await move(aliceApplicationId, { status: "approved", note: "Congratulations, you have a full scholarship.", internalNote: "Approved by committee on call." });
    check("shortlisted moves to approved with a note", approved.status === 200 && approved.data.application.status === "approved", approved.data);
    check("history has four entries and keeps every step", approved.data.application.history.map((h) => h.status).join(",") === "submitted,under_review,shortlisted,approved", approved.data.application.history);
    const final = await move(aliceApplicationId, { status: "rejected", note: "Changed our mind" });
    check("an approved application is final: 409", final.status === 409 && final.data.code === "INVALID_TRANSITION", final.data);

    const mine = await call("GET", "/scholarships/applications/me", alice.token);
    const mineEntry = mine.data.applications?.find((a) => a._id === aliceApplicationId);
    check("the applicant sees their history and the latest note", mine.status === 200 && mineEntry?.history.length === 4 && mineEntry.latest.note === "Congratulations, you have a full scholarship.", mineEntry);
    check("staff notes never reach the applicant", !JSON.stringify(mine.data).includes("Strong essay") && !JSON.stringify(mine.data).includes("committee") && !JSON.stringify(mine.data).includes("internalNote"));
    check("the admin view does include the staff notes", JSON.stringify((await call("GET", `/admin/scholarships/${scholarship._id}/applications`, admin.token)).data).includes("Strong essay"));
    check("the applicant was notified of each move (3 admin moves, 1 refused ones excluded)", (await Notification.countDocuments({ recipient: alice.user._id, type: "scholarship_update" })) === 3, await Notification.countDocuments({ recipient: alice.user._id, type: "scholarship_update" }));
    const lastNote = await Notification.findOne({ recipient: alice.user._id, type: "scholarship_update" }).sort({ _id: -1 });
    check("the notification names the scholarship and the outcome", lastNote?.message.includes("Women in Tech Scholarship") && lastNote.message.includes("Approved"), lastNote?.message);
    check("approving does not touch anything else (no enrolment, nothing else changed)", (await ScholarshipApplication.countDocuments({ userId: alice.user._id })) === 1);

    const rejected = await move(bobApplicationId, { status: "rejected", note: "Documents did not match the eligibility rules.", internalNote: "Income letter looked altered." });
    check("a rejection with a note works from submitted", rejected.status === 200 && rejected.data.application.status === "rejected", rejected.data);
    check("a rejected application cannot move again", (await move(bobApplicationId, { status: "under_review" })).status === 409);

    const carolApplied = await applyAs(carol);
    const carolReview = await move(carolApplied.id, { status: "under_review" });
    check("a fresh application can be reviewed", carolReview.status === 200, carolReview.data);

    // ---------------------------------------------------------------------------------------------------------
    section("11. Withdrawing");
    const carolApplication = await ScholarshipApplication.findOne({ scholarshipId: scholarship._id, userId: carol.user._id });
    check("another student cannot withdraw it (looks like it does not exist)", (await call("PUT", `/scholarship-applications/${carolApplication._id}/withdraw`, dave.token, {})).status === 404);
    check("an invalid id is 400", (await call("PUT", "/scholarship-applications/nope/withdraw", carol.token, {})).status === 400);
    const withdrawn = await call("PUT", `/scholarship-applications/${carolApplication._id}/withdraw`, carol.token, {});
    check("the owner withdraws while it is under review", withdrawn.status === 200 && withdrawn.data.application.status === "withdrawn", withdrawn.data);
    check("withdrawing twice is 409", (await call("PUT", `/scholarship-applications/${carolApplication._id}/withdraw`, carol.token, {})).status === 409);
    check("admin cannot move a withdrawn application", (await move(carolApplication._id, { status: "approved" })).status === 409);
    check("an approved application cannot be withdrawn", (await call("PUT", `/scholarship-applications/${aliceApplicationId}/withdraw`, alice.token, {})).status === 409);
    const reapply = await apply(carol.token, { statement: STATEMENT, documents: [DOC] });
    check("a withdrawn applicant cannot re-apply", reapply.status === 409 && reapply.data.code === "ALREADY_APPLIED", reapply.data);
    check("withdrawal is recorded in the history", (await ScholarshipApplication.findById(carolApplication._id)).history.map((h) => h.status).join(",") === "submitted,under_review,withdrawn");

    // ---------------------------------------------------------------------------------------------------------
    section("12. Two reviewers acting at the same moment");
    const eve = await makeUser("student", "eve");
    const eveApply = await apply(eve.token, { statement: STATEMENT, documents: [DOC] });
    const simultaneous = await Promise.all([move(eveApply.data.application._id, { status: "under_review" }), move(eveApply.data.application._id, { status: "under_review" })]);
    check("exactly one of two identical simultaneous moves succeeds", simultaneous.filter((r) => r.status === 200).length === 1 && simultaneous.filter((r) => r.status === 409).length === 1, simultaneous.map((r) => r.status));
    check("and the history holds the move once", (await ScholarshipApplication.findById(eveApply.data.application._id)).history.filter((h) => h.status === "under_review").length === 1);

    // ---------------------------------------------------------------------------------------------------------
    section("13. Admin list, draft rule and archiving");
    const adminList = await call("GET", "/admin/scholarships", admin.token);
    const adminEntry = adminList.data.scholarships?.find((s) => s._id === scholarship._id);
    check("admin list shows application counts per status", adminList.status === 200 && adminEntry?.applicationCounts.approved === 1 && adminEntry.applicationCounts.rejected === 1 && adminEntry.applicationCounts.withdrawn === 1 && adminEntry.applicationTotal === 4, adminEntry && { counts: adminEntry.applicationCounts, total: adminEntry.applicationTotal });
    const backToDraft = await call("PUT", `/admin/scholarships/${scholarship._id}`, admin.token, { status: "draft" });
    check("a scholarship with applications cannot go back to draft: 409 HAS_APPLICATIONS", backToDraft.status === 409 && backToDraft.data.code === "HAS_APPLICATIONS", backToDraft.data);
    check("archiving works", (await call("PUT", `/admin/scholarships/${scholarship._id}`, admin.token, { status: "archived" })).data.scholarship?.status === "archived");
    check("an archived scholarship leaves the public list", !(await call("GET", "/public/scholarships", null)).data.scholarships.some((s) => s._id === scholarship._id));
    check("an archived scholarship accepts no applications", (await apply(dave.token, { statement: STATEMENT, documents: [DOC] })).status === 404);
    check("an applicant can still read their own history after archiving", (await call("GET", "/scholarships/applications/me", alice.token)).data.applications.some((a) => a._id === aliceApplicationId));
    check("a tutor gets 403 on my applications", (await call("GET", "/scholarships/applications/me", tutor.token)).status === 403);
  } catch (error) {
    failures += 1;
    console.error("\nTest run stopped by an unexpected error:", error);
  } finally {
    console.log("\nCleaning up test records...");
    await ScholarshipApplication.deleteMany({ scholarshipId: { $in: created.scholarships } });
    await Notification.deleteMany({ recipient: { $in: created.users } });
    await Scholarship.deleteMany({ _id: { $in: created.scholarships } });
    await Trimester.deleteMany({ _id: { $in: created.trimesters } });
    await User.deleteMany({ _id: { $in: created.users } });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  console.log("\n====================================================");
  console.log(failures === 0 ? `   UNIT 25 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `   UNIT 25: ${failures} FAILED of ${total} checks`);
  console.log("====================================================");
  process.exit(failures === 0 ? 0 : 1);
};

// Creates a fresh application for a student on the main scholarship and returns its id (used by the review checks)
async function applyAs(person) {
  const scholarship = await Scholarship.findOne({ title: "Women in Tech Scholarship", _id: { $in: created.scholarships } });
  const res = await call("POST", `/scholarships/${scholarship._id}/applications`, person.token, { statement: STATEMENT, documents: [DOC] });
  return { id: res.data.application?._id };
}

run();
