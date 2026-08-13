import nodemailer from "nodemailer";
import { sequelize, SmtpSetting } from "./db";
import { decrypt, encrypt } from "./encryption";
const publicSetting = (setting) => setting ? { host: setting.host, port: setting.port, secure: setting.secure, username: setting.username || "", fromName: setting.fromName || "", fromEmail: setting.fromEmail, hasPassword: Boolean(setting.encryptedPassword) } : null;
async function getSetting() { await sequelize.sync(); return SmtpSetting.findByPk(1); }
function transport(setting) { return nodemailer.createTransport({ host: setting.host, port: setting.port, secure: setting.secure, auth: setting.username ? { user: setting.username, pass: decrypt(setting.encryptedPassword) } : undefined }); }

export async function getSmtpSetting() { return publicSetting(await getSetting()); }
export async function updateSmtpSetting(input) {
  const host = String(input.host || "").trim(), port = Number(input.port), fromEmail = String(input.fromEmail || "").trim(), username = String(input.username || "").trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) throw new Error("Geçerli SMTP sunucusu, portu ve gönderen e-postası zorunludur.");
  const current = await getSetting(), values = { host, port, secure: Boolean(input.secure), username, fromName: String(input.fromName || "").trim(), fromEmail };
  if (input.password) values.encryptedPassword = encrypt(String(input.password)); else if (username && !current?.encryptedPassword) throw new Error("SMTP parolası zorunludur.");
  const [setting] = await SmtpSetting.upsert({ id: 1, ...values }, { returning: true }); return publicSetting(setting);
}
export async function verifySmtp() { const setting = await getSetting(); if (!setting) throw new Error("SMTP ayarları yapılmamış."); await transport(setting).verify(); }
export async function sendPasswordReset(email, resetUrl) {
  const setting = await getSetting(); if (!setting) throw new Error("SMTP ayarları yapılmamış.");
  await transport(setting).sendMail({ from: setting.fromName ? { name: setting.fromName, address: setting.fromEmail } : setting.fromEmail, to: email, subject: "Parolanızı sıfırlayın", text: `Parolanızı bir saat içinde sıfırlamak için bağlantıyı açın:\n\n${resetUrl}\n\nBu isteği siz yapmadıysanız bu e-postayı yok sayın.`, html: `<p>Parolanızı bir saat içinde sıfırlamak için aşağıdaki bağlantıyı açın:</p><p><a href="${resetUrl}">Parolamı sıfırla</a></p><p>Bu isteği siz yapmadıysanız bu e-postayı yok sayın.</p>` });
}
