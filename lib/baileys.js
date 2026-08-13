import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { deserialize, serialize } from "node:v8";
import makeWASocket, { ALL_WA_PATCH_NAMES, DisconnectReason, downloadMediaMessage, extractMessageContent, getAggregateVotesInPollMessage, getContentType, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";

const dataDir = process.env.KRIO_DATA_DIR || path.join(process.cwd(), "data");
const accountsDir = path.join(dataDir, "baileys-accounts");
const storesDir = path.join(dataDir, "baileys-stores");
const stores = globalThis.__krioWhatsAppAccounts ||= new Map();
const listeners = globalThis.__krioWhatsAppListeners ||= new Map();
const lastInteractiveSend = globalThis.__krioLastInteractiveSend ||= new Map();
const logger = { level: "silent", child() { return this; }, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };

function validId(id) { return typeof id === "string" && /^(default|wa_[a-f0-9]{12})$/.test(id); }
function authDir(id) { return id === "default" ? path.join(dataDir, "baileys-auth") : `${accountsDir}${path.sep}${id}`; }
function freshStore(id) {
  return { id, socket: null, starting: null, status: "connecting", qr: null, user: null, picture: null, chats: new Map(), contacts: new Map(), messages: new Map(), generation: 0, lidToPn: new Map(), pnToLid: new Map(), profilePictures: new Map(), loaded: false, persistTimer: null, persistPromise: Promise.resolve(), deleted: false, hadPriorSync: false, historyReceived: false };
}
function getStore(id) {
  if (!validId(id)) throw new Error("Geçersiz hesap.");
  if (!stores.has(id)) stores.set(id, freshStore(id));
  const store = stores.get(id);
  store.loaded ??= false; store.persistPromise ??= Promise.resolve(); store.deleted ??= false;
  return store;
}
function storePath(id) { return path.join(storesDir, `${id}.bin`); }
async function loadStore(store) {
  if (store.loaded) return;
  store.loaded = true;
  try {
    const saved = deserialize(await fs.readFile(storePath(store.id)));
    for (const key of ["chats", "contacts", "messages", "lidToPn", "pnToLid"]) store[key] = new Map(saved[key] || []);
    store.user = saved.user || store.user;
  } catch (error) { if (error.code !== "ENOENT") console.error("WhatsApp store could not be loaded", { accountId: store.id, error: error.message }); }
}
function persistStore(store) {
  if (store.deleted) return;
  clearTimeout(store.persistTimer);
  store.persistTimer = setTimeout(() => {
    store.persistPromise = store.persistPromise.then(async () => {
      if (store.deleted) return;
      await fs.mkdir(storesDir, { recursive: true });
      const target = storePath(store.id); const temporary = `${target}.${process.pid}.tmp`;
      const snapshot = { user: store.user, chats: [...store.chats], contacts: [...store.contacts], messages: [...store.messages], lidToPn: [...store.lidToPn], pnToLid: [...store.pnToLid] };
      await fs.writeFile(temporary, serialize(snapshot)); await fs.rename(temporary, target);
    }).catch((error) => console.error("WhatsApp store could not be saved", { accountId: store.id, error: error.message }));
  }, 250);
}
function publish(id, type = "update") {
  if (id === "*") { new Set([...listeners.values()].flatMap((set) => [...set])).forEach((listener) => listener(type)); return; }
  listeners.get(id)?.forEach((listener) => listener(type));
  listeners.get("*")?.forEach((listener) => listener(type));
}
export function subscribeWhatsApp(accountId, listener) {
  if (accountId !== "*" && !validId(accountId)) throw new Error("Geçersiz hesap.");
  if (!listeners.has(accountId)) listeners.set(accountId, new Set());
  listeners.get(accountId).add(listener);
  return () => { listeners.get(accountId)?.delete(listener); if (!listeners.get(accountId)?.size) listeners.delete(accountId); };
}
export function getLastInteractiveSend(accountId) { return lastInteractiveSend.get(accountId) || 0; }
function addMapping(store, { lid, pn } = {}) {
  if (!lid || !pn) return;
  store.lidToPn.set(lid, pn); store.pnToLid.set(pn, lid);
}
function addContact(store, contact) {
  if (!contact.id) return;
  store.contacts.set(contact.id, { ...store.contacts.get(contact.id), ...contact });
  addMapping(store, { lid: contact.lid || (contact.id.endsWith("@lid") ? contact.id : undefined), pn: contact.phoneNumber || (contact.id.endsWith("@s.whatsapp.net") ? contact.id : undefined) });
  if (contact.imgUrl === "changed") store.profilePictures.delete(contact.id);
  else if (contact.imgUrl?.startsWith("http")) store.profilePictures.set(contact.id, contact.imgUrl);
}
function addMessages(store, items) {
  for (const message of items) {
    const jid = message.key?.remoteJid;
    if (!jid || jid === "status@broadcast") continue;
    const sender = message.key.participant || jid;
    const senderAlt = message.key.participantAlt || message.key.remoteJidAlt;
    if (sender.endsWith("@lid") && senderAlt?.endsWith("@s.whatsapp.net")) addMapping(store, { lid: sender, pn: senderAlt });
    if (sender.endsWith("@s.whatsapp.net") && senderAlt?.endsWith("@lid")) addMapping(store, { lid: senderAlt, pn: sender });
    if (message.pushName && !message.key.fromMe) {
      addContact(store, { id: sender, notify: message.pushName, ...(sender.endsWith("@lid") && { lid: sender }), ...(sender.endsWith("@s.whatsapp.net") && { phoneNumber: sender }) });
      if (senderAlt) addContact(store, { id: senderAlt, notify: message.pushName, ...(senderAlt.endsWith("@lid") && { lid: senderAlt }), ...(senderAlt.endsWith("@s.whatsapp.net") && { phoneNumber: senderAlt }) });
    }
    const list = store.messages.get(jid) || [];
    if (!list.some((item) => item.key?.id === message.key?.id)) list.push(message);
    list.sort((a, b) => Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0));
    store.messages.set(jid, list.slice(-500));
    if (!store.chats.has(jid)) store.chats.set(jid, { id: jid });
  }
}

