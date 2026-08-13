import { NextResponse } from "next/server";
import { controlCampaign, createCampaign, listCampaigns } from "../../../lib/campaigns";
import { requireUser } from "../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) { try { const accountId = request.nextUrl.searchParams.get("accountId"); await requireUser(request, { accountId }); return NextResponse.json({ campaigns: await listCampaigns(accountId) }); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); } }
export async function POST(request) { try { const { accountId, name, messages } = await request.json(); await requireUser(request, { accountId }); return NextResponse.json({ id: await createCampaign(accountId, name, messages) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); } }
export async function PATCH(request) { try { const { accountId, id, action } = await request.json(); await requireUser(request, { accountId }); return NextResponse.json({ campaigns: await controlCampaign(accountId, id, action) }); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); } }
