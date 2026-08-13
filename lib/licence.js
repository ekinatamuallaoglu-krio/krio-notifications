import { LicenceSetting, sequelize } from "./db";
import { decrypt, encrypt } from "./encryption";

const reasons = { not_found: "Lisans anahtarı bulunamadı.", inactive: "Lisans aktif değil.", expired: "Lisansın süresi dolmuş.", in_usage: "Lisans başka bir kurulumda kullanımda." };
async function setting() { await sequelize.sync(); const [value] = await LicenceSetting.findOrCreate({ where: { id: 1 } }); return value; }

export async function checkLicence(licenceKey, { allowExpired = false } = {}) {
  const key = String(licenceKey || "").trim(), current = await setting();
  if (!key || key.length > 64) throw Object.assign(new Error("Geçerli bir lisans anahtarı girin."), { status: 400 });
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${(process.env.LICENCE_API_URL || "https://itsme.krio.tr").replace(/\/$/, "")}/api/licence/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licence_key: key }), signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 429 ? "Lisans servisi istek sınırına ulaştı." : "Lisans servisi yanıt vermedi.");
    const result = await response.json(); if (!result.valid && !(allowExpired && result.reason === "expired")) throw Object.assign(new Error(reasons[result.reason] || "Lisans geçersiz."), { status: 403 }); return { key, result, current };
  } catch (error) { if (error.name === "AbortError") throw new Error("Lisans servisi zaman aşımına uğradı."); throw error; } finally { clearTimeout(timeout); }
}
export async function activateLicence(licenceKey, transaction) { const { key, result, current } = await checkLicence(licenceKey); await current.update({ encryptedKey: encrypt(key), expirationDate: result.expiration_date, checkedAt: new Date() }, { transaction }); return result; }
export async function verifyStoredLicence() { const current = await setting(); if (!current.encryptedKey) throw Object.assign(new Error("Merkez lisansı henüz etkinleştirilmemiş."), { status: 403 }); const { result } = await checkLicence(decrypt(current.encryptedKey), { allowExpired: true }); await current.update({ expirationDate: result.expiration_date, checkedAt: new Date() }); return { expired: !result.valid && result.reason === "expired", expirationDate: result.expiration_date }; }