function messageContent(message) {
  const content = extractMessageContent(message.message);
  const key = getContentType(content);
  return { key, value: key ? content[key] : null };
}

function contactName(store, jid, alternateJid, pushName) {
  const canonical = store?.lidToPn.get(jid) || jid;
  const alternate = store?.lidToPn.get(alternateJid) || alternateJid;
  const contact = { ...store?.contacts.get(store?.pnToLid.get(canonical)), ...store?.contacts.get(alternate), ...store?.contacts.get(canonical), ...store?.contacts.get(jid) };
  return contact.name || contact.notify || contact.verifiedName || pushName || canonical?.split("@")[0] || "Bilinmeyen";
}

function serializeMessage(message, store) {
  const { key, value } = messageContent(message);
  let type = null, text = "", extra = {};
  if (key === "conversation") { type = "text"; text = value; }
  else if (key === "extendedTextMessage") { type = "text"; text = value.text || ""; }
  else if (key === "imageMessage") { type = "image"; text = value.caption || "Fotoğraf"; }
  else if (key === "videoMessage") { type = value.gifPlayback ? "gif" : "video"; text = value.caption || (value.gifPlayback ? "GIF" : "Video"); }
  else if (key === "audioMessage") { type = "audio"; text = value.ptt ? "Sesli mesaj" : "Ses"; }
  else if (key === "documentMessage") { type = "document"; text = value.fileName || "Belge"; }
  else if (key === "stickerMessage") { type = "sticker"; text = "Çıkartma"; }
  else if (key === "contactMessage") { type = "contact"; text = value.displayName || "Kişi"; extra.contacts = [{ name: value.displayName || "Kişi", vcard: value.vcard || "" }]; }
  else if (key === "contactsArrayMessage") { type = "contact"; text = value.displayName || `${value.contacts?.length || 0} kişi`; extra.contacts = (value.contacts || []).map((contact) => ({ name: contact.displayName || "Kişi", vcard: contact.vcard || "" })); }
  else if (key === "locationMessage" || key === "liveLocationMessage") { type = "location"; text = value.name || value.address || "Konum"; }
  else if (key === "pollCreationMessage" || key === "pollCreationMessageV2" || key === "pollCreationMessageV3") { type = "poll"; text = value.name || "Anket"; extra.poll = { options: (value.options || []).map((option) => option.optionName), votes: (() => { try { return getAggregateVotesInPollMessage(message).map((vote) => ({ name: vote.name, count: vote.voters.length })); } catch { return []; } })() }; }
  else if (key === "groupInviteMessage") { type = "invite"; text = value.groupName || "Grup daveti"; extra.invite = { code: value.inviteCode, expiration: Number(value.inviteExpiration || 0) }; }
  if (!type) return null;
  const context = value?.contextInfo;
  const quoted = context?.quotedMessage ? (() => { const quoted = serializeMessage({ key: { id: context.stanzaId, remoteJid: message.key.remoteJid, fromMe: false }, message: context.quotedMessage, messageTimestamp: 0 }, store); return quoted && { id: quoted.id, type: quoted.type, text: quoted.text }; })() : null;
  const media = ["image", "video", "gif", "audio", "document", "sticker"].includes(type);
  const fromMe = Boolean(message.key.fromMe);
  const senderJid = message.key.participant || (!fromMe ? message.key.remoteJid : store?.user?.id);
  const senderAlt = message.key.participantAlt || message.key.remoteJidAlt;
  return { id: message.key.id, jid: message.key.remoteJid, fromMe, participant: message.key.participant || null, senderName: fromMe ? (store?.user?.name || "Siz") : contactName(store, senderJid, senderAlt, message.pushName), type, text, media, mimetype: value?.mimetype || null, fileName: value?.fileName || null, latitude: value?.degreesLatitude, longitude: value?.degreesLongitude, timestamp: Number(message.messageTimestamp || 0), quoted, reactions: (message.reactions || []).filter((reaction) => reaction.text).map((reaction) => ({ text: reaction.text, own: Boolean(reaction.key?.fromMe), senderName: reaction.key?.fromMe ? "Siz" : contactName(store, reaction.key?.participant || message.key.remoteJid, reaction.key?.participantAlt || message.key.remoteJidAlt) })), ...extra };
}

