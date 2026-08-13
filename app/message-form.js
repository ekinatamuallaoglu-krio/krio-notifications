"use client";

import { useState } from "react";

export default function MessageForm({ initialMessages }) {
  const [messages, setMessages] = useState(initialMessages);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");

    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setNotice(result.error || "Mesaj başarıyla gönderildi.");
      if (result.message) setMessages((current) => [result.message, ...current].slice(0, 20));
    } catch {
      setNotice("Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit}>
        <label>Alıcı telefon<input name="to" inputMode="tel" placeholder="905xxxxxxxxx" required /></label>
        <label>Şablon adı<input name="templateName" defaultValue="3p_direct_integration_test_template" required /></label>
        <label>Dil kodu<input name="languageCode" defaultValue="en_US" required /></label>
        <button disabled={busy}>{busy ? "Gönderiliyor…" : "Gönder"}</button>
        {notice && <p role="status" className="notice">{notice}</p>}
      </form>

      <section>
        <h2>Son gönderimler</h2>
        {messages.length === 0 ? <p>Henüz gönderim yok.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Tarih</th><th>Alıcı</th><th>Şablon</th><th>Durum</th><th>Yanıt / hata</th></tr></thead>
            <tbody>{messages.map((message) => (
              <tr key={message.id}>
                <td>{new Date(message.createdAt).toLocaleString("tr-TR")}</td>
                <td>{message.to}</td><td>{message.templateName}</td>
                <td className={message.status === "sent" ? "sent" : "failed"}>{message.status}</td>
                <td><small>HTTP {message.httpStatus || "—"}: {message.response || "—"}</small></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
