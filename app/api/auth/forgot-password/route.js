import { NextResponse } from "next/server";
import { createReset } from "../../../../lib/auth";
import { sendPasswordReset } from "../../../../lib/smtp";
export async function POST(request) { const { email } = await request.json(), token = await createReset(email), response = { ok: true, message: "Hesap varsa sıfırlama bağlantısı gönderildi." }; if (token) { const baseUrl = process.env.APP_URL || new URL(request.url).origin, resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`; try { await sendPasswordReset(email, resetUrl); } catch (error) { console.error("Password reset email could not be sent", { error: error.message }); if (process.env.NODE_ENV !== "production") response.resetUrl = `/reset-password?token=${token}`; } } return NextResponse.json(response); }
