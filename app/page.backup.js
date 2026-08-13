import MessageForm from "./message-form";
import { listMessages } from "../lib/messages";

export const dynamic = "force-dynamic";

export default async function Home() {
  const messages = await listMessages();

  return (
    <main>
      <h1>WhatsApp Bildirimleri</h1>
      <p className="intro">Graph API üzerinden şablon mesajı gönderin.</p>
      <MessageForm initialMessages={messages} />
    </main>
  );
}
