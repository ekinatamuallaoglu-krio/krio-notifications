import { NextResponse } from "next/server";
import { createMessage, finishMessage } from "../../../lib/messages";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function graphError(responseText) {
  try {
    const error = JSON.parse(responseText).error;
    return [error?.message, error?.error_user_msg].filter(Boolean).join(" — ") || responseText;
  } catch {
    return responseText || "WhatsApp API boş hata yanıtı döndürdü.";
  }
}

export async function POST(request) {
  try { await requireUser(request); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 401 }); }
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "İstek doğrulama adımı: Geçersiz JSON." }, { status: 400 });
  }

  const accessToken = process.env.NEXT_PUBLIC_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.NEXT_PUBLIC_PHONE_NUMBER_ID?.trim();
  const graphApiVersion = process.env.NEXT_PUBLIC_GRAPH_API_VERSION?.trim();
  const recipients = Array.isArray(input.to) ? [...new Set(input.to.map(clean).filter(Boolean))] : [clean(input.to)];
  const templateName = clean(input.templateName);
  const languageCode = clean(input.languageCode);
  if (!accessToken || !/^\d+$/.test(phoneNumberId || "") || !/^v\d+\.\d+$/.test(graphApiVersion || "")) {
    console.error("WhatsApp environment configuration is missing");
    return NextResponse.json({ error: "Servis yapılandırma adımı: WhatsApp environment ayarları eksik veya geçersiz." }, { status: 500 });
  }
  if (!recipients.length || recipients.length > 50 || !templateName || !languageCode) {
    return NextResponse.json({ error: "İstek doğrulama adımı: Tüm alanlar zorunludur." }, { status: 400 });
  }
  if (recipients.some((to) => !/^\+?\d{7,15}$/.test(to))) {
    return NextResponse.json({ error: "İstek doğrulama adımı: Telefon biçimi geçersiz." }, { status: 400 });
  }

  const results = [];
  for (const to of recipients) results.push(await sendTemplate({ accessToken, phoneNumberId, graphApiVersion, to, templateName, languageCode }));
  if (Array.isArray(input.to)) {
    const failed = results.filter((result) => result.message.status !== "sent").length;
    return NextResponse.json({ sent: results.length - failed, failed }, { status: failed ? 207 : 200 });
  }
  const { message, error, status } = results[0];
  return NextResponse.json({ message: message.toJSON(), ...(error && { error }) }, { status });
}

async function sendTemplate({ accessToken, phoneNumberId, graphApiVersion, to, templateName, languageCode }) {
  const message = await createMessage({ to, templateName, languageCode });
  console.info("WhatsApp send started", { id: message.id, to, templateName });

  try {
    const response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to, type: "template",
        template: { name: templateName, language: { code: languageCode } },
      }),
    });
    const responseText = await response.text();
    await finishMessage(message, response.ok ? "sent" : "failed", response.status, responseText);
    const error = response.ok ? null : graphError(responseText);
    console[response.ok ? "info" : "error"]("WhatsApp send finished", {
      id: message.id, step: "WhatsApp API", status: message.status, httpStatus: response.status, ...(error && { error }),
    });
    return { message, error: error && `WhatsApp API adımı: ${error}`, status: response.ok ? 200 : 502 };
  } catch (error) {
    await finishMessage(message, "failed", null, error.message);
    console.error("WhatsApp send failed", { id: message.id, step: "network", error: error.message });
    return { error: `Ağ bağlantısı adımı: ${error.message}`, message, status: 502 };
  }
}
