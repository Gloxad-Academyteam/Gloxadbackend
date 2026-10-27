import {
  generatePresignedPutUrl,
  generateSignedGetUrl,
  createMultipartUpload,
  getPresignedPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
} from "../utils/s3.js";

/**
 * POST /api/upload/presigned-url
 * Generate AWS S3 PUT presigned URL for direct client-side upload
 */
export const getPresignedUrl = async (req, res, next) => {
  try {
    const { filename, fileType, folder, fileSize } = req.body;

    if (
      !filename ||
      typeof filename !== "string" ||
      !filename.trim() ||
      !fileType ||
      typeof fileType !== "string" ||
      !fileType.trim()
    ) {
      return res.status(400).json({
        error: "Filename and fileType are required",
      });
    }

    const presignedData = await generatePresignedPutUrl({
      filename: filename.trim(),
      fileType: fileType.trim(),
      folder: folder ? String(folder).trim() : undefined,
      fileSize: fileSize !== undefined ? Number(fileSize) : undefined,
    });

    return res.status(200).json(presignedData);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * GET /api/upload/signed-url?key=...
 * Generate short-lived signed GET URL (5-min TTL) for private S3 assets
 */
export const getSignedUrlController = async (req, res, next) => {
  try {
    const { key, expiresIn } = req.query;

    if (!key || typeof key !== "string" || !key.trim()) {
      return res.status(400).json({
        error: "Key parameter is required",
      });
    }

    const ttl = expiresIn ? Number(expiresIn) : 300;
    const signedUrl = await generateSignedGetUrl(key.trim(), ttl);

    return res.status(200).json({
      signedUrl,
      key: key.trim(),
      expiresIn: ttl,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/upload/multipart/initiate
 * Initiate S3 multipart upload for large video files (>100MB)
 */
export const initiateMultipartController = async (req, res, next) => {
  try {
    const { filename, fileType, folder } = req.body;

    if (
      !filename ||
      typeof filename !== "string" ||
      !filename.trim() ||
      !fileType ||
      typeof fileType !== "string" ||
      !fileType.trim()
    ) {
      return res.status(400).json({
        error: "Filename and fileType are required",
      });
    }

    const result = await createMultipartUpload({
      filename: filename.trim(),
      fileType: fileType.trim(),
      folder: folder ? String(folder).trim() : undefined,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/upload/multipart/presign-part
 * Generate presigned URL for specific part upload
 */
export const presignPartController = async (req, res, next) => {
  try {
    const { key, uploadId, partNumber } = req.body;

    if (!key || !uploadId || partNumber === undefined) {
      return res.status(400).json({
        error: "key, uploadId, and partNumber are required",
      });
    }

    const result = await getPresignedPartUrl({
      key: String(key).trim(),
      uploadId: String(uploadId).trim(),
      partNumber: Number(partNumber),
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/upload/multipart/complete
 * Finalize S3 multipart upload and return object URL
 */
export const completeMultipartController = async (req, res, next) => {
  try {
    const { key, uploadId, parts } = req.body;

    if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({
        error: "key, uploadId, and parts array are required",
      });
    }

    const result = await completeMultipartUpload({
      key: String(key).trim(),
      uploadId: String(uploadId).trim(),
      parts,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/upload/multipart/abort
 * Abort incomplete multipart upload
 */
export const abortMultipartController = async (req, res, next) => {
  try {
    const { key, uploadId } = req.body;

    if (!key || !uploadId) {
      return res.status(400).json({
        error: "key and uploadId are required",
      });
    }

    const result = await abortMultipartUpload({
      key: String(key).trim(),
      uploadId: String(uploadId).trim(),
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/upload/mock-put/*
 * Developer fallback endpoint for testing direct uploads without live AWS S3 credentials
 */
export const mockUpload = async (req, res) => {
  return res.status(200).json({
    message: "Mock S3 PUT upload successful",
  });
};

/**
 * GET /api/upload/mock-get/*
 * Developer fallback endpoint for simulating signed GET access
 */
export const mockGet = async (req, res) => {
  return res.status(200).json({
    message: "Mock S3 GET retrieval successful",
  });
};

export default {
  getPresignedUrl,
  getSignedUrlController,
  initiateMultipartController,
  presignPartController,
  completeMultipartController,
  abortMultipartController,
  mockUpload,
  mockGet,
};