function findMessage(store, jid, messageId) {
  return (store.messages.get(jid) || []).find((message) => message.key.id === messageId);
}

async function discoverAccounts() {
  getStore("default");
  await fs.mkdir(accountsDir, { recursive: true });
  for (const entry of await fs.readdir(accountsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && validId(entry.name)) getStore(entry.name);
  }
}

async function start(id) {
  const store = getStore(id);
  if (store.socket || store.starting) return store.starting;
  store.starting = (async () => {
    await loadStore(store);
    await fs.mkdir(authDir(id), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authDir(id));
    store.hadPriorSync = Number(state.creds.accountSyncCounter || 0) > 0;
    const generation = ++store.generation;
    const socket = makeWASocket({
      auth: state, logger, syncFullHistory: true, shouldSyncHistoryMessage: () => true, markOnlineOnConnect: false,
      getMessage: async (key) => findMessage(store, key.remoteJid, key.id)?.message,
    });
    store.socket = socket; store.user = state.creds.me || null;
    persistStore(store);
    socket.ev.on("creds.update", async (update) => { await saveCreds(); if (update.me) store.user = update.me; persistStore(store); publish(id, "account"); });
    socket.ev.on("messaging-history.set", ({ chats, contacts, messages, lidPnMappings }) => {
      store.historyReceived = true;
      chats.forEach((chat) => store.chats.set(chat.id, { ...store.chats.get(chat.id), ...chat }));
      lidPnMappings?.forEach((mapping) => addMapping(store, mapping));
      contacts.forEach((contact) => addContact(store, contact)); addMessages(store, messages);
      persistStore(store);
      publish(id, "history");
    });
    socket.ev.on("chats.upsert", (chats) => { chats.forEach((chat) => store.chats.set(chat.id, { ...store.chats.get(chat.id), ...chat })); persistStore(store); publish(id, "chats"); });
    socket.ev.on("chats.update", (chats) => { chats.forEach((chat) => store.chats.set(chat.id, { ...store.chats.get(chat.id), ...chat })); persistStore(store); publish(id, "chats"); });
    socket.ev.on("contacts.upsert", (contacts) => { contacts.forEach((contact) => addContact(store, contact)); persistStore(store); publish(id, "contacts"); });
    socket.ev.on("contacts.update", (contacts) => { contacts.forEach((contact) => addContact(store, contact)); persistStore(store); publish(id, "contacts"); });
    socket.ev.on("lid-mapping.update", (mapping) => { addMapping(store, mapping); persistStore(store); });
    socket.ev.on("messages.upsert", ({ messages }) => { addMessages(store, messages); persistStore(store); publish(id, "messages"); });
    socket.ev.on("messages.update", (updates) => updates.forEach(({ key, update }) => {
      const list = store.messages.get(key.remoteJid) || [];
      const message = list.find((item) => item.key.id === key.id);
      if (message) Object.assign(message, update);
      persistStore(store);
      publish(id, "messages");
    }));
    socket.ev.on("messages.delete", (deletion) => {
      if (deletion.all) store.messages.delete(deletion.jid);
      else deletion.keys.forEach((key) => store.messages.set(key.remoteJid, (store.messages.get(key.remoteJid) || []).filter((message) => message.key.id !== key.id)));
      persistStore(store);
      publish(id, "messages");
    });
    socket.ev.on("messages.reaction", (updates) => updates.forEach(({ key, reaction }) => {
      const message = findMessage(store, key.remoteJid, key.id);
      if (!message) return;
      message.reactions ||= [];
      message.reactions = message.reactions.filter((item) => item.key?.fromMe !== reaction.key?.fromMe || item.key?.participant !== reaction.key?.participant);
      if (reaction.text) message.reactions.push(reaction);
      persistStore(store);
      publish(id, "messages");
    }));
    socket.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
      if (generation !== store.generation) return;
      if (qr) store.qr = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
      if (connection) store.status = connection;
      if (connection === "open") {
        store.qr = null; store.user = socket.user || store.user;
        store.picture = await socket.profilePictureUrl(store.user?.id, "preview", 3000).catch(() => undefined) || null;
        persistStore(store);
      }
      if (connection === "close") {
        store.socket = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) { store.status = "logged-out"; store.qr = null; }
        else setTimeout(() => start(id).catch(() => {}), 1500);
      }
      publish(id, "connection");
    });
  })().finally(() => { store.starting = null; });
  return store.starting;
}

