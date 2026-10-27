import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

const ALLOWED_FOLDERS = [
  "avatars",
  "categories",
  "courses",
  "certifications",
  "resources",
  "logos",
  "signatures",
  "documents",
  "submissions",
  "certificates",
];

export const FOLDER_POLICIES = {
  avatars: {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  categories: {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  },
  logos: {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"],
  },
  signatures: {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  documents: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  submissions: {
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      "application/zip",
      "application/x-zip-compressed",
      "application/pdf",
      "text/plain",
      "text/javascript",
      "text/html",
      "application/json",
    ],
  },
  certifications: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  courses: {
    maxSizeBytes: 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/webp"],
  },
  certificates: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["application/pdf"],
  },
  resources: {
    maxSizeBytes: 20 * 1024 * 1024, // 20MB
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "application/zip"],
  },
};

const PRIVATE_FOLDERS = ["documents", "submissions", "certifications", "certificates"];

const getS3Client = () => {
  return new S3Client({
    region: env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
};

const hasAwsCredentials = () => {
  return Boolean(env.AWS_ACCESS_KEY_ID) && Boolean(env.AWS_SECRET_ACCESS_KEY);
};

/**
 * Generate AWS S3 PUT presigned URL or dev fallback URL
 * Private prefixes return `key` only without public `fileUrl`.
 * @param {Object} params
 * @param {string} params.filename Original filename
 * @param {string} params.fileType File MIME type
 * @param {string} [params.folder] Target storage folder
 * @param {number} [params.fileSize] Optional file size in bytes
 * @returns {Promise<{ uploadUrl: string, fileUrl?: string, key: string, expiresIn: number }>}
 */
export const generatePresignedPutUrl = async ({ filename, fileType, folder, fileSize }) => {
  const targetFolder = ALLOWED_FOLDERS.includes(folder) ? folder : "resources";
  const policy = FOLDER_POLICIES[targetFolder];

  if (policy && policy.allowedMimeTypes && !policy.allowedMimeTypes.includes(fileType)) {
    const error = new Error(
      `Invalid file type '${fileType}' for folder '${targetFolder}'. Allowed types: ${policy.allowedMimeTypes.join(", ")}`
    );
    error.status = 400;
    throw error;
  }

  if (fileSize && policy && policy.maxSizeBytes && Number(fileSize) > policy.maxSizeBytes) {
    const error = new Error(
      `File size exceeds maximum allowed limit of ${Math.round(policy.maxSizeBytes / (1024 * 1024))}MB for folder '${targetFolder}'`
    );
    error.status = 400;
    throw error;
  }

  const isPrivate = PRIVATE_FOLDERS.includes(targetFolder);

  const sanitizedFilename = (filename || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .toLowerCase();

  const timestamp = Date.now();
  const randomUuid = crypto.randomBytes(4).toString("hex");
  const key = `${targetFolder}/${timestamp}-${randomUuid}_${sanitizedFilename}`;
  const expiresIn = 900; // 15 minutes in seconds

  if (!hasAwsCredentials()) {
    console.warn(
      "[S3 DEV NOTICE] AWS credentials missing. Operating in mock presigned mode."
    );
    const mockHost = `http://localhost:${env.PORT || 3001}`;
    const uploadUrl = `${mockHost}/api/upload/mock-put/${key}`;
    const fileUrl = `https://${env.AWS_S3_BUCKET || "gloxad-bucket"}.s3.amazonaws.com/${key}`;

    const response = {
      uploadUrl,
      key,
      expiresIn,
    };
    if (!isPrivate) {
      response.fileUrl = fileUrl;
    }
    return response;
  }

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  const fileUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;

  const response = {
    uploadUrl,
    key,
    expiresIn,
  };
  if (!isPrivate) {
    response.fileUrl = fileUrl;
  }
  return response;
};

/**
 * Generate short-lived signed GET URL (default 5-min TTL) for private S3 assets
 * @param {string} key S3 object key
 * @param {number} [expiresIn=300] Expiration in seconds
 * @returns {Promise<string>}
 */
export const generateSignedGetUrl = async (key, expiresIn = 300) => {
  if (!hasAwsCredentials()) {
    const mockHost = `http://localhost:${env.PORT || 3001}`;
    return `${mockHost}/api/upload/mock-get/${key}?expiresIn=${expiresIn}`;
  }

  const s3Client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Initiate S3 multipart upload for large video files
 * @param {Object} params
 * @param {string} params.filename
 * @param {string} params.fileType
 * @param {string} [params.folder]
 * @returns {Promise<{ uploadId: string, key: string }>}
 */
export const createMultipartUpload = async ({ filename, fileType, folder }) => {
  const targetFolder = ALLOWED_FOLDERS.includes(folder) ? folder : "courses";
  const sanitizedFilename = (filename || "video.mp4")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .toLowerCase();

  const timestamp = Date.now();
  const randomUuid = crypto.randomBytes(4).toString("hex");
  const key = `${targetFolder}/${timestamp}-${randomUuid}_${sanitizedFilename}`;

  if (!hasAwsCredentials()) {
    const mockUploadId = `mock-upload-${Date.now()}-${randomUuid}`;
    return { uploadId: mockUploadId, key };
  }

  const s3Client = getS3Client();
  const command = new CreateMultipartUploadCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: fileType,
  });

  const response = await s3Client.send(command);
  return {
    uploadId: response.UploadId,
    key,
  };
};

/**
 * Generate presigned URL for specific part upload
 * @param {Object} params
 * @param {string} params.key
 * @param {string} params.uploadId
 * @param {number} params.partNumber
 * @param {number} [params.expiresIn=900]
 * @returns {Promise<{ presignedUrl: string, partNumber: number }>}
 */
export const getPresignedPartUrl = async ({ key, uploadId, partNumber, expiresIn = 900 }) => {
  const partNum = Number(partNumber);

  if (!hasAwsCredentials()) {
    const mockHost = `http://localhost:${env.PORT || 3001}`;
    const presignedUrl = `${mockHost}/api/upload/mock-put/${key}?partNumber=${partNum}&uploadId=${uploadId}`;
    return { presignedUrl, partNumber: partNum };
  }

  const s3Client = getS3Client();
  const command = new UploadPartCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNum,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return { presignedUrl, partNumber: partNum };
};

/**
 * Finalize S3 multipart upload and return object URL
 * @param {Object} params
 * @param {string} params.key
 * @param {string} params.uploadId
 * @param {Array<{ partNumber: number, etag: string }>} params.parts
 * @returns {Promise<{ fileUrl: string, key: string }>}
 */
export const completeMultipartUpload = async ({ key, uploadId, parts }) => {
  if (!hasAwsCredentials() || String(uploadId).startsWith("mock-")) {
    const fileUrl = `https://${env.AWS_S3_BUCKET || "gloxad-bucket"}.s3.amazonaws.com/${key}`;
    return { fileUrl, key };
  }

  const formattedParts = (parts || []).map((p) => ({
    PartNumber: Number(p.partNumber),
    ETag: p.etag || p.ETag,
  }));

  const s3Client = getS3Client();
  const command = new CompleteMultipartUploadCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: formattedParts,
    },
  });

  await s3Client.send(command);
  const fileUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
  return { fileUrl, key };
};

