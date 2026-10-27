import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signToken = (payload, options = {}) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  const expiresIn = options.expiresIn || env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn, ...options });
};

export const verifyToken = (token) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  return jwt.verify(token, secret);
};

export const verifyTokenWithGracePeriod = (token, graceSeconds = 300) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      // Verify signature without expiration check
      const decoded = jwt.verify(token, secret, { ignoreExpiration: true });
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (decoded.exp && nowSeconds - decoded.exp <= graceSeconds) {
        return decoded;
      }
    }
    throw err;
  }
};

export const generateToken = (payload, options = {}) => {
  if (payload && payload._id) {
    return signToken(
      {
        sub: payload._id,
        role: payload.role,
        tokenVersion: payload.tokenVersion || 0,
      },
      options
    );
  }
  return signToken(payload, options);
};

export default {
  signToken,
  verifyToken,
  verifyTokenWithGracePeriod,
  generateToken,
};
