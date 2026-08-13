import { NextResponse } from "next/server";
import { getGlobalSettings, updateGlobalSettings } from "../../../lib/campaigns";
import { requireUser } from "../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) { try { await requireUser(request); return NextResponse.json(await getGlobalSettings()); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); } }
export async function PATCH(request) { try { await requireUser(request, { admin: true }); const { minIntervalSeconds, maxIntervalSeconds } = await request.json(); return NextResponse.json(await updateGlobalSettings(minIntervalSeconds, maxIntervalSeconds)); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); } }
