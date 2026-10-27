import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`[WARN] Missing required environment variable: ${envVar}`);
  }
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("gloxad_academy_super_secret")) {
    throw new Error("[FATAL] JWT_SECRET must be set to a secure, unique secret in production!");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("[FATAL] MONGODB_URI is required in production!");
  }
}

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://www.gloxadacademy.com",
  "https://gloxadacademy.com",
];

const parsedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...DEFAULT_ORIGINS, ...parsedOrigins]));

export const env = {
  PORT: process.env.PORT || 3001,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || "gloxad_academy_super_secret_jwt_key_2026_xyz123!",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  FRONTEND_ORIGINS: allowedOrigins,
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "Gloxad Academy <onboarding@resend.dev>",
  RESEND_APIKEY: process.env.RESEND_APIKEY || process.env.RESEND_API_KEY || "",
  AWS_REGION: process.env.AWS_REGION || "eu-north-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "amzn-v3-buccket-gloxad-sstone",
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || "sk_test_mock_paystack_secret_key_12345",
  LIVEKIT_URL: process.env.LIVEKIT_URL || "wss://gloxad-nirh9mai.livekit.cloud",
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || "devkey",
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || "secret_mock_livekit_key_for_testing_1234567890",
};

export default env;
