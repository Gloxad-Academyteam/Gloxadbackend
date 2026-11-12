import mongoose from "mongoose";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsAttendance } from "../models/LmsAttendance.model.js";
import { LmsPoll } from "../models/LmsPoll.model.js";
import { LmsChatMessage } from "../models/LmsChatMessage.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { generateLiveKitCredentials } from "../utils/livekit.js";
import { broadcastPollLaunched, broadcastPollClosed, broadcastSessionEnded } from "../socket/live.handler.js";
import { notifyUsers } from "../utils/notify.js";

// Allowed status moves for a live session. "live" normally happens when the host joins; "ended" is final.
const STATUS_MOVES = { scheduled: ["live", "ended"], live: ["ended"], ended: [] };
const SESSION_STATUSES = Object.keys(STATUS_MOVES);

const isMember = (cohort, user) => {
  const id = String(user._id);
  return (
    user.role === "admin" ||
    cohort.studentIds.some((s) => String(s) === id) ||
    cohort.instructorIds.some((i) => String(i) === id)
  );
};

/** Closes every attendance record still open when a class ends, so attendance does not depend on students pressing Leave. */
const closeOpenAttendance = async (session, endedAt) => {
  const open = await LmsAttendance.find({ sessionId: session._id, joinedAt: { $ne: null }, leftAt: null });
  for (const attendance of open) {
    attendance.leftAt = endedAt;
    attendance.durationMinutes = Math.max(1, Math.round((endedAt.getTime() - new Date(attendance.joinedAt).getTime()) / 60000));
    await attendance.save();
  }
};

/**
 * GET /api/lms/live-sessions
 * Returns sessions list + header countdown info
 */
