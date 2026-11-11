import mongoose from "mongoose";
import { Provider, slugify } from "../models/Provider.model.js";

/**
 * Public Endpoint: GET /api/providers
 * Returns list of active content providers / attribution entities.
 */
export const getProviders = async (req, res, next) => {
  try {
    const { platform, type, ownershipClass, includeInactive } = req.query;
    const filter = {};

    if (includeInactive !== "true") {
      filter.isActive = { $ne: false };
    }

    if (platform) filter.platform = platform;
    if (type) filter.type = type;
    if (ownershipClass) filter.ownershipClass = ownershipClass;

    const providers = await Provider.find(filter).sort({ name: 1 }).lean();
    return res.status(200).json({ providers });
  } catch (error) {
    next(error);
  }
};

/**
 * Public / Admin Endpoint: GET /api/providers/:idOrSlug
 * Returns a single provider by ID or unique slug.
 */
export const getProviderById = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    let provider = null;

    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      provider = await Provider.findById(idOrSlug).lean();
    }
    if (!provider) {
      provider = await Provider.findOne({ slug: idOrSlug.toLowerCase() }).lean();
    }

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    return res.status(200).json({ provider });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin Endpoint: POST /api/admin/providers
 * Creates a new content provider registry entry.
 */
export const createProvider = async (req, res, next) => {
  try {
    const {
      name,
      type,
      platform,
      originalUrl,
      channelUrl,
      avatarUrl,
      ownershipClass,
      embedAllowed,
      bio,
      isActive
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Provider name is required" });
    }

    const trimmedName = name.trim();
    const slug = slugify(trimmedName);

    const existing = await Provider.findOne({
      $or: [{ name: { $regex: new RegExp(`^${trimmedName}$`, "i") } }, { slug }]
    });

    if (existing) {
      return res.status(409).json({ error: "Provider with this name already exists" });
    }

    const provider = await Provider.create({
      name: trimmedName,
      slug,
      type: type || "creator",
      platform: platform || "youtube",
      originalUrl: originalUrl ? String(originalUrl).trim() : "",
      channelUrl: channelUrl ? String(channelUrl).trim() : "",
      avatarUrl: avatarUrl ? String(avatarUrl).trim() : "",
      ownershipClass: ownershipClass || "externally_curated",
      embedAllowed: embedAllowed !== false,
      bio: bio ? String(bio).trim() : "",
      isActive: isActive !== false
    });

    return res.status(201).json({
      message: "Provider created successfully",
      provider
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Provider with this name already exists" });
    }
    next(error);
  }
};

/**
 * Admin Endpoint: PUT /api/admin/providers/:id
 * Updates an existing provider registry entry.
 */
export const updateProvider = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid provider ID format" });
    }

    const provider = await Provider.findById(id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const {
      name,
      type,
      platform,
      originalUrl,
      channelUrl,
      avatarUrl,
      ownershipClass,
      embedAllowed,
      bio,
      isActive
    } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Provider name is required" });
      }
      const trimmedName = name.trim();
      if (trimmedName.toLowerCase() !== provider.name.toLowerCase()) {
        const collision = await Provider.findOne({
          _id: { $ne: id },
          name: { $regex: new RegExp(`^${trimmedName}$`, "i") }
        });
        if (collision) {
          return res.status(409).json({ error: "Provider name already exists" });
        }
        provider.name = trimmedName;
        provider.slug = slugify(trimmedName);
      }
    }

    if (type !== undefined) provider.type = type;
    if (platform !== undefined) provider.platform = platform;
    if (originalUrl !== undefined) provider.originalUrl = String(originalUrl).trim();
    if (channelUrl !== undefined) provider.channelUrl = String(channelUrl).trim();
    if (avatarUrl !== undefined) provider.avatarUrl = String(avatarUrl).trim();
    if (ownershipClass !== undefined) provider.ownershipClass = ownershipClass;
    if (embedAllowed !== undefined) provider.embedAllowed = Boolean(embedAllowed);
    if (bio !== undefined) provider.bio = String(bio).trim();
    if (isActive !== undefined) provider.isActive = Boolean(isActive);

    await provider.save();

    return res.status(200).json({
      message: "Provider updated successfully",
      provider
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Provider name already exists" });
    }
    next(error);
  }
};

/**
 * Admin Endpoint: DELETE /api/admin/providers/:id
 * Soft deactivates or removes a provider registry record.
 */
export const deleteProvider = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid provider ID format" });
    }

    const provider = await Provider.findById(id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    let coursesCount = 0;
    try {
      if (mongoose.models.Course) {
        coursesCount = await mongoose.model("Course").countDocuments({
          $or: [{ provider: provider._id }, { "source.creatorName": provider.name }]
        });
      }
    } catch (_) {}

    if (coursesCount > 0) {
      // Soft-deactivate to prevent breaking course attribution references
      provider.isActive = false;
      await provider.save();
      return res.status(200).json({
        message: "Provider deactivated to preserve course attribution references",
        provider,
        deactivated: true
      });
    }

    await Provider.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Provider deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider
};
