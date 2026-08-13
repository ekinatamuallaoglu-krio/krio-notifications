import { NextResponse } from "next/server";
import { actOnWhatsAppMessage, createWhatsAppAccount, getWhatsAppMessages, getWhatsAppState, listWhatsAppAccounts, logoutWhatsApp, sendWhatsAppMessage, syncWhatsApp } from "../../../lib/baileys";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const accountId = request.nextUrl.searchParams.get("accountId");
    const jid = request.nextUrl.searchParams.get("jid");
    const user = await requireUser(request, { accountId });
    if (!accountId) { const accounts = await listWhatsAppAccounts(); return NextResponse.json({ accounts: user.role === "admin" ? accounts : accounts.filter(({ id }) => user.profileIds.includes(id)) }); }
    return NextResponse.json(jid ? { messages: await getWhatsAppMessages(accountId, jid) } : await getWhatsAppState(accountId));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 503 });
  }
}

export async function POST(request) {
  try {
    if ((Number(request.headers.get("content-length")) || 0) > 26_000_000) return NextResponse.json({ error: "Dosya en fazla 25 MB olabilir." }, { status: 413 });
    const contentType = request.headers.get("content-type") || "";
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const accountId = form.get("accountId");
      await requireUser(request, { accountId });
      const jid = form.get("jid");
      const text = String(form.get("text") || "").trim();
      const mode = String(form.get("mode") || "file");
      const quotedId = String(form.get("quotedId") || "");
      const file = form.get("file");
      if (typeof accountId !== "string" || typeof jid !== "string" || !/@(?:s\.whatsapp\.net|lid|g\.us)$/.test(jid) || !(file instanceof File) || !file.size || file.size > 25_000_000) return NextResponse.json({ error: "Geçersiz sohbet veya dosya." }, { status: 400 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const name = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(-120) || "dosya";
      let content;
      if (mode === "sticker" && file.type === "image/webp") content = { sticker: bytes, mimetype: file.type };
      else if (file.type.startsWith("image/")) content = { image: bytes, caption: text, mimetype: file.type, viewOnce: mode === "view-once" };
      else if (file.type.startsWith("video/")) content = { video: bytes, caption: text, mimetype: file.type, gifPlayback: mode === "gif", viewOnce: mode === "view-once" };
      else if (file.type.startsWith("audio/")) content = { audio: bytes, mimetype: file.type, ptt: mode === "voice" };
      else content = { document: bytes, fileName: name, mimetype: file.type || "application/octet-stream", caption: text };
      await sendWhatsAppMessage(accountId, jid, content, { quotedId });
      return NextResponse.json({ ok: true });
    }
    const { action, accountId, jid, sourceJid, text, messageId, value, quotedId, contact, location, poll } = await request.json();
    await requireUser(request, { admin: action === "create-account", accountId });
    if (action === "create-account") return NextResponse.json({ accountId: await createWhatsAppAccount() }, { status: 201 });
    if (action === "sync") return NextResponse.json(await syncWhatsApp(accountId, value));
    if (typeof jid !== "string" || !/@(?:s\.whatsapp\.net|lid|g\.us)$/.test(jid)) return NextResponse.json({ error: "Geçersiz sohbet." }, { status: 400 });
    if (["react", "delete", "edit", "forward"].includes(action)) {
      if (typeof jid !== "string" || typeof messageId !== "string") return NextResponse.json({ error: "Eksik mesaj bilgisi." }, { status: 400 });
      await actOnWhatsAppMessage(accountId, jid, action, messageId, value, sourceJid);
      return NextResponse.json({ ok: true });
    }
    if (typeof text !== "string" || !text.trim()) {
      if (action === "contact" && contact?.name && /^\+?\d{7,15}$/.test(contact.phone || "")) {
        const phone = contact.phone.replace(/\D/g, "");
        await sendWhatsAppMessage(accountId, jid, { contacts: { displayName: contact.name, contacts: [{ displayName: contact.name, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name.replace(/[\r\n]/g, " ")}\nTEL;type=CELL;type=VOICE;waid=${phone}:+${phone}\nEND:VCARD` }] } });
        return NextResponse.json({ ok: true });
      }
      if (action === "location" && Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
        await sendWhatsAppMessage(accountId, jid, { location: { degreesLatitude: location.latitude, degreesLongitude: location.longitude, name: String(location.name || "").slice(0, 100), address: String(location.address || "").slice(0, 200) } });
        return NextResponse.json({ ok: true });
      }
      if (action === "poll" && poll?.name && Array.isArray(poll.values) && poll.values.length >= 2 && poll.values.length <= 12) {
        await sendWhatsAppMessage(accountId, jid, { poll: { name: String(poll.name).slice(0, 255), values: poll.values.map((item) => String(item).slice(0, 100)), selectableCount: Math.max(1, Math.min(Number(poll.selectableCount) || 1, poll.values.length)) } });
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "Geçerli bir mesaj içeriği zorunludur." }, { status: 400 });
    }
    await sendWhatsAppMessage(accountId, jid, text.trim(), { quotedId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 503 });
  }
}

export async function DELETE(request) {
  try {
    const accountId = request.nextUrl.searchParams.get("accountId"); await requireUser(request, { admin: true, accountId }); await logoutWhatsApp(accountId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 503 });
  }
}