function accountSummary(store) {
  const number = store.user?.id?.split(":")[0]?.split("@")[0];
  return { id: store.id, name: store.user?.name || number || (store.id === "default" ? "WhatsApp 1" : "Yeni hesap"), status: store.status, picture: store.picture };
}

export async function listWhatsAppAccounts() {
  await discoverAccounts();
  await Promise.all([...stores.keys()].map((id) => start(id).catch(() => {})));
  return [...stores.values()].map(accountSummary);
}

export async function createWhatsAppAccount() {
  const id = `wa_${crypto.randomBytes(6).toString("hex")}`;
  await start(id);
  publish("*", "accounts");
  return id;
}

export async function getWhatsAppState(id = "default") {
  const store = getStore(id); await start(id);
  const contactIds = new Set([...store.contacts.keys(), ...store.chats.keys()].map((jid) => store.lidToPn.get(jid) || jid));
  const contacts = [...contactIds].filter((jid) => jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid")).map((jid) => {
    const lid = store.pnToLid.get(jid);
    const contact = { ...store.contacts.get(lid), ...store.contacts.get(jid) };
    const chat = { ...store.chats.get(lid), ...store.chats.get(jid) };
    const fallback = jid.split("@")[0];
    return { id: jid, pictureJid: lid || jid, name: contact.name || contact.notify || contact.verifiedName || chat.name || fallback, phone: jid.endsWith("@s.whatsapp.net") ? fallback : "", picture: store.profilePictures.get(jid) || store.profilePictures.get(lid) || null };
  });
  await Promise.all(contacts.filter((contact) => !store.profilePictures.has(contact.pictureJid)).slice(0, 12).map(async (contact) => {
    const picture = await store.socket?.profilePictureUrl(contact.pictureJid, "preview", 3000).catch(() => undefined);
    store.profilePictures.set(contact.pictureJid, picture || null); contact.picture = picture || null;
  }));
  contacts.forEach((contact) => delete contact.pictureJid);
  contacts.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const chatIds = new Set([...store.chats.keys(), ...store.messages.keys()]);
  const chats = [...chatIds].filter((jid) => jid !== "status@broadcast" && !jid.endsWith("@newsletter")).map((jid) => {
    const canonical = store.lidToPn.get(jid) || jid;
    const contact = { ...store.contacts.get(store.pnToLid.get(canonical)), ...store.contacts.get(canonical), ...store.contacts.get(jid) };
    const chat = store.chats.get(jid) || {};
    const messages = store.messages.get(jid) || store.messages.get(canonical) || [];
    const latest = messages.at(-1);
    const fallback = canonical.split("@")[0];
    return { id: jid, name: chat.name || contact.name || contact.notify || contact.verifiedName || fallback, picture: store.profilePictures.get(jid) || store.profilePictures.get(canonical) || null, lastMessage: (latest && serializeMessage(latest, store)?.text) || "", timestamp: Number(latest?.messageTimestamp || chat.conversationTimestamp || 0), group: jid.endsWith("@g.us") };
  }).sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
  const needsRelink = store.status === "open" && store.hadPriorSync && !store.historyReceived && !contacts.length && !chats.length;
  return { ...accountSummary(store), qr: store.qr, contacts, chats, needsRelink };
}