export const getLiveSessions = async (req, res, next) => {
  try {
    const { cohortId } = req.query;
    let filter = {};

    if (cohortId) {
      if (!mongoose.isValidObjectId(cohortId)) return res.status(400).json({ error: "Invalid cohort ID format" });
      const requested = await Cohort.findById(cohortId).select("studentIds instructorIds");
      if (!requested) return res.status(404).json({ error: "Cohort not found" });
      if (!isMember(requested, req.user)) {
        return res.status(403).json({ error: "You are not enrolled in this cohort", code: "COHORT_ACCESS_DENIED" });
      }
      filter.cohortId = cohortId;
    } else {
      // Find user cohorts
      const userCohorts = await Cohort.find({
        $or: [{ studentIds: req.user._id }, { instructorIds: req.user._id }],
      }).select("_id");
      filter.cohortId = { $in: userCohorts.map((c) => c._id) };
    }

    const sessions = await LmsLiveSession.find(filter)
      .populate("instructorId", "firstName lastName avatarUrl")
      .populate("cohortId", "name")
      .sort({ startsAt: 1 });

    const now = new Date();
    // Soonest upcoming or currently live session
    const nextSession =
      sessions.find((s) => s.status === "live") ||
      sessions.find((s) => new Date(s.startsAt) >= now && s.status !== "ended") ||
      null;

    const nextInfo = nextSession
      ? {
          _id: nextSession._id,
          title: nextSession.title,
          startsAt: nextSession.startsAt,
          endsAt: nextSession.endsAt,
          status: nextSession.status,
          roomName: nextSession.roomName,
          cohortId: nextSession.cohortId,
        }
      : null;

    return res.status(200).json({
      sessions,
      next: nextInfo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/live-sessions
 * Schedule live lecture
 */
export const createLiveSession = async (req, res, next) => {
  try {
    const { cohortId, title, description } = req.body || {};
    if (!cohortId || !title || !req.body?.startsAt || !req.body?.endsAt) {
      return res.status(400).json({ error: "cohortId, title, startsAt, and endsAt are required" });
    }
    if (!mongoose.isValidObjectId(cohortId)) return res.status(400).json({ error: "Invalid cohort ID format" });

    // Times are stored in UTC. Anything the client sends is parsed to an absolute instant.
    const startsAt = new Date(req.body.startsAt);
    const endsAt = new Date(req.body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: "startsAt and endsAt must be valid dates" });
    }
    if (endsAt <= startsAt) return res.status(400).json({ error: "endsAt must be after startsAt" });
    if (startsAt <= new Date()) return res.status(400).json({ error: "A live class must start in the future" });

    const cohort = await Cohort.findById(cohortId);
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const isAssignedTutor = cohort.instructorIds.some((id) => id.toString() === req.user._id.toString());
    const isAdmin = req.user.role === "admin";
    if (!isAssignedTutor && !isAdmin) {
      return res.status(403).json({ error: "You are not authorized to schedule live sessions for this cohort" });
    }

    // A tutor hosts their own class. An admin schedules on behalf of one of the cohort's tutors.
    let instructorId = req.user._id;
    if (isAdmin && !isAssignedTutor) {
      const requested = req.body.instructorId ?? cohort.instructorIds[0];
      if (!requested) return res.status(422).json({ error: "This cohort has no tutor. Assign a tutor before scheduling a class." });
      if (!cohort.instructorIds.some((id) => id.toString() === String(requested))) {
        return res.status(422).json({ error: "The host must be a tutor assigned to this cohort" });
      }
      instructorId = requested;
    }

    const roomName = `cohort-${cohortId}-${Date.now()}`;

    const session = await LmsLiveSession.create({
      cohortId,
      title: String(title).trim(),
      description: (description || "").trim(),
      instructorId,
      startsAt,
      endsAt,
      status: "scheduled",
      provider: "livekit",
      roomName,
    });

    await notifyUsers(cohort.studentIds, {
      title: "New live class",
      message: `"${session.title}" is scheduled for ${startsAt.toISOString()}.`,
      type: "live_class_scheduled",
      link: "/lms/live-sessions",
    });

    return res.status(201).json({
      message: "Live session scheduled successfully",
      session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/live-sessions/:id
 * Update live session details
 */
export const updateLiveSession = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid session ID format" });
    const session = await LmsLiveSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const isOwner =
      session.instructorId.toString() === req.user._id.toString() ||
      req.user.role === "admin";
    if (!isOwner) {
      return res.status(403).json({
        error: "You are not authorized to update this session",
      });
    }

    const { title, description, status, recordingUrl } = req.body || {};
    const timeChange = req.body?.startsAt !== undefined || req.body?.endsAt !== undefined;

    if (status !== undefined) {
      if (!SESSION_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${SESSION_STATUSES.join(", ")}` });
      }
      if (status !== session.status && !STATUS_MOVES[session.status].includes(status)) {
        return res.status(409).json({ error: `A session that is ${session.status} cannot become ${status}`, code: "INVALID_TRANSITION", allowed: STATUS_MOVES[session.status] });
      }
    }

    if (timeChange) {
      // Countdown, join window and attendance window all come from these two times, so they move together
      if (session.status !== "scheduled") {
        return res.status(409).json({ error: "Only a class that has not started can be rescheduled", code: "SESSION_LOCKED" });
      }
      const startsAt = req.body.startsAt !== undefined ? new Date(req.body.startsAt) : session.startsAt;
      const endsAt = req.body.endsAt !== undefined ? new Date(req.body.endsAt) : session.endsAt;
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        return res.status(400).json({ error: "startsAt and endsAt must be valid dates" });
      }
      if (endsAt <= startsAt) return res.status(400).json({ error: "endsAt must be after startsAt" });
      if (startsAt <= new Date()) return res.status(400).json({ error: "A live class must start in the future" });
      session.startsAt = startsAt;
      session.endsAt = endsAt;
    }

    if (title) session.title = String(title).trim();
    if (description !== undefined) session.description = String(description).trim();
    if (recordingUrl !== undefined) session.recordingUrl = String(recordingUrl).trim();

    let ended = false;
    if (status && status !== session.status) {
      session.status = status;
      if (status === "ended") {
        session.endedAt = new Date();
        ended = true;
      }
    }

    await session.save();
    if (ended) {
      await closeOpenAttendance(session, session.endedAt);
      // Tell everyone in the room, so their screens leave the class without a refresh
      broadcastSessionEnded(String(session._id));
    }

    if (timeChange) {
      const cohort = await Cohort.findById(session.cohortId).select("studentIds");
      await notifyUsers(cohort?.studentIds, {
        title: "Live class rescheduled",
        message: `"${session.title}" now starts ${new Date(session.startsAt).toISOString()}.`,
        type: "live_class_rescheduled",
        link: "/lms/live-sessions",
      });
    }

    return res.status(200).json({
      message: "Live session updated successfully",
      session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/lms/live-sessions/:id
 * Cancel scheduled session
 */
export const deleteLiveSession = async (req, res, next) => {
  try {
    const session = await LmsLiveSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const isOwner =
      session.instructorId.toString() === req.user._id.toString() ||
      req.user.role === "admin";
    if (!isOwner) {
      return res.status(403).json({
        error: "You are not authorized to cancel this session",
      });
    }

    if (session.status !== "scheduled") {
      return res.status(409).json({ error: "Only a class that has not started can be cancelled", code: "SESSION_LOCKED" });
    }

    await LmsLiveSession.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: "Live session cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/live-sessions/:id/join
 * Issue LiveKit credentials and record attendance
 */
export const joinLiveSession = async (req, res, next) => {
  try {
    const session = await LmsLiveSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const cohort = await Cohort.findById(session.cohortId);
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const userIdStr = req.user._id.toString();
    const isStudent = cohort.studentIds.some((id) => id.toString() === userIdStr);
    const isInstructor =
      cohort.instructorIds.some((id) => id.toString() === userIdStr) ||
      session.instructorId.toString() === userIdStr;
    const isAdmin = req.user.role === "admin";

    if (!isStudent && !isInstructor && !isAdmin) {
      return res.status(403).json({
        error: "You are not enrolled in this live classroom cohort",
      });
    }

    const role = isInstructor || isAdmin ? "host" : "viewer";
    const userName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "User";

    const now = new Date();
    const startsAtMs = new Date(session.startsAt).getTime();
    const tenMinutesBeforeMs = startsAtMs - 10 * 60 * 1000;

    // For students, enforce the 10-minute join window
    if (!isInstructor && !isAdmin) {
      if (now.getTime() < tenMinutesBeforeMs) {
        return res.status(400).json({
          error: "Live classroom join opens 10 minutes prior to session start",
        });
      }
    }
    if (session.status === "ended") {
      return res.status(400).json({
        error: "This live session has already ended",
      });
    }

    // Generate cryptographic LiveKit room credentials
    const credentials = await generateLiveKitCredentials({
      roomName: session.roomName,
      userId: req.user._id,
      userName,
      role,
    });

    // Record attendance
    const attendance = await LmsAttendance.findOne({
      sessionId: session._id,
      userId: req.user._id,
    });

    if (!attendance) {
      await LmsAttendance.create({
        sessionId: session._id,
        cohortId: session.cohortId,
        userId: req.user._id,
        status: "present",
        joinedAt: now,
        leftAt: null,
        durationMinutes: 0,
      });
    } else {
      attendance.status = "present";
      if (!attendance.joinedAt) {
        attendance.joinedAt = now;
      }
      // Coming back after leaving: the person is in the room again
      attendance.leftAt = null;
      await attendance.save();
    }

    // If host joins, transition scheduled session to live
    if (role === "host" && session.status === "scheduled") {
      session.status = "live";
      await session.save();
    }

    return res.status(200).json(credentials);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/live-sessions/:id/chat
 * Backwards-paginated chat history
 */
export const getSessionChatHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid session ID format" });
    const chatSession = await LmsLiveSession.findById(id).select("cohortId");
    if (!chatSession) return res.status(404).json({ error: "Live session not found" });
    const chatCohort = await Cohort.findById(chatSession.cohortId).select("studentIds instructorIds");
    if (!chatCohort || !isMember(chatCohort, req.user)) {
      return res.status(403).json({ error: "You are not enrolled in this live classroom cohort", code: "COHORT_ACCESS_DENIED" });
    }

    const query = { sessionId: id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await LmsChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    // Return chronological order
    messages.reverse();

    return res.status(200).json({
      messages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/live-sessions/:id/polls
 * Create live class poll and broadcast via socket
 */
export const createSessionPoll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { question, options } = req.body;

    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        error: "Question and at least two options are required",
      });
    }

    const session = await LmsLiveSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const isAuthorized =
      session.instructorId.toString() === req.user._id.toString() ||
      req.user.role === "admin";
    if (!isAuthorized) {
      return res.status(403).json({
        error: "Only instructors can launch polls",
      });
    }

    const poll = await LmsPoll.create({
      sessionId: id,
      question: question.trim(),
      options: options.map((opt) => String(opt).trim()),
      votes: [],
      status: "open",
    });

    // Broadcast poll via socket
    broadcastPollLaunched(id, poll);

    return res.status(201).json({
      message: "Poll launched successfully",
      poll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/polls/:pollId/votes
 * Submit single vote per user
 */
export const votePoll = async (req, res, next) => {
  try {
    const { pollId } = req.params;
    const { optionIndex } = req.body;

    if (optionIndex === undefined || typeof optionIndex !== "number") {
      return res.status(400).json({
        error: "optionIndex is required and must be a number",
      });
    }

    const poll = await LmsPoll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    const pollSession = await LmsLiveSession.findById(poll.sessionId).select("cohortId");
    const pollCohort = pollSession ? await Cohort.findById(pollSession.cohortId).select("studentIds instructorIds") : null;
    if (!pollCohort || !isMember(pollCohort, req.user)) {
      return res.status(403).json({ error: "You are not enrolled in this live classroom cohort", code: "COHORT_ACCESS_DENIED" });
    }

    if (poll.status !== "open") {
      return res.status(400).json({ error: "This poll is closed for voting" });
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ error: "Invalid option index" });
    }

    const alreadyVoted = poll.votes.some(
      (v) => v.userId.toString() === req.user._id.toString()
    );
    if (alreadyVoted) {
      return res.status(400).json({
        error: "You have already voted in this poll",
      });
    }

    poll.votes.push({
      userId: req.user._id,
      optionIndex,
    });

    await poll.save();

    return res.status(200).json({
      message: "Vote recorded successfully",
      poll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/live-sessions/:id/attendance
 * Session roster attendance view
 */
export const getSessionAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await LmsLiveSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const isAuthorized =
      session.instructorId.toString() === req.user._id.toString() ||
      req.user.role === "admin";
    if (!isAuthorized) {
      return res.status(403).json({
        error: "Access denied. Instructor role required",
      });
    }

    const cohort = await Cohort.findById(session.cohortId).populate(
      "studentIds",
      "firstName lastName email avatarUrl"
    );

    const attendances = await LmsAttendance.find({ sessionId: id }).populate(
      "userId",
      "firstName lastName email avatarUrl"
    );

    const attendanceMap = new Map();
    attendances.forEach((att) => {
      if (att.userId) {
        attendanceMap.set(att.userId._id.toString(), att);
      }
    });

    const studentRoster = (cohort ? cohort.studentIds : []).map((student) => {
      const att = attendanceMap.get(student._id.toString());
      return {
        userId: student._id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        email: student.email,
        avatarUrl: student.avatarUrl,
        status: att ? att.status : "absent",
        joinedAt: att ? att.joinedAt : null,
        leftAt: att ? att.leftAt : null,
        durationMinutes: att ? att.durationMinutes : 0,
      };
    });

    const presentCount = studentRoster.filter((s) => s.status === "present").length;
    const absentCount = studentRoster.filter((s) => s.status === "absent").length;
    const excusedCount = studentRoster.filter((s) => s.status === "excused").length;

    return res.status(200).json({
      sessionId: id,
      totalEnrolled: studentRoster.length,
      presentCount,
      absentCount,
      excusedCount,
      roster: studentRoster,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/live-sessions/:id/attendance
 * Manual status override (excused/present/absent)
 */
export const updateSessionAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, status } = req.body;

    if (!userId || !["present", "absent", "excused"].includes(status)) {
      return res.status(400).json({
        error: "Valid userId and status (present | absent | excused) are required",
      });
    }

    const session = await LmsLiveSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const isAuthorized =
      session.instructorId.toString() === req.user._id.toString() ||
      req.user.role === "admin";
    if (!isAuthorized) {
      return res.status(403).json({
        error: "Access denied. Instructor role required",
      });
    }

    let attendance = await LmsAttendance.findOne({
      sessionId: id,
      userId,
    });

    if (!attendance) {
      attendance = await LmsAttendance.create({
        sessionId: id,
        cohortId: session.cohortId,
        userId,
        status,
        joinedAt: status === "present" ? new Date() : null,
        leftAt: null,
        durationMinutes: 0,
      });
    } else {
      attendance.status = status;
      await attendance.save();
    }

    return res.status(200).json({
      message: "Attendance status updated successfully",
      attendance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/live-sessions/:id/leave
 * Updates attendee departure time and calculates attendance duration in minutes
 */
export const leaveLiveSession = async (req, res, next) => {
  try {
    const session = await LmsLiveSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Live session not found" });
    }

    const attendance = await LmsAttendance.findOne({
      sessionId: session._id,
      userId: req.user._id,
    });

    if (!attendance) {
      return res.status(404).json({ error: "No active attendance record found for this session" });
    }

    const now = new Date();
    attendance.leftAt = now;
    if (attendance.joinedAt) {
      const durationMs = now.getTime() - new Date(attendance.joinedAt).getTime();
      attendance.durationMinutes = Math.max(1, Math.round(durationMs / 60000));
    }
    await attendance.save();

    return res.status(200).json({
      message: "Leave recorded successfully",
      attendance: {
        sessionId: attendance.sessionId,
        joinedAt: attendance.joinedAt,
        leftAt: attendance.leftAt,
        durationMinutes: attendance.durationMinutes,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getLiveSessions,
  createLiveSession,
  updateLiveSession,
  deleteLiveSession,
  joinLiveSession,
  leaveLiveSession,
  getSessionChatHistory,
  createSessionPoll,
  votePoll,
  getSessionAttendance,
  updateSessionAttendance,
};

const pollView = (poll, userId) => {
  const counts = poll.options.map(() => 0);
  let myVote = null;
  for (const vote of poll.votes ?? []) {
    if (counts[vote.optionIndex] !== undefined) counts[vote.optionIndex] += 1;
    if (String(vote.userId) === String(userId)) myVote = vote.optionIndex;
  }
  return {
    _id: poll._id,
    question: poll.question,
    status: poll.status,
    options: poll.options.map((text, index) => ({ index, text, votes: counts[index] })),
    totalVotes: (poll.votes ?? []).length,
    myVote,
  };
};

/**
 * GET /api/lms/live-sessions/:id
 * One class with its polls (results and the viewer's own vote), so a student who joins late sees what already happened.
 */
export const getLiveSession = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid session ID format" });
    const session = await LmsLiveSession.findById(req.params.id).populate("instructorId", "firstName lastName avatarUrl");
    if (!session) return res.status(404).json({ error: "Live session not found" });

    const cohort = await Cohort.findById(session.cohortId).select("name studentIds instructorIds");
    if (!cohort || !isMember(cohort, req.user)) {
      return res.status(403).json({ error: "You are not enrolled in this live classroom cohort", code: "COHORT_ACCESS_DENIED" });
    }

    const polls = await LmsPoll.find({ sessionId: session._id }).sort({ createdAt: 1 });
    const host = session.instructorId;
    return res.status(200).json({
      session: {
        _id: session._id,
        cohortId: session.cohortId,
        cohortName: cohort.name,
        title: session.title,
        description: session.description,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        endedAt: session.endedAt ?? null,
        status: session.status,
        instructor: host ? { _id: host._id, name: [host.firstName, host.lastName].filter(Boolean).join(" ") || "Tutor" } : null,
        isHost: String(host?._id ?? session.instructorId) === String(req.user._id) || req.user.role === "admin",
      },
      polls: polls.map((poll) => pollView(poll, req.user._id)),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/polls/:pollId/close
 * The host (or an admin) closes a poll; everyone in the room is told.
 */
export const closePoll = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.pollId)) return res.status(400).json({ error: "Invalid poll ID format" });
    const poll = await LmsPoll.findById(req.params.pollId);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const session = await LmsLiveSession.findById(poll.sessionId).select("instructorId");
    const isHost = session && (String(session.instructorId) === String(req.user._id) || req.user.role === "admin");
    if (!isHost) return res.status(403).json({ error: "Only the host can close a poll" });
    if (poll.status === "closed") return res.status(409).json({ error: "This poll is already closed", code: "ALREADY_CLOSED" });

    poll.status = "closed";
    await poll.save();
    const view = pollView(poll, req.user._id);
    broadcastPollClosed(String(poll.sessionId), { ...view, sessionId: poll.sessionId });
    return res.status(200).json({ message: "Poll closed", poll: view });
  } catch (error) {
    next(error);
  }
};
