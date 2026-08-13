import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
export async function GET(request) { const user = await currentUser(request); return NextResponse.json({ user }, { status: user ? 200 : 401 }); }
