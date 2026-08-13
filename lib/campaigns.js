import { Op } from "sequelize";
import { Campaign, CampaignRecipient, GlobalSetting, sequelize } from "./db";
import { getLastInteractiveSend, sendWhatsAppMessage } from "./baileys";

const listeners = globalThis.__krioCampaignListeners ||= new Map(), running = globalThis.__krioCampaignRunning ||= new Set(), timers = globalThis.__krioCampaignTimers ||= new Map();
let ready;
async function prepare() { ready ||= sequelize.sync().then(async () => { const query = sequelize.getQueryInterface(), columns = await query.describeTable(Campaign.tableName); if (!columns.minIntervalSeconds) await query.addColumn(Campaign.tableName, "minIntervalSeconds", { type: "INTEGER", allowNull: false, defaultValue: 30 }); if (!columns.maxIntervalSeconds) await query.addColumn(Campaign.tableName, "maxIntervalSeconds", { type: "INTEGER", allowNull: false, defaultValue: 60 }); await CampaignRecipient.update({ status: "queued" }, { where: { status: "sending" } }); }); return ready; }
function publish(accountId) { listeners.get(accountId)?.forEach((listener) => listener()); }
function schedule(accountId, delay) { clearTimeout(timers.get(accountId)); timers.set(accountId, setTimeout(() => run(accountId), Math.max(250, delay))); }
export function subscribeCampaigns(accountId, listener) { if (!listeners.has(accountId)) listeners.set(accountId, new Set()); listeners.get(accountId).add(listener); return () => listeners.get(accountId)?.delete(listener); }

export async function getGlobalSettings() { await prepare(); const [settings] = await GlobalSetting.findOrCreate({ where: { id: 1 } }); return { minIntervalSeconds: settings.minIntervalSeconds, maxIntervalSeconds: settings.maxIntervalSeconds }; }
export async function updateGlobalSettings(minIntervalSeconds, maxIntervalSeconds) {
  minIntervalSeconds = Number(minIntervalSeconds); maxIntervalSeconds = Number(maxIntervalSeconds);
  if (!Number.isInteger(minIntervalSeconds) || !Number.isInteger(maxIntervalSeconds) || minIntervalSeconds < 10 || maxIntervalSeconds < minIntervalSeconds || maxIntervalSeconds > 86400) throw new Error("Gönderim aralığı 10-86400 saniye olmalı; maksimum minimumdan küçük olamaz.");
  await prepare(); const [settings] = await GlobalSetting.findOrCreate({ where: { id: 1 } }); await settings.update({ minIntervalSeconds, maxIntervalSeconds }); return getGlobalSettings();
}
export async function createCampaign(accountId, name, messages) {
  await prepare();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(accountId || "") || typeof name !== "string" || !name.trim() || !Array.isArray(messages) || !messages.length || messages.length > 50) throw new Error("Geçersiz kampanya.");
  if (messages.some(({ phone, text }) => !/^\+?\d{7,15}$/.test(phone || "") || typeof text !== "string" || !text.trim() || text.length > 4096)) throw new Error("Geçersiz alıcı veya mesaj.");
  const { minIntervalSeconds, maxIntervalSeconds } = await getGlobalSettings();
  const campaign = await Campaign.create({ accountId, name: name.trim().slice(0, 120), minIntervalSeconds, maxIntervalSeconds });
  await CampaignRecipient.bulkCreate(messages.map(({ phone, text }) => ({ campaignId: campaign.id, phone: phone.replace(/\D/g, ""), text: text.trim() })));
  publish(accountId); run(accountId); return campaign.id;
}
export async function listCampaigns(accountId) {
  await prepare(); run(accountId); const campaigns = await Campaign.findAll({ where: { accountId }, order: [["createdAt", "DESC"]], limit: 100, raw: true });
  return Promise.all(campaigns.map(async (campaign) => { const recipients = await CampaignRecipient.findAll({ where: { campaignId: campaign.id }, attributes: ["phone", "text", "status", "attempts", "error"], order: [["id", "ASC"]], raw: true }); const counts = recipients.reduce((all, item) => ({ ...all, [item.status]: (all[item.status] || 0) + 1 }), {}); return { ...campaign, counts, total: recipients.length, recipients, failures: recipients.filter((item) => item.status === "failed") }; }));
}
export async function controlCampaign(accountId, id, action) {
  await prepare(); const campaign = await Campaign.findOne({ where: { id, accountId } }); if (!campaign) throw new Error("Kampanya bulunamadı.");
  if (action === "pause" && ["queued", "running"].includes(campaign.status)) campaign.status = "paused";
  else if (action === "resume" && campaign.status === "paused") { campaign.status = "queued"; campaign.nextRunAt = new Date(); }
  else if (action === "cancel" && !["completed", "cancelled"].includes(campaign.status)) { campaign.status = "cancelled"; await CampaignRecipient.update({ status: "cancelled" }, { where: { campaignId: id, status: "queued" } }); }
  else throw new Error("Bu işlem kampanya durumuyla uyumlu değil.");
  await campaign.save(); publish(accountId); if (action === "resume") run(accountId); return listCampaigns(accountId);
}
async function run(accountId) {
  if (running.has(accountId)) return; running.add(accountId);
  try {
    await prepare(); const campaign = await Campaign.findOne({ where: { accountId, status: { [Op.in]: ["queued", "running"] } }, order: [["createdAt", "ASC"]] }); if (!campaign) return;
    const wait = Math.max(new Date(campaign.nextRunAt).getTime() - Date.now(), getLastInteractiveSend(accountId) + 10_000 - Date.now()); if (wait > 0) return schedule(accountId, wait);
    const recipient = await CampaignRecipient.findOne({ where: { campaignId: campaign.id, status: "queued" }, order: [["id", "ASC"]] });
    if (!recipient) { campaign.status = "completed"; await campaign.save(); publish(accountId); return schedule(accountId, 250); }
    campaign.status = "running"; recipient.status = "sending"; recipient.attempts += 1; await Promise.all([campaign.save(), recipient.save()]); publish(accountId);
    try { await sendWhatsAppMessage(accountId, `${recipient.phone}@s.whatsapp.net`, recipient.text, { campaign: true }); recipient.status = "sent"; recipient.error = null; }
    catch (error) { recipient.error = String(error.message || "Gönderilemedi").slice(0, 500); recipient.status = recipient.attempts >= 3 ? "failed" : "queued"; }
    await recipient.save(); await campaign.reload(); if (["cancelled", "paused"].includes(campaign.status)) { publish(accountId); return; } const interval = (Math.floor(Math.random() * (campaign.maxIntervalSeconds - campaign.minIntervalSeconds + 1)) + campaign.minIntervalSeconds) * 1000; campaign.nextRunAt = new Date(Date.now() + interval); await campaign.save(); publish(accountId); schedule(accountId, campaign.nextRunAt - Date.now());
  } finally { running.delete(accountId); }
}
