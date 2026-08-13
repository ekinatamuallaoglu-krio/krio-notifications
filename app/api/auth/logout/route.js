import { NextResponse } from "next/server";
import { logout } from "../../../../lib/auth";
export async function POST(request) { const response = NextResponse.json({ ok: true }); await logout(request, response); return response; }
