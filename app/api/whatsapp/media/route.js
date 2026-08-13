import { NextResponse } from "next/server";
import { downloadWhatsAppMedia } from "../../../../lib/baileys";
import { requireUser } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const accountId = searchParams.get("accountId");
    const jid = searchParams.get("jid");
    const messageId = searchParams.get("messageId");
    await requireUser(request, { accountId });
    if (!jid || !messageId) return NextResponse.json({ error: "Eksik medya bilgisi." }, { status: 400 });
    const { buffer, mimetype, fileName } = await downloadWhatsAppMedia(accountId, jid, messageId);
    const safeName = fileName.replace(/["\r\n\\/]/g, "_");
    return new NextResponse(buffer, { headers: { "Content-Type": mimetype, "Content-Disposition": `${mimetype.startsWith("image/") || mimetype.startsWith("video/") || mimetype.startsWith("audio/") ? "inline" : "attachment"}; filename="${safeName}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
