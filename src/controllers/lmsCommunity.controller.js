import { LmsChannel } from "../models/LmsChannel.model.js";
import { LmsPost } from "../models/LmsPost.model.js";
import { LmsReply } from "../models/LmsReply.model.js";
import { Cohort } from "../models/Cohort.model.js";

const DEFAULT_CHANNELS = [
  { name: "General", slug: "general" },
  { name: "Q&A", slug: "qa" },
  { name: "Project Showcase", slug: "project-showcase" },
  { name: "Study Groups", slug: "study-groups" },
];

/**
 * Sanitize user input by escaping HTML special characters to prevent stored XSS
 * @param {string} str
 * @returns {string}
 */
const sanitizeInput = (str) => {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .trim();
};

/**
 * GET /api/lms/channels
 * Lists cohort channels (auto-seeds General, Q&A, Showcase, Study Groups if none exist)
 */
export const getChannels = async (req, res, next) => {
  try {
    let { cohortId } = req.query;

    if (!cohortId) {
      // Find first cohort of user
      const userCohort = await Cohort.findOne({
        $or: [{ studentIds: req.user._id }, { instructorIds: req.user._id }],
      }).select("_id");
      if (userCohort) {
        cohortId = userCohort._id;
      }
    }

    if (!cohortId) {
      return res.status(400).json({ error: "cohortId is required" });
    }

    let channels = await LmsChannel.find({ cohortId }).sort({ createdAt: 1 });

    // Auto-seed default channels if cohort has none
    if (channels.length === 0) {
      const seedDocs = DEFAULT_CHANNELS.map((ch) => ({
        cohortId,
        name: ch.name,
        slug: ch.slug,
        postCount: 0,
        isNew: false,
      }));

      channels = await LmsChannel.insertMany(seedDocs);
    }

    return res.status(200).json({
      channels,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/posts
 * Paginated feed of posts filtered by cohortId or channelId
 */
export const getPosts = async (req, res, next) => {
  try {
    const {
      cohortId,
      channelId,
      tag,
      page = 1,
      limit = 10,
    } = req.query;

    const query = { isDeleted: false };

    if (cohortId) query.cohortId = cohortId;
    if (channelId) query.channelId = channelId;
    if (tag) query.tag = tag;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(50, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [posts, total] = await Promise.all([
      LmsPost.find(query)
        .populate("authorId", "firstName lastName email avatarUrl role")
        .populate("channelId", "name slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      LmsPost.countDocuments(query),
    ]);

    const formattedPosts = posts.map((post) => {
      const p = post.toObject();
      const isLiked = (post.likes || []).some(
        (id) => id.toString() === req.user._id.toString()
      );
      return {
        ...p,
        isLiked,
      };
    });

    return res.status(200).json({
      posts: formattedPosts,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/posts
 * Create post with validation, sanitization, and populated author
 */
export const createPost = async (req, res, next) => {
  try {
    const { cohortId, channelId, title, body, tag = "Discussion" } = req.body;

    if (!cohortId || !channelId || !title || !body) {
      return res.status(400).json({
        error: "cohortId, channelId, title, and body are required",
      });
    }

    const cleanTitle = sanitizeInput(title);
    const cleanBody = sanitizeInput(body);

    if (cleanTitle.length === 0 || cleanTitle.length > 120) {
      return res.status(400).json({
        error: "Title must be between 1 and 120 characters",
      });
    }

    if (cleanBody.length === 0 || cleanBody.length > 5000) {
      return res.status(400).json({
        error: "Body must be between 1 and 5000 characters",
      });
    }

    const channel = await LmsChannel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const post = await LmsPost.create({
      cohortId,
      channelId,
      authorId: req.user._id,
      title: cleanTitle,
      body: cleanBody,
      tag: ["Discussion", "Showcase", "Q&A"].includes(tag) ? tag : "Discussion",
      likes: [],
      likesCount: 0,
      repliesCount: 0,
      isReported: false,
      isDeleted: false,
    });

    // Increment channel post count
    channel.postCount = (channel.postCount || 0) + 1;
    await channel.save();

    await post.populate("authorId", "firstName lastName email avatarUrl role");
    await post.populate("channelId", "name slug");

    return res.status(201).json({
      message: "Post created successfully",
      post,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/posts/:id/like
 * Toggle or add like on post
 */
export const likePost = async (req, res, next) => {
  try {
    const post = await LmsPost.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ error: "Post not found" });
    }

    const userIdStr = req.user._id.toString();
    const existingIndex = post.likes.findIndex((id) => id.toString() === userIdStr);

    let isLiked = false;
    if (existingIndex > -1) {
      // Toggle off
      post.likes.splice(existingIndex, 1);
      isLiked = false;
    } else {
      // Toggle on
      post.likes.push(req.user._id);
      isLiked = true;
    }

    post.likesCount = post.likes.length;
    await post.save();

    return res.status(200).json({
      message: isLiked ? "Post liked" : "Post unliked",
      isLiked,
      likesCount: post.likesCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/lms/posts/:id/like
 * Explicitly remove like from post
 */
export const unlikePost = async (req, res, next) => {
  try {
    const post = await LmsPost.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ error: "Post not found" });
    }

    const userIdStr = req.user._id.toString();
    const existingIndex = post.likes.findIndex((id) => id.toString() === userIdStr);

    if (existingIndex > -1) {
      post.likes.splice(existingIndex, 1);
      post.likesCount = post.likes.length;
      await post.save();
    }

    return res.status(200).json({
      message: "Post unliked",
      isLiked: false,
      likesCount: post.likesCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/posts/:id/replies
 * Reads replies to a post
 */
export const getPostReplies = async (req, res, next) => {
  try {
    const post = await LmsPost.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ error: "Post not found" });
    }

    const replies = await LmsReply.find({ postId: req.params.id })
      .populate("authorId", "firstName lastName email avatarUrl role")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      replies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/posts/:id/replies
 * Create reply to a post
 */
export const createPostReply = async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Reply body is required" });
    }

    const post = await LmsPost.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ error: "Post not found" });
    }

    const cleanBody = sanitizeInput(body);

    const reply = await LmsReply.create({
      postId: post._id,
      authorId: req.user._id,
      body: cleanBody,
    });

    post.repliesCount = (post.repliesCount || 0) + 1;
    await post.save();

    await reply.populate("authorId", "firstName lastName email avatarUrl role");

    return res.status(201).json({
      message: "Reply created successfully",
      reply,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/lms/posts/:id
 * Soft deletes post (Author or Admin only)
 */
export const deletePost = async (req, res, next) => {
  try {
    const post = await LmsPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        error: "Access denied. Only the author or an admin can delete this post",
      });
    }

    post.isDeleted = true;
    await post.save();

    // Decrement channel post count
    await LmsChannel.findByIdAndUpdate(post.channelId, {
      $inc: { postCount: -1 },
    });

    return res.status(200).json({
      message: "Post deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/posts/:id/report
 * Flags post for moderation
 */
export const reportPost = async (req, res, next) => {
  try {
    const post = await LmsPost.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ error: "Post not found" });
    }

    post.isReported = true;
    await post.save();

    return res.status(200).json({
      message: "Post has been flagged for moderation",
      post,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/posts/:id/moderate
 * Instructor/admin post moderation: pin, unpin, hide, or lock
 */
export const moderatePost = async (req, res, next) => {
  try {
    const { action } = req.body;
    const post = await LmsPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (action === "pin") {
      post.isPinned = true;
    } else if (action === "unpin") {
      post.isPinned = false;
    } else if (action === "hide") {
      post.isDeleted = true;
    } else if (action === "unhide") {
      post.isDeleted = false;
    } else if (action === "lock") {
      post.isLocked = true;
    } else if (action === "unlock") {
      post.isLocked = false;
    } else {
      return res.status(400).json({ error: "Invalid action. Supported: pin, unpin, hide, unhide, lock, unlock" });
    }

    await post.save();

    return res.status(200).json({
      message: `Post moderation action executed: ${action}`,
      post,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getChannels,
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getPostReplies,
  createPostReply,
  deletePost,
  reportPost,
  moderatePost,
};