/**
 * Abort an incomplete multipart upload
 * @param {Object} params
 * @param {string} params.key
 * @param {string} params.uploadId
 * @returns {Promise<{ message: string }>}
 */
export const abortMultipartUpload = async ({ key, uploadId }) => {
  if (!hasAwsCredentials() || String(uploadId).startsWith("mock-")) {
    return { message: "Multipart upload aborted" };
  }

  const s3Client = getS3Client();
  const command = new AbortMultipartUploadCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    UploadId: uploadId,
  });

  await s3Client.send(command);
  return { message: "Multipart upload aborted" };
};

/**
 * Probe S3 storage bucket connectivity
 * @returns {Promise<boolean>}
 */
export const checkS3Readiness = async () => {
  if (!hasAwsCredentials() || !env.AWS_S3_BUCKET) {
    return true; // Development mock mode counts as ready
  }

  try {
    const s3Client = getS3Client();
    const command = new HeadBucketCommand({
      Bucket: env.AWS_S3_BUCKET,
    });
    await s3Client.send(command);
    return true;
  } catch (err) {
    console.warn(`[S3 READINESS CHECK WARNING] ${err.message}`);
    return false;
  }
};

/**
 * Directly upload in-memory buffer to S3 (used for server-generated certificate PDFs)
 * @param {Object} params
 * @param {string} params.key S3 key
 * @param {Buffer} params.buffer File data
 * @param {string} [params.contentType='application/pdf']
 * @returns {Promise<{ key: string }>}
 */
export const uploadBuffer = async ({ key, buffer, contentType = "application/pdf" }) => {
  if (!hasAwsCredentials()) {
    console.warn(`[S3 DEV NOTICE] AWS credentials missing. Mocked direct upload for ${key}`);
    return { key };
  }

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return { key };
};

export default {
  generatePresignedPutUrl,
  generateSignedGetUrl,
  createMultipartUpload,
  getPresignedPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  checkS3Readiness,
  uploadBuffer,
};
