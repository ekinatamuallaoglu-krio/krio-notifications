import { NextResponse } from "next/server";
import { authError, requireUser } from "../../../../lib/auth";
import { getSmtpSetting, updateSmtpSetting, verifySmtp } from "../../../../lib/smtp";

export async function GET(request) { try { await requireUser(request, { admin: true }); return NextResponse.json({ smtp: await getSmtpSetting() }); } catch (error) { const x = authError(error); return NextResponse.json({ error: x.message }, { status: x.status }); } }
export async function PUT(request) { try { await requireUser(request, { admin: true }); return NextResponse.json({ smtp: await updateSmtpSetting(await request.json()) }); } catch (error) { const x = authError(error); return NextResponse.json({ error: x.message }, { status: x.status }); } }
export async function POST(request) { try { await requireUser(request, { admin: true }); await verifySmtp(); return NextResponse.json({ message: "SMTP bağlantısı başarılı." }); } catch (error) { const x = authError(error); return NextResponse.json({ error: x.message }, { status: x.status }); } }
