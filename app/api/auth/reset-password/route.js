import { NextResponse } from "next/server";
import { authError, resetPassword } from "../../../../lib/auth";
export async function POST(request) { try { const { token, password } = await request.json(); await resetPassword(token, password); return NextResponse.json({ ok: true }); } catch (error) { const { message, status } = authError(error); return NextResponse.json({ error: message }, { status }); } }
