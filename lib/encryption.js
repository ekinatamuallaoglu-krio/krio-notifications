import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() { const value = process.env.ENCRYPTION_KEY, buffer = value && Buffer.from(value, "base64"); if (buffer?.length !== 32) throw new Error("ENCRYPTION_KEY 32 byte base64 olmalıdır."); return buffer; }
export function encrypt(value) { if (!value) return null; const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv), encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"); }
export function decrypt(value) { if (!value) return ""; const data = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8"); }
