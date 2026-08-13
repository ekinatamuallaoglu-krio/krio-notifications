import { subscribeWhatsApp } from "../../../../lib/baileys";
import { requireUser } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  try { await requireUser(request, { accountId }); } catch (error) { return Response.json({ error: error.message }, { status: error.status || 401 }); }
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat;
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true; clearInterval(heartbeat); unsubscribe();
        try { controller.close(); } catch {}
      };
      const send = (type) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify({ type })}\n\n`)); } catch { close(); }
      };
      try { unsubscribe = subscribeWhatsApp(accountId, send); }
      catch (error) { controller.error(error); return; }
      controller.enqueue(encoder.encode("retry: 3000\n: connected\n\n"));
      heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { close(); } }, 20000);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() { clearInterval(heartbeat); unsubscribe(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" } });
}
