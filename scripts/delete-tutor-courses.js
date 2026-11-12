// Removes every course owned by one tutor, plus the records that only exist because of those courses
// (enrolments, payments, reviews, notes, questions, announcements, appeals, conversations and their messages).
//
// It does a dry run by default and only deletes when you add --yes.
//   MONGODB_URI="<your connection string>" node scripts/delete-tutor-courses.js jane.tutor@gloxad.com
//   MONGODB_URI="<your connection string>" node scripts/delete-tutor-courses.js jane.tutor@gloxad.com --yes
//
// Cohorts (Trimester classes) that use these courses block the delete unless you also pass --with-cohorts,
// which removes those cohorts and everything inside them (lessons progress, assignments, labs, live sessions, posts, enrolments).
// Trimesters and scholarships themselves are left alone.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/User.model.js";
import Course from "../src/models/Course.model.js";
import Enrollment from "../src/models/Enrollment.model.js";
import Transaction from "../src/models/Transaction.model.js";
import Review from "../src/models/Review.model.js";
import Appeal from "../src/models/Appeal.model.js";
import { Cohort } from "../src/models/Cohort.model.js";
import { LmsCertificate } from "../src/models/LmsCertificate.model.js";
import { Question, Note, Announcement } from "../src/models/QuestionNoteMisc.model.js";
import { Conversation } from "../src/models/Conversation.model.js";
import { Message } from "../src/models/Message.model.js";
import { CohortEnrolment } from "../src/models/CohortEnrolment.model.js";
import { GradeAudit } from "../src/models/GradeAudit.model.js";
import { LmsLab, LmsLabSubmission } from "../src/models/LmsLab.model.js";
import { LmsFinalProject } from "../src/models/LmsFinalProject.model.js";
import { LmsChannel } from "../src/models/LmsChannel.model.js";
import { LmsPost } from "../src/models/LmsPost.model.js";
import { LmsReply } from "../src/models/LmsReply.model.js";
import { LmsAssignment } from "../src/models/LmsAssignment.model.js";
import { LmsSubmission } from "../src/models/LmsSubmission.model.js";
import { LmsLessonComment } from "../src/models/LmsLessonComment.model.js";
import { LmsLessonProgress } from "../src/models/LmsLessonProgress.model.js";
import { LmsQuizAttempt } from "../src/models/LmsQuizAttempt.model.js";
import { LmsLiveSession } from "../src/models/LmsLiveSession.model.js";
import { LmsAttendance } from "../src/models/LmsAttendance.model.js";
import { LmsPoll } from "../src/models/LmsPoll.model.js";
import { LmsChatMessage } from "../src/models/LmsChatMessage.model.js";

const email = (process.argv[2] || "").trim().toLowerCase();
const confirmed = process.argv.includes("--yes");
const withCohorts = process.argv.includes("--with-cohorts");

const run = async () => {
  if (!email || email.startsWith("--")) throw new Error("Pass the tutor's email as the first argument");
  const connection = await connectDB();
  console.log(`Database host: ${connection.connection.host}`);

  const tutor = await User.findOne({ email }).select("_id role email");
  if (!tutor) throw new Error(`No account with email ${email}`);
  if (tutor.role !== "instructor") throw new Error(`${email} is a ${tutor.role}, not a tutor`);

  const courses = await Course.find({ instructor: tutor._id }).select("_id title status");
  if (courses.length === 0) {
    console.log("This tutor has no courses. Nothing to do.");
    return;
  }
  const ids = courses.map((course) => course._id);
  console.log(`\n${courses.length} courses owned by ${email}:`);
  courses.forEach((course) => console.log(`  - ${course.title} (${course.status})`));

  const cohorts = await Cohort.find({ courseId: { $in: ids } }).select("name courseId");
  if (cohorts.length > 0 && !withCohorts) {
    console.log("\nThese cohorts use the courses, so nothing was deleted. Remove them first or add --with-cohorts:");
    cohorts.forEach((cohort) => console.log(`  - ${cohort.name}`));
    return;
  }
  const cohortIds = cohorts.map((cohort) => cohort._id);
  const sessions = await LmsLiveSession.find({ cohortId: { $in: cohortIds } }).select("_id");
  const sessionIds = sessions.map((item) => item._id);
  const posts = await LmsPost.find({ cohortId: { $in: cohortIds } }).select("_id");
  const postIds = posts.map((item) => item._id);
  if (cohorts.length > 0) {
    console.log(`\n${cohorts.length} cohort(s) will go too:`);
    cohorts.forEach((cohort) => console.log(`  - ${cohort.name}`));
  }

  const conversations = await Conversation.find({ courseId: { $in: ids } }).select("_id");
  const conversationIds = conversations.map((item) => item._id);

  const targets = [
    ["enrolments", Enrollment, { course: { $in: ids } }],
    ["payments", Transaction, { course: { $in: ids } }],
    ["reviews", Review, { course: { $in: ids } }],
    ["questions", Question, { course: { $in: ids } }],
    ["notes", Note, { course: { $in: ids } }],
    ["announcements", Announcement, { course: { $in: ids } }],
    ["appeals", Appeal, { courseId: { $in: ids } }],
    ["certificates", LmsCertificate, { $or: [{ courseId: { $in: ids } }, { cohortId: { $in: cohortIds } }] }],
    ["conversations", Conversation, { courseId: { $in: ids } }],
    ["messages", Message, { conversationId: { $in: conversationIds } }],
    ["cohort enrolments", CohortEnrolment, { cohortId: { $in: cohortIds } }],
    ["cohort grade audits", GradeAudit, { cohortId: { $in: cohortIds } }],
    ["cohort lab submissions", LmsLabSubmission, { cohortId: { $in: cohortIds } }],
    ["cohort labs", LmsLab, { cohortId: { $in: cohortIds } }],
    ["cohort final projects", LmsFinalProject, { cohortId: { $in: cohortIds } }],
    ["cohort assignments", LmsAssignment, { cohortId: { $in: cohortIds } }],
    ["cohort submissions", LmsSubmission, { cohortId: { $in: cohortIds } }],
    ["cohort quiz attempts", LmsQuizAttempt, { cohortId: { $in: cohortIds } }],
    ["cohort lesson progress", LmsLessonProgress, { cohortId: { $in: cohortIds } }],
    ["cohort lesson comments", LmsLessonComment, { cohortId: { $in: cohortIds } }],
    ["cohort replies", LmsReply, { postId: { $in: postIds } }],
    ["cohort posts", LmsPost, { cohortId: { $in: cohortIds } }],
    ["cohort channels", LmsChannel, { cohortId: { $in: cohortIds } }],
    ["live session chat", LmsChatMessage, { sessionId: { $in: sessionIds } }],
    ["live session polls", LmsPoll, { sessionId: { $in: sessionIds } }],
    ["live session attendance", LmsAttendance, { sessionId: { $in: sessionIds } }],
    ["live sessions", LmsLiveSession, { cohortId: { $in: cohortIds } }],
    ["cohorts", Cohort, { _id: { $in: cohortIds } }],
  ];

  console.log("\nRecords that go with them:");
  for (const [label, model, filter] of targets) {
    console.log(`  ${label}: ${await model.countDocuments(filter)}`);
  }

  if (!confirmed) {
    console.log("\nDry run only. Nothing was deleted. Add --yes to delete.");
    return;
  }

  for (const [label, model, filter] of targets) {
    const result = await model.deleteMany(filter);
    console.log(`deleted ${result.deletedCount} ${label}`);
  }
  const result = await Course.deleteMany({ _id: { $in: ids } });
  console.log(`deleted ${result.deletedCount} courses`);
};

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
