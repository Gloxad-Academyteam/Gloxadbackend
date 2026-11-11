import mongoose from "mongoose";
import { Category, slugify } from "../models/Category.model.js";

const escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Public Endpoint: GET /api/categories
 * Retrieves full hierarchical category taxonomy tree.
 * Supports filtering by tag, pathway, and optional includeInactive for admins.
 */
export const getCategories = async (req, res, next) => {
  try {
    const { includeInactive, tag, pathway } = req.query;
    const filter = {};

    if (includeInactive !== "true") {
      filter.isActive = { $ne: false };
    }

    if (tag) {
      filter.tags = tag;
    }

    if (pathway) {
      filter.pathways = pathway;
    }

    const categories = await Category.find(filter).sort({ order: 1, name: 1 });
    return res.status(200).json({ categories });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin Endpoint: POST /api/admin/categories
 * Creates a new category with optional subcategories, tags, pathways, and topics.
 */
export const createCategory = async (req, res, next) => {
  try {
    const { name, icon, imageUrl, order, subCategories, tags, pathways, isActive, aliases } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const trimmedName = name.trim();

    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }
    });

    if (existing) {
      return res.status(409).json({ error: "Category with this name already exists" });
    }

    const formattedSubCategories = Array.isArray(subCategories)
      ? subCategories.map((sub) => ({
          name: sub.name,
          topics: Array.isArray(sub.topics) ? sub.topics : [],
          slug: sub.name ? slugify(sub.name) : undefined
        }))
      : [];

    const category = await Category.create({
      name: trimmedName,
      icon: icon || "",
      imageUrl: imageUrl ? String(imageUrl).trim() : "",
      order: order !== undefined ? Number(order) : 0,
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
      pathways: Array.isArray(pathways) ? pathways.map((p) => String(p).trim()).filter(Boolean) : [],
      aliases: Array.isArray(aliases) ? aliases.map((a) => String(a).trim().toLowerCase()).filter(Boolean) : [],
      isActive: isActive !== false,
      subCategories: formattedSubCategories
    });

    return res.status(201).json({
      message: "Category created successfully",
      category
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Category with this name already exists" });
    }
    next(error);
  }
};

/**
 * Admin Endpoint: PUT /api/admin/categories/:id
 * Updates an existing category by MongoDB ObjectId. Preserves previous slugs as aliases.
 */
export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid category ID format" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    const { name, icon, imageUrl, order, subCategories, tags, pathways, isActive, aliases } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const trimmedName = name.trim();
      if (trimmedName.toLowerCase() !== category.name.toLowerCase()) {
        const collision = await Category.findOne({
          _id: { $ne: id },
          name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }
        });
        if (collision) {
          return res.status(409).json({ error: "Category name already exists" });
        }
        // Save previous slug in aliases
        if (category.slug && (!category.aliases || !category.aliases.includes(category.slug))) {
          if (!category.aliases) category.aliases = [];
          category.aliases.push(category.slug);
        }
        category.name = trimmedName;
        category.slug = slugify(trimmedName);
      }
    }

    if (icon !== undefined) {
      category.icon = icon;
    }

    if (imageUrl !== undefined) {
      category.imageUrl = imageUrl ? String(imageUrl).trim() : "";
    }

    if (order !== undefined) {
      category.order = Number(order);
    }

    if (tags !== undefined && Array.isArray(tags)) {
      category.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    }

    if (pathways !== undefined && Array.isArray(pathways)) {
      category.pathways = pathways.map((p) => String(p).trim()).filter(Boolean);
    }

    if (aliases !== undefined && Array.isArray(aliases)) {
      category.aliases = aliases.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
    }

    if (isActive !== undefined) {
      category.isActive = Boolean(isActive);
    }

    if (subCategories !== undefined) {
      if (Array.isArray(subCategories)) {
        category.subCategories = subCategories.map((sub) => ({
          ...(sub._id ? { _id: sub._id } : {}),
          name: sub.name,
          topics: Array.isArray(sub.topics) ? sub.topics : [],
          slug: sub.name ? slugify(sub.name) : undefined
        }));
      }
    }

    await category.save();

    return res.status(200).json({
      message: "Category updated successfully",
      category
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Category name already exists" });
    }
    next(error);
  }
};

/**
 * Admin Endpoint: PUT /api/admin/categories/:id/status
 * Soft activation / deactivation of a category without breaking existing course links.
 */
export const updateCategoryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid category ID format" });
    }

    if (isActive === undefined) {
      return res.status(400).json({ error: "isActive boolean is required" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    category.isActive = Boolean(isActive);
    await category.save();

    return res.status(200).json({
      message: `Category ${category.isActive ? "activated" : "deactivated"} successfully`,
      category
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin Endpoint: DELETE /api/admin/categories/:id
 * Deletes a category if not associated with active courses.
 */
export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid category ID format" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    let activeCourseCount = 0;
    try {
      if (mongoose.models.Course) {
        activeCourseCount = await mongoose.model("Course").countDocuments({
          $or: [{ category: category.name }, { category: category._id }]
        });
      }
    } catch (err) {
      // Course model not registered yet
    }

    if (activeCourseCount > 0) {
      // Soft-deactivate to prevent breaking historical courses or link references
      category.isActive = false;
      await category.save();
      return res.status(200).json({
        message: "Category deactivated to preserve existing course references",
        category,
        deactivated: true
      });
    }

    await Category.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Category deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};