export async function getWhatsAppMessages(accountId, jid) {
  const store = getStore(accountId); await start(accountId);
  if (typeof jid !== "string" || !jid.includes("@")) throw new Error("Geçersiz sohbet.");
  return (store.messages.get(jid) || []).map((message) => serializeMessage(message, store)).filter(Boolean);
}

export async function sendWhatsAppMessage(accountId, jid, content, options = {}) {
  const store = getStore(accountId); await start(accountId);
  if (store.status !== "open" || !store.socket) throw new Error("WhatsApp hesabı bağlı değil.");
  if (!options.campaign) lastInteractiveSend.set(accountId, Date.now());
  const quoted = options.quotedId ? findMessage(store, jid, options.quotedId) : undefined;
  addMessages(store, [await store.socket.sendMessage(jid, typeof content === "string" ? { text: content } : content, quoted ? { quoted } : undefined)]);
  persistStore(store);
  publish(accountId, "messages");
}

export async function actOnWhatsAppMessage(accountId, jid, action, messageId, value, sourceJid = jid) {
  const store = getStore(accountId); await start(accountId);
  if (store.status !== "open" || !store.socket) throw new Error("WhatsApp hesabı bağlı değil.");
  const message = findMessage(store, sourceJid, messageId);
  if (!message) throw new Error("Mesaj bulunamadı.");
  let result;
  if (action === "react") result = await store.socket.sendMessage(jid, { react: { text: value || "", key: message.key } });
  else if (action === "delete" && message.key.fromMe) result = await store.socket.sendMessage(jid, { delete: message.key });
  else if (action === "edit" && message.key.fromMe && typeof value === "string" && value.trim()) result = await store.socket.sendMessage(jid, { text: value.trim(), edit: message.key });
  else if (action === "forward") result = await store.socket.sendMessage(jid, { forward: message });
  if (result) { publish(accountId, "messages"); return result; }
  throw new Error("Bu işlem bu mesaj için kullanılamaz.");
}

export async function syncWhatsApp(accountId, type) {
  const store = getStore(accountId); await start(accountId);
  if (store.status !== "open" || !store.socket) throw new Error("WhatsApp hesabı bağlı değil.");
  if (type === "contacts") {
    await store.socket.resyncAppState(ALL_WA_PATCH_NAMES, false);
    publish(accountId, "contacts");
    return { requested: ALL_WA_PATCH_NAMES.length };
  }
  if (type === "messages") {
    let requested = 0;
    for (const [jid, messages] of store.messages) {
      const oldest = messages[0];
      if (!oldest?.key?.id || !oldest.messageTimestamp) continue;
      await store.socket.fetchMessageHistory(50, oldest.key, Number(oldest.messageTimestamp) * 1000);
      requested++;
    }
    return { requested };
  }
  throw new Error("Geçersiz eşitleme türü.");
}

export async function downloadWhatsAppMedia(accountId, jid, messageId) {
  const store = getStore(accountId); await start(accountId);
  const message = (store.messages.get(jid) || []).find((item) => item.key.id === messageId);
  if (!message || !serializeMessage(message, store).media) throw new Error("Medya bulunamadı.");
  const serialized = serializeMessage(message, store);
  const buffer = await downloadMediaMessage(message, "buffer", {}, { logger, reuploadRequest: store.socket?.updateMediaMessage });
  return { buffer, mimetype: serialized.mimetype || "application/octet-stream", fileName: serialized.fileName || `${serialized.type}-${messageId}` };
}

export async function logoutWhatsApp(id) {
  const store = getStore(id); store.generation++;
  store.deleted = true; clearTimeout(store.persistTimer); await store.persistPromise;
  const socket = store.socket; store.socket = null; store.status = "logged-out"; store.qr = null; store.user = null; store.picture = null;
  store.chats.clear(); store.contacts.clear(); store.messages.clear(); store.lidToPn.clear(); store.pnToLid.clear(); store.profilePictures.clear();
  if (socket) await socket.logout().catch(() => socket.end());
  await fs.rm(authDir(id), { recursive: true, force: true });
  await fs.rm(storePath(id), { force: true }); store.loaded = true; store.deleted = false;
  if (id !== "default") stores.delete(id);
  publish("*", "accounts"); publish(id, "connection");
}
