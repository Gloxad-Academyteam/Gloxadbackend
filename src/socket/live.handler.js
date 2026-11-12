import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsAttendance } from "../models/LmsAttendance.model.js";
import { LmsChatMessage } from "../models/LmsChatMessage.model.js";

let liveNamespace = null;

/**
 * Initialize /live namespace for live classroom real-time synchronization
 * @param {import("socket.io").Server} io
 */
export const initLiveNamespace = (io) => {
  liveNamespace = io.of("/live");

  // JWT Authentication Middleware for /live
  liveNamespace.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token && socket.handshake.headers?.authorization) {
        token = socket.handshake.headers.authorization;
      }
      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }
      if (typeof token === "string" && token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
      }

      const decoded = verifyToken(token);
      const userId = decoded.sub || decoded._id || decoded.id;
      if (!userId) {
        return next(new Error("Authentication error: Invalid token"));
      }

      const user = await User.findById(userId).select("-password");
      if (!user || user.isActive === false) {
        return next(new Error("Authentication error: User inactive or not found"));
      }

      socket.user = {
        _id: user._id.toString(),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
        avatarUrl: user.avatarUrl || user.avatar || "",
      };

      next();
    } catch (err) {
      return next(new Error("Authentication error: Verification failed"));
    }
  });

  liveNamespace.on("connection", (socket) => {
    const user = socket.user;

    // Join session room & record attendance
    socket.on("session:join", async (data) => {
      try {
        const sessionId = typeof data === "string" ? data : data?.sessionId;
        if (!sessionId) return;

        const session = await LmsLiveSession.findById(sessionId);
        if (!session) return;

        socket.currentSessionId = sessionId;
        socket.sessionJoinedAt = new Date();
        socket.join(`session:${sessionId}`);

        // Record or update attendance
        const attendance = await LmsAttendance.findOne({
          sessionId,
          userId: user._id,
        });

        if (!attendance) {
          await LmsAttendance.create({
            sessionId,
            cohortId: session.cohortId,
            userId: user._id,
            status: "present",
            joinedAt: socket.sessionJoinedAt,
            leftAt: null,
            durationMinutes: 0,
          });
        } else {
          attendance.status = "present";
          if (!attendance.joinedAt) {
            attendance.joinedAt = socket.sessionJoinedAt;
          }
          await attendance.save();
        }

        // Broadcast updated participants count
        broadcastParticipantsUpdate(sessionId);
      } catch (err) {
        console.error("Live socket session:join error:", err);
      }
    });

    // Chat message event
    socket.on("chat:message", async (data) => {
      try {
        const sessionId = data?.sessionId || socket.currentSessionId;
        const text = (data?.text || "").trim();
        if (!sessionId || !text) return;

        const chatMessage = await LmsChatMessage.create({
          sessionId,
          authorId: user._id,
          authorName: user.name,
          authorRole: user.role,
          text,
        });

        liveNamespace.to(`session:${sessionId}`).emit("chat:message", {
          _id: chatMessage._id,
          sessionId,
          authorId: user._id,
          authorName: user.name,
          authorRole: user.role,
          text,
          createdAt: chatMessage.createdAt,
        });
      } catch (err) {
        console.error("Live socket chat:message error:", err);
      }
    });

    // Hand raise & lower
    socket.on("hand:raise", (data) => {
      const sessionId = data?.sessionId || socket.currentSessionId;
      if (sessionId) {
        liveNamespace.to(`session:${sessionId}`).emit("hand:raise", {
          userId: user._id,
          name: user.name,
        });
      }
    });

    socket.on("hand:lower", (data) => {
      const sessionId = data?.sessionId || socket.currentSessionId;
      if (sessionId) {
        liveNamespace.to(`session:${sessionId}`).emit("hand:lower", {
          userId: user._id,
          name: user.name,
        });
      }
    });

    // Host terminates live session
    socket.on("session:ended", async (data) => {
      try {
        const sessionId = data?.sessionId || socket.currentSessionId;
        if (!sessionId) return;

        const session = await LmsLiveSession.findById(sessionId);
        if (!session) return;

        const isAuthorized =
          session.instructorId.toString() === user._id || user.role === "admin";
        if (isAuthorized) {
          session.status = "ended";
          session.endsAt = new Date();
          await session.save();

          liveNamespace.to(`session:${sessionId}`).emit("session:ended", {
            sessionId,
            message: "Host has ended the live session",
          });
        }
      } catch (err) {
        console.error("Live socket session:ended error:", err);
      }
    });

    // Handle leave / disconnect
    const handleLeave = async () => {
      const sessionId = socket.currentSessionId;
      if (sessionId) {
        socket.leave(`session:${sessionId}`);
        const leftAt = new Date();
        const joinedAt = socket.sessionJoinedAt || leftAt;
        const durationMinutes = Math.max(1, Math.round((leftAt.getTime() - joinedAt.getTime()) / 60000));

        try {
          await LmsAttendance.findOneAndUpdate(
            { sessionId, userId: user._id },
            {
              $set: { leftAt },
              $inc: { durationMinutes },
            }
          );
        } catch (err) {
          console.error("Live socket leave attendance error:", err);
        }

        socket.currentSessionId = null;
        broadcastParticipantsUpdate(sessionId);
      }
    };

    socket.on("session:leave", handleLeave);
    socket.on("disconnect", handleLeave);
  });

  return liveNamespace;
};

/** How many sockets are in a live class room right now */
export const getLiveRoomCount = (sessionId) => {
  if (!liveNamespace) return 0;
  return liveNamespace.adapter.rooms.get(`session:${sessionId}`)?.size || 0;
};

/**
 * Broadcast participants update with active room count
 * @param {string} sessionId
 */
export const broadcastParticipantsUpdate = async (sessionId) => {
  if (!liveNamespace) return;

  try {
    const room = liveNamespace.adapter.rooms.get(`session:${sessionId}`);
    const count = room ? room.size : 0;
    liveNamespace.to(`session:${sessionId}`).emit("participants:update", {
      sessionId,
      count,
    });
  } catch (err) {
    console.error("Error broadcasting participants update:", err);
  }
};

/**
 * Broadcast poll launched event
 * @param {string} sessionId
 * @param {Object} poll
 */
export const broadcastPollLaunched = (sessionId, poll) => {
  if (liveNamespace) {
    liveNamespace.to(`session:${sessionId}`).emit("poll:launched", poll);
  }
};

/**
 * Broadcast poll closed event
 * @param {string} sessionId
 * @param {Object} pollData
 */
export const broadcastPollClosed = (sessionId, pollData) => {
  if (liveNamespace) {
    liveNamespace.to(`session:${sessionId}`).emit("poll:closed", pollData);
  }
};

/**
 * Broadcast session ended event
 * @param {string} sessionId
 */
export const broadcastSessionEnded = (sessionId) => {
  if (liveNamespace) {
    liveNamespace.to(`session:${sessionId}`).emit("session:ended", {
      sessionId,
      message: "Host has ended the live session",
    });
  }
};

export default {
  initLiveNamespace,
  broadcastParticipantsUpdate,
  broadcastPollLaunched,
  broadcastPollClosed,
  broadcastSessionEnded,
};
