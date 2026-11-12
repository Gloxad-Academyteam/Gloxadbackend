/**
 * Unit 23: course creation governance (spec 23).
 *   node scripts/test-unit23-course-governance.js   # starts its own server
 */
import dotenv from "dotenv";
dotenv.config();
import http from "http";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { app } from "../src/app.js";
import { User } from "../src/models/User.model.js";
import { Course } from "../src/models/Course.model.js";
import { generateToken } from "../src/utils/jwt.js";

const PORT = 3023;
const API = `http://localhost:${PORT}/api`;
let failures = 0, total = 0;
const check = (label, ok, detail) => {
  total += 1;
  if (ok) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`); }
};
const call = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const users = [];
const make = async (role, label, extra = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await User.create({ firstName: label, lastName: "Unit23", username: `u23_${label}_${stamp}`.toLowerCase(), email: `u23_${label}_${stamp}@test.com`.toLowerCase(), password: "Password123!", role, isEmailVerified: true, ...extra });
  users.push(user._id);
  return { user, token: generateToken(user) };
};

const run = async () => {
  await connectDB();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));
  const courseIds = [];
  try {
    const approved = await make("instructor", "approved", { approvalStatus: "approved" });
    const pending = await make("instructor", "pending", { approvalStatus: "pending" });
    const rejected = await make("instructor", "rejected", { approvalStatus: "rejected" });
    const student = await make("student", "student");
    const admin = await make("admin", "admin");
    const body = { title: "U23 Course", category: "Software Development", courseType: "free" };

    console.log("\n1. Approved tutors still author courses");
    const created = await call("POST", "/tutor/courses", approved.token, body);
    check("approved tutor creates a draft", created.status === 201, created.data);
    const courseId = created.data.course?._id;
    if (courseId) courseIds.push(courseId);
    check("approved tutor edits the draft", (await call("PUT", `/tutor/courses/${courseId}`, approved.token, { description: "Updated" })).status === 200);
    check("submitting an incomplete draft is a normal 400, not a role error", (await call("POST", `/tutor/courses/${courseId}/submit`, approved.token, {})).status === 400);

    console.log("\n2. Pending and rejected tutors are refused on all four routes");
    for (const [label, tutor, status] of [["pending", pending, "pending"], ["rejected", rejected, "rejected"]]) {
      for (const [method, path, payload] of [["POST", "/tutor/courses", body], ["PUT", `/tutor/courses/${courseId}`, { description: "x" }], ["POST", `/tutor/courses/${courseId}/submit`, {}], ["POST", `/tutor/courses/${courseId}/appeal`, {}]]) {
        const res = await call(method, path, tutor.token, payload);
        check(`${label} tutor: ${method} ${path.replace(courseId || "", ":id")} is 403 TUTOR_NOT_APPROVED`, res.status === 403 && res.data.code === "TUTOR_NOT_APPROVED" && res.data.approvalStatus === status, res.data);
      }
    }
    check("no course was created by the refused attempts", (await Course.countDocuments({ instructor: { $in: [pending.user._id, rejected.user._id] } })) === 0);

    console.log("\n3. Role checks come first");
    const studentTry = await call("POST", "/tutor/courses", student.token, body);
    check("a student is refused with the role 403, not the approval code", studentTry.status === 403 && studentTry.data.code !== "TUTOR_NOT_APPROVED", studentTry.data);
    check("an admin may author (existing design: the role guard lets admins through instructor routes)", (await call("POST", "/tutor/courses", admin.token, body)).status === 201);
    check("signed-out is 401", (await call("POST", "/tutor/courses", null, body)).status === 401);

    console.log("\n4. What a pending tutor can still do");
    check("apply through showcase-expertise is not blocked by the gate", (await call("POST", "/tutor/showcase-expertise", pending.token, {})).data.code !== "TUTOR_NOT_APPROVED");
    check("read-only course list works", (await call("GET", "/tutor/courses", pending.token)).status === 200);
    check("dashboard stats work", (await call("GET", "/tutor/dashboard-stats", pending.token)).status === 200);

    console.log("\n5. Approval takes effect immediately");
    check("an admin approves the pending tutor", (await call("PUT", `/admin/tutors/${pending.user._id}/approval`, admin.token, { status: "approved" })).status === 200);
    const afterApproval = await call("POST", "/tutor/courses", pending.token, body);
    if (afterApproval.data.course?._id) courseIds.push(afterApproval.data.course._id);
    check("the same token can now create a course", afterApproval.status === 201, afterApproval.data);
  } catch (error) {
    failures += 1;
    console.error("Unexpected error:", error);
  } finally {
    await Course.deleteMany({ instructor: { $in: users } });
    await User.deleteMany({ _id: { $in: users } });
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  }
  console.log(failures === 0 ? `\n   UNIT 23 VERIFICATION COMPLETE: ${total}/${total} PASSED` : `\n   UNIT 23: ${failures} FAILED of ${total}`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
