import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

export function GET(request) {
  const query = request.nextUrl.searchParams;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) return new Response("Webhook is not configured", { status: 500 });
  if (query.get("hub.mode") !== "subscribe" || query.get("hub.verify_token") !== verifyToken) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(query.get("hub.challenge") ?? "", { status: 200 });
}

export async function POST(request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return new Response("Webhook is not configured", { status: 500 });

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  const valid = signature.length === expected.length
    && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!valid) return new Response("Invalid signature", { status: 401 });

  try {
    const payload = JSON.parse(body);
    console.info("WhatsApp webhook received", {
      object: payload.object,
      entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0,
    });
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  return new Response("OK", { status: 200 });
}
