import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Op } from "sequelize";
import { PasswordReset, sequelize, Session, User } from "./db";

const scrypt = promisify(scryptCallback), COOKIE = "krio_session", SESSION_MS = 7 * 86400_000;
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const publicUser = (user) => ({ id: user.id, email: user.email, role: user.role, profileIds: JSON.parse(user.profileIds || "[]") });

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 10 || password.length > 200) throw new Error("Parola en az 10 karakter olmalıdır.");
  const salt = randomBytes(16).toString("hex"), derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  try { const [, salt, expected] = encoded.split(":"), actual = Buffer.from(await scrypt(password, salt, 64)), target = Buffer.from(expected, "hex"); return actual.length === target.length && timingSafeEqual(actual, target); } catch { return false; }
}
export async function prepareAuth() {
  await sequelize.sync();
}
export async function needsSetup() { await prepareAuth(); return await User.count() === 0; }
export async function registerAdmin(email, password, transaction) { const normalized = String(email || "").trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("Geçerli bir e-posta adresi girin."); return User.create({ email: normalized, passwordHash: await hashPassword(password), role: "admin" }, { transaction }); }
export async function currentUser(request) {
  await prepareAuth();
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const session = await Session.findOne({ where: { tokenHash: hashToken(token), expiresAt: { [Op.gt]: new Date() } } });
  const user = session && await User.findByPk(session.userId);
  return user ? publicUser(user) : null;
}
export async function requireUser(request, { admin = false, accountId } = {}) {
  const user = await currentUser(request);
  if (!user) throw Object.assign(new Error("Oturum açmanız gerekiyor."), { status: 401 });
  if (admin && user.role !== "admin") throw Object.assign(new Error("Bu işlem yalnızca yöneticilere açıktır."), { status: 403 });
  if (accountId && user.role !== "admin" && !user.profileIds.includes(accountId)) throw Object.assign(new Error("Bu profile erişiminiz yok."), { status: 403 });
  return user;
}
export async function authenticate(email, password, { admin = false } = {}) {
  await prepareAuth();
  const user = await User.findOne({ where: { email: String(email || "").trim().toLowerCase() } });
  if (!user || !await verifyPassword(password, user.passwordHash)) throw Object.assign(new Error("E-posta veya parola hatalı."), { status: 401 });
  if (admin && user.role !== "admin") throw Object.assign(new Error("Merkez oturumu yalnızca admin hesabıyla açılabilir."), { status: 403 });
  return user;
}
export async function login(response, email, password, options = {}) {
  const user = options.user || await authenticate(email, password, options);
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + SESSION_MS);
  await Session.create({ tokenHash: hashToken(token), userId: user.id, expiresAt });
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  return publicUser(user);
}
export async function logout(request, response) { const token = request.cookies.get(COOKIE)?.value; if (token) await Session.destroy({ where: { tokenHash: hashToken(token) } }); response.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 }); }
export async function createReset(email) {
  await prepareAuth(); const user = await User.findOne({ where: { email: String(email || "").trim().toLowerCase() } }); if (!user) return null;
  await PasswordReset.destroy({ where: { userId: user.id, usedAt: null } }); const token = randomBytes(32).toString("base64url");
  await PasswordReset.create({ tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) }); return token;
}
export async function resetPassword(token, password) {
  await prepareAuth(); const reset = await PasswordReset.findOne({ where: { tokenHash: hashToken(String(token || "")), usedAt: null, expiresAt: { [Op.gt]: new Date() } } });
  if (!reset) throw Object.assign(new Error("Sıfırlama bağlantısı geçersiz veya süresi dolmuş."), { status: 400 });
  await sequelize.transaction(async (transaction) => { await User.update({ passwordHash: await hashPassword(password) }, { where: { id: reset.userId }, transaction }); await reset.update({ usedAt: new Date() }, { transaction }); await Session.destroy({ where: { userId: reset.userId }, transaction }); });
}
export function authError(error) { return { message: error.message || "İşlem başarısız.", status: error.status || 400 }; }
