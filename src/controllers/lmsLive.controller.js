import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsAttendance } from "../models/LmsAttendance.model.js";
import { LmsPoll } from "../models/LmsPoll.model.js";
import { LmsChatMessage } from "../models/LmsChatMessage.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { generateLiveKitCredentials } from "../utils/livekit.js";
import { broadcastPollLaunched } from "../socket/live.handler.js";

/**
 * GET /api/lms/live-sessions
 * Returns sessions list + header countdown info
 */
export const getLiveSessions = async (req, res, next) => {
  try {
    const { cohortId } = req.query;
    let filter = {};

    if (cohortId) {
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
    const { cohortId, title, description, startsAt, endsAt } = req.body;

    if (!cohortId || !title || !startsAt || !endsAt) {
      return res.status(400).json({
        error: "cohortId, title, startsAt, and endsAt are required",
      });
    }

    const cohort = await Cohort.findById(cohortId);
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    // Verify instructor authorization
    const isInstructor =
      cohort.instructorIds.some((id) => id.toString() === req.user._id.toString()) ||
      req.user.role === "admin";
    if (!isInstructor) {
      return res.status(403).json({
        error: "You are not authorized to schedule live sessions for this cohort",
      });
    }

    const roomName = `cohort-${cohortId}-${Date.now()}`;

    const session = await LmsLiveSession.create({
      cohortId,
      title: title.trim(),
      description: (description || "").trim(),
      instructorId: req.user._id,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      status: "scheduled",
      provider: "livekit",
      roomName,
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

    const { title, description, startsAt, endsAt, status, recordingUrl } = req.body;

    if (title) session.title = title.trim();
    if (description !== undefined) session.description = description.trim();
    if (startsAt) session.startsAt = new Date(startsAt);
    if (endsAt) session.endsAt = new Date(endsAt);
    if (status) session.status = status;
    if (recordingUrl !== undefined) session.recordingUrl = recordingUrl.trim();

    await session.save();

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
    const endsAtMs = new Date(session.endsAt).getTime();
    const tenMinutesBeforeMs = startsAtMs - 10 * 60 * 1000;

    // For students, enforce the 10-minute join window
    if (!isInstructor && !isAdmin) {
      if (now.getTime() < tenMinutesBeforeMs) {
        return res.status(400).json({
          error: "Live classroom join opens 10 minutes prior to session start",
        });
      }
      if (now.getTime() > endsAtMs && session.status === "ended") {
        return res.status(400).json({
          error: "This live session has already ended",
        });
      }
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
