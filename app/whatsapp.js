"use client";
/* eslint-disable @next/next/no-img-element -- authenticated, dynamic WhatsApp media cannot use the image optimizer */

import Image from "next/image";
import { useRouter } from "next/navigation";
import PasswordField from "./password-field";
import { useCallback, useEffect, useRef, useState } from "react";
import "./templates.css";
import "./reactions.css";

const paths = {
  campaign: "M4 4h16v16H4zM8 9h8M8 13h5", history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  logout: "M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4",
  add: "M12 5v14M5 12h14", settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3.1 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z", file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6", user: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8", location: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 10h.01", poll: "M5 20V10M12 20V4M19 20v-7", reply: "m9 17-5-5 5-5M4 12h10a6 6 0 0 1 6 6v1", forward: "m15 7 5 5-5 5M20 12H10a6 6 0 0 0-6 6v1", edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z", trash: "M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6", sync: "M20 7h-5V2M4 17h5v5M20 7a8 8 0 0 0-14-3M4 17a8 8 0 0 0 14 3", back: "m15 18-6-6 6-6", send: "m22 2-7 20-4-9-9-4Z M22 2 11 13", smile: "M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8", like: "M7 22H3V11h4M7 22h11a2 2 0 0 0 2-1.7l1-7A2 2 0 0 0 19 11h-5l1-5a3 3 0 0 0-3-4L7 11Z",
};
function Icon({ name }) { return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>; }

export default function WhatsApp({ initialUser }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(initialUser.role === "admin" ? "default" : initialUser.profileIds[0] || "");
  const [data, setData] = useState({ status: "connecting", chats: [], contacts: [] });
  const [jid, setJid] = useState("");
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [fileMode, setFileMode] = useState("file");
  const [quoted, setQuoted] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [campaign, setCampaign] = useState(false);
  const [campaignHistory, setCampaignHistory] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({ minIntervalSeconds: 30, maxIntervalSeconds: 60 });
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const fileInput = useRef(null);
  const messageList = useRef(null);
  const scrollOnLoad = useRef(false);

  const refresh = useCallback(async () => {
    try {
      if (!accountId) { const response = await fetch("/api/whatsapp", { cache: "no-store" }), result = await response.json(); setAccounts(result.accounts || []); return; }
      const urls = ["/api/whatsapp", `/api/whatsapp?accountId=${encodeURIComponent(accountId)}`];
      if (jid) urls.push(`/api/whatsapp?accountId=${encodeURIComponent(accountId)}&jid=${encodeURIComponent(jid)}`);
      const responses = await Promise.all(urls.map((url) => fetch(url, { cache: "no-store" })));
      const results = await Promise.all(responses.map((response) => response.json()));
      if (responses.some((response) => !response.ok)) throw new Error(results.find((result) => result.error)?.error);
      setAccounts(results[0].accounts); setData(results[1]); if (results[2]) setMessages(results[2].messages);
    } catch (error) { setNotice(error.message || "WhatsApp verileri alınamadı."); }
  }, [accountId, jid]);

  useEffect(() => {
    if (!accountId) return;
    const initial = setTimeout(refresh, 0);
    const events = new EventSource(`/api/whatsapp/events?accountId=${encodeURIComponent(accountId)}`);
    let pending;
    const update = () => { clearTimeout(pending); pending = setTimeout(refresh, 100); };
    events.addEventListener("update", update);
    return () => { clearTimeout(initial); clearTimeout(pending); events.close(); };
  }, [accountId, refresh]);

  useEffect(() => { if (settings) fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()).then(setGlobalSettings); }, [settings]);
  useEffect(() => { const timer = setTimeout(() => { const warning = sessionStorage.getItem("krio-notice"); if (warning) { setNotice(warning); sessionStorage.removeItem("krio-notice"); } }, 0); return () => clearTimeout(timer); }, []);

  useEffect(() => {
    if (!scrollOnLoad.current || !messages.length) return;
    messageList.current?.scrollTo({ top: messageList.current.scrollHeight });
    scrollOnLoad.current = false;
  }, [messages]);

  function selectAccount(id) { setAccountId(id); setJid(""); setMessages([]); setNotice(""); }
  async function addAccount() {
    const response = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-account" }) });
    const result = await response.json(); if (response.ok) selectAccount(result.accountId); else setNotice(result.error);
  }
  async function logout() {
    if (!confirm("Seçili WhatsApp hesabından çıkılsın mı?")) return;
    await fetch(`/api/whatsapp?accountId=${encodeURIComponent(accountId)}`, { method: "DELETE" });
    selectAccount(accounts.find((account) => account.id !== accountId)?.id || "default");
  }
  async function relink() {
    if (!confirm("Bu hesap yeniden eşleştirilecek. Telefonda QR kodunu tekrar okutmanız gerekecek.")) return;
    await fetch(`/api/whatsapp?accountId=${encodeURIComponent(accountId)}`, { method: "DELETE" });
    setJid(""); setMessages([]); await refresh();
  }
  async function sync(type) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", accountId, value: type }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setNotice(type === "contacts" ? "Kişi eşitleme istendi." : `${result.requested} sohbet için geçmiş istendi.`);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function send(event) {
    event.preventDefault(); if (!jid || (!text.trim() && !file)) return;
    setBusy(true); setNotice("");
    try {
      let response;
      if (file) {
        const form = new FormData(); form.set("accountId", accountId); form.set("jid", jid); form.set("text", text.trim()); form.set("file", file); form.set("mode", fileMode); if (quoted) form.set("quotedId", quoted.id);
        response = await fetch("/api/whatsapp", { method: "POST", body: form });
      } else response = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, jid, text: text.trim(), quotedId: quoted?.id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setText(""); setFile(null); setQuoted(null); setFileMode("file"); if (fileInput.current) fileInput.current.value = ""; await refresh();
    } catch (error) { setNotice(error.message || "Mesaj gönderilemedi."); } finally { setBusy(false); }
  }
  async function sendCampaign(messages) {
    setBusy(true); setNotice("");
    try {
      const list = Array.isArray(messages) ? messages : [messages];
      if (!list.length || list.length > 50) throw new Error("Excel en fazla 50 alıcı içerebilir.");
      let response, success;
      if (!Array.isArray(messages)) { const { phone, text } = list[0], jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`; response = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, jid, text }) }); success = "Mesaj gönderildi."; }
      else { response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, name: "Excel toplu gönderimi", messages: list }) }); success = `${list.length} mesaj kuyruğa alındı.`; }
      const result = await response.json(); if (!response.ok) throw new Error(result.error); if (Array.isArray(messages)) { setCampaign(false); setCampaignHistory(true); } return success;
    } finally { setBusy(false); }
  }
  async function saveGlobalSettings(event) { event.preventDefault(); const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(globalSettings) }), result = await response.json(); if (response.ok) { setGlobalSettings(result); setNotice("Global ayarlar kaydedildi."); } else setNotice(result.error); }
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }

  const chats = data.chats.filter((chat) => `${chat.name} ${chat.lastMessage}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
  const chat = data.chats.find((item) => item.id === jid);
  const mediaUrl = (message) => `/api/whatsapp/media?accountId=${encodeURIComponent(accountId)}&jid=${encodeURIComponent(jid)}&messageId=${encodeURIComponent(message.id)}`;

  async function action(actionName, message, value) {
    let destination = jid;
    if (actionName === "forward") { const name = prompt(`İletilecek sohbet:\n${data.chats.map((item) => item.name).join("\n")}`); destination = data.chats.find((item) => item.name === name)?.id; if (!destination) return; }
    const response = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, jid: destination, sourceJid: jid, action: actionName, messageId: message.id, value }) });
    const result = await response.json(); if (!response.ok) setNotice(result.error); else refresh();
  }

  async function sendSpecial(actionName) {
    let payload;
    if (actionName === "contact") { const name = prompt("Kişi adı"); const phone = name && prompt("Telefon numarası"); if (!phone) return; payload = { contact: { name, phone } }; }
    if (actionName === "location") { const latitude = Number(prompt("Enlem")); const longitude = Number(prompt("Boylam")); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return; payload = { location: { latitude, longitude, name: prompt("Konum adı") || "" } }; }
    if (actionName === "poll") { const name = prompt("Anket sorusu"); const values = name && prompt("Seçenekleri virgülle ayırın")?.split(",").map((item) => item.trim()).filter(Boolean); if (!values?.length) return; payload = { poll: { name, values, selectableCount: 1 } }; }
    const response = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, jid, action: actionName, ...payload }) });
    const result = await response.json(); if (!response.ok) setNotice(result.error); else refresh();
  }

  function Message({ message }) {
    return <div className={`bubble ${message.fromMe ? "mine" : ""}`}>
      <strong className="sender-name">{message.senderName}</strong>
      {message.quoted && <button className="quoted" onClick={() => document.getElementById(`message-${message.quoted.id}`)?.scrollIntoView()}>{message.quoted.text}</button>}
      {message.type === "image" && <img src={mediaUrl(message)} alt={message.text || "Fotoğraf"} />}
      {["video", "gif"].includes(message.type) && <video src={mediaUrl(message)} controls={message.type === "video"} autoPlay={message.type === "gif"} loop={message.type === "gif"} muted={message.type === "gif"} preload="metadata" />}
      {message.type === "audio" && <audio src={mediaUrl(message)} controls preload="none" />}
      {message.type === "sticker" && <img className="sticker" src={mediaUrl(message)} alt="Çıkartma" />}
      {message.type === "document" && <a className="document" href={mediaUrl(message)} download><Icon name="file" />{message.fileName || message.text}</a>}
      {message.type === "location" && <a className="icon-link" href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`} target="_blank" rel="noreferrer"><Icon name="location" />{message.text}</a>}
      {message.type === "contact" && <div>{message.contacts.map((contact, index) => <a key={index} className="document" href={`data:text/vcard;charset=utf-8,${encodeURIComponent(contact.vcard)}`} download={`${contact.name}.vcf`}><Icon name="user" />{contact.name}</a>)}</div>}
      {message.type === "poll" && <div className="poll"><strong>{message.text}</strong>{message.poll.options.map((option) => <span key={option}>{option} · {message.poll.votes.find((vote) => vote.name === option)?.count || 0}</span>)}</div>}
      {message.type === "invite" && <a className="document" href={`https://chat.whatsapp.com/${message.invite.code}`} target="_blank" rel="noreferrer">Gruba katıl: {message.text}</a>}
      {message.type === "text" && <span>{message.text}</span>}
      {["image", "video", "gif"].includes(message.type) && message.text && !["Fotoğraf", "Video", "GIF"].includes(message.text) && <p>{message.text}</p>}
      {message.reactions?.length > 0 && <span className="reactions">{message.reactions.map((reaction, index) => <button type="button" key={index} title={reaction.senderName} onClick={() => action("react", message, reaction.own ? "" : reaction.text)}>{reaction.text || reaction}</button>)}</span>}
      <time>{new Date(message.timestamp * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
      <div className="message-actions"><button title="Yanıtla" onClick={() => setQuoted(message)}><Icon name="reply" /></button><button title="Beğen" onClick={() => action("react", message, message.reactions?.some((reaction) => reaction.own && reaction.text === "👍") ? "" : "👍")}><Icon name="like" /></button><button title="Kalp" onClick={() => action("react", message, message.reactions?.some((reaction) => reaction.own && reaction.text === "❤️") ? "" : "❤️")}><Icon name="heart" /></button><button title="Gül" onClick={() => action("react", message, message.reactions?.some((reaction) => reaction.own && reaction.text === "😂") ? "" : "😂")}><Icon name="smile" /></button><button title="İlet" onClick={() => action("forward", message)}><Icon name="forward" /></button>{message.fromMe && <><button title="Düzenle" onClick={() => { const value = prompt("Mesajı düzenle", message.text); if (value) action("edit", message, value); }}><Icon name="edit" /></button><button title="Sil" onClick={() => action("delete", message)}><Icon name="trash" /></button></>}</div>
    </div>;
  }

  return <main className={`wa-shell ${campaign || campaignHistory ? "campaign-open" : ""}`}>
    <aside className="app-sidebar" aria-label="Hesaplar"><div className="sidebar-logo">K</div><div className="account-list">{accounts.map((account) => <button key={account.id} className={`account-item ${account.id === accountId ? "active" : ""}`} onClick={() => { selectAccount(account.id); setSettings(false); setCampaign(false); setCampaignHistory(false); }} title={account.name}><span className="account-avatar" style={account.picture ? { backgroundImage: `url(${account.picture})` } : undefined}>{account.picture ? "" : account.name.slice(0, 1).toUpperCase()}</span><i className={account.status === "open" ? "online" : ""} /></button>)}</div>{initialUser.role === "admin" && <button className="account-add" onClick={addAccount} title="Hesap ekle"><Icon name="add" /></button>}<button className={`sidebar-item history-button ${campaignHistory ? "active" : ""}`} onClick={() => { setCampaignHistory(true); setCampaign(false); setSettings(false); }} title="Toplu mesaj geçmişi"><Icon name="history" /></button><button className={`sidebar-item campaign-button ${campaign ? "active" : ""}`} onClick={() => { setCampaign(true); setCampaignHistory(false); setSettings(false); }} title="Toplu şablon gönder"><Icon name="campaign" /></button><button className={`sidebar-item settings-button ${settings ? "active" : ""}`} onClick={() => { setSettings(true); setCampaign(false); setCampaignHistory(false); }} title="Ayarlar"><Icon name="settings" /></button><button className="sidebar-item logout-button" onClick={signOut} title="Oturumu kapat"><Icon name="logout" /></button></aside>
    {campaign && <CampaignComposer busy={busy} onSubmit={sendCampaign} />}
    {campaignHistory && <CampaignHistory accountId={accountId} />}
    {settings ? <SettingsPanel user={initialUser} accounts={accounts} data={data} busy={busy} notice={notice} values={globalSettings} setValues={setGlobalSettings} onSave={saveGlobalSettings} onAdd={addAccount} onLogout={logout} onSync={sync} /> : !accountId ? <section className="account-pairing"><div className="login-card"><h1>Profil atanmadı</h1><p>Bir yöneticinin hesabınıza profil ataması gerekiyor.</p></div></section> : data.status !== "open" ? <section className="account-pairing"><div className="login-card"><div className="brand">{data.name || "Yeni WhatsApp hesabı"}</div>{data.qr ? <><h1>Hesabı bağla</h1><p>Telefonunuzdaki Bağlı cihazlar ekranından QR kodunu tarayın.</p><Image unoptimized className="qr" src={data.qr} alt="WhatsApp bağlantı QR kodu" width={280} height={280} /></> : <><h1>Bağlanıyor…</h1><p>QR kodu hazırlanıyor.</p></>}{notice && <p className="error">{notice}</p>}</div></section> : <>
      <aside className={`chat-panel ${jid ? "selected" : ""}`}><header><strong>{data.name}</strong></header>{data.needsRelink && <div className="sync-warning">Önceki sürüm geçmişi kalıcı saklamamış. Rehber ve mesajları almak için hesabı bir kez yeniden eşleştirin.<button onClick={relink}>Yeniden eşitle</button></div>}<label className="chat-search"><span className="sr-only">Sohbet ara</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sohbet ara" /></label><nav>{chats.map((item) => <button className={`chat-row ${jid === item.id ? "active" : ""}`} key={item.id} onClick={() => { scrollOnLoad.current = true; setJid(item.id); setMessages([]); }}><span className="avatar" style={item.picture ? { backgroundImage: `url(${item.picture})` } : undefined}>{item.picture ? "" : item.name.slice(0, 1).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.lastMessage || "Mesaj yok"}</small></span></button>)}</nav></aside>
      <section className={`conversation ${jid ? "selected" : ""}`}>{chat ? <><header><button className="back" onClick={() => setJid("")}><Icon name="back" /></button><span className="avatar" style={chat.picture ? { backgroundImage: `url(${chat.picture})` } : undefined}>{chat.picture ? "" : chat.name.slice(0, 1).toUpperCase()}</span><strong>{chat.name}</strong></header><div ref={messageList} className="messages">{messages.map((message) => <div id={`message-${message.id}`} key={message.id}><Message message={message} /></div>)}</div><form className="composer" onSubmit={send}><input ref={fileInput} className="file-input" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.webp" onChange={(event) => { setFile(event.target.files[0] || null); setAttachmentMenu(false); }} /><div className="attachment-wrap"><button type="button" className="attach" onClick={() => setAttachmentMenu((current) => !current)} title="Ekle" aria-expanded={attachmentMenu}><Icon name="add" /></button>{attachmentMenu && <div className="attachment-menu"><button type="button" onClick={() => fileInput.current?.click()}><span><Icon name="file" /></span>Fotoğraf, video veya belge</button><button type="button" onClick={() => { setAttachmentMenu(false); sendSpecial("contact"); }}><span><Icon name="user" /></span>Kişi</button><button type="button" onClick={() => { setAttachmentMenu(false); sendSpecial("location"); }}><span><Icon name="location" /></span>Konum</button><button type="button" onClick={() => { setAttachmentMenu(false); sendSpecial("poll"); }}><span><Icon name="poll" /></span>Anket</button></div>}</div><div>{quoted && <small className="replying">Yanıt: {quoted.text} <button type="button" onClick={() => setQuoted(null)}>×</button></small>}<input aria-label="Mesaj" value={text} onChange={(event) => setText(event.target.value)} placeholder={file ? `${file.name} için açıklama` : "Bir mesaj yazın"} />{file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB <select value={fileMode} onChange={(event) => setFileMode(event.target.value)}><option value="file">Normal</option>{file.type.startsWith("video/") && <option value="gif">GIF</option>}{file.type.startsWith("audio/") && <option value="voice">Sesli mesaj</option>}{file.type === "image/webp" && <option value="sticker">Çıkartma</option>}{(file.type.startsWith("image/") || file.type.startsWith("video/")) && <option value="view-once">Bir kez görüntüle</option>}</select> <button type="button" onClick={() => setFile(null)}>×</button></small>}</div><button className="send" disabled={busy || (!text.trim() && !file)}><Icon name="send" /></button></form></> : <div className="welcome"><h1>WhatsApp</h1><p>Mesajları görüntülemek için bir sohbet seçin.</p></div>}{notice && <p className="toast">{notice}</p>}</section>
    </>}
  </main>;
}

const campaignStatuses = { queued: "Bekliyor", running: "Devam ediyor", paused: "Duraklatıldı", completed: "Tamamlandı", cancelled: "İptal edildi", sending: "Gönderiliyor", sent: "Gönderildi", failed: "Başarısız" };

function SettingsPanel({ user, accounts, data, busy, notice, values, setValues, onSave, onAdd, onLogout, onSync }) {
  return <section className="settings-page settings-panel"><div className="settings-card"><h1>Ayarlar</h1><p>{user.email} · {user.role}</p><section className="settings-section"><h2>Profil</h2><p className="settings-account">Seçili profil: <strong>{data.name || "—"}</strong></p><div className="settings-list">{user.role === "admin" && <><button onClick={onAdd}><span><Icon name="add" /></span><div><strong>Profil ekle</strong><small>Yeni WhatsApp hesabını QR koduyla bağla</small></div></button><button className="danger" onClick={onLogout}><span><Icon name="trash" /></span><div><strong>Profili sil</strong><small>Seçili hesabı kaldır</small></div></button></>}<button disabled={busy || data.status !== "open"} onClick={() => onSync("contacts")}><span><Icon name="user" /></span><div><strong>Kişileri eşitle</strong></div></button></div></section>{user.role === "admin" && <><section className="settings-section"><h2>Bekleme süresi</h2><form className="global-settings" onSubmit={onSave}><label>Minimum (sn)<input type="number" min="10" max="86400" value={values.minIntervalSeconds} onChange={(event) => setValues({ ...values, minIntervalSeconds: Number(event.target.value) })} required /></label><label>Maksimum (sn)<input type="number" min={values.minIntervalSeconds} max="86400" value={values.maxIntervalSeconds} onChange={(event) => setValues({ ...values, maxIntervalSeconds: Number(event.target.value) })} required /></label><button disabled={busy}>Kaydet</button></form></section><SmtpAdmin /><UserAdmin accounts={accounts} /></>}{notice && <p className="notice">{notice}</p>}</div></section>;
}

function SmtpAdmin() {
  const [smtp, setSmtp] = useState({ host: "", port: 587, secure: false, username: "", password: "", fromName: "Krio", fromEmail: "", hasPassword: false }), [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/smtp").then((r) => r.json()).then((x) => x.smtp && setSmtp((current) => ({ ...current, ...x.smtp }))); }, []);
  async function save(event) { event.preventDefault(); const response = await fetch("/api/admin/smtp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(smtp) }), result = await response.json(); setMessage(response.ok ? "SMTP ayarları kaydedildi." : result.error); if (response.ok) setSmtp((current) => ({ ...current, ...result.smtp, password: "" })); }
  async function test() { const response = await fetch("/api/admin/smtp", { method: "POST" }), result = await response.json(); setMessage(result.message || result.error); }
  return <section className="settings-section"><h2>E-posta (SMTP)</h2><form className="smtp-settings" onSubmit={save}><label>Sunucu<input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" required /></label><label>Port<input type="number" min="1" max="65535" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} required /></label><label className="smtp-check"><input type="checkbox" checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />Doğrudan TLS (genellikle port 465)</label><label>Kullanıcı adı<input value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} autoComplete="off" /></label><PasswordField label="Parola" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtp.hasPassword ? "Değiştirmek için yazın" : "SMTP parolası"} autoComplete="new-password" /><label>Gönderen adı<input value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} /></label><label>Gönderen e-postası<input type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} required /></label><div><button>Kaydet</button><button type="button" onClick={test}>Bağlantıyı test et</button></div></form>{message && <p className="notice">{message}</p>}</section>;
}

function UserAdmin({ accounts }) {
  const [users, setUsers] = useState([]), [message, setMessage] = useState(""), [resetUser, setResetUser] = useState(null);
  const load = useCallback(() => fetch("/api/admin/users").then((r) => r.json()).then((x) => setUsers(x.users || [])), []);
  useEffect(() => { load(); }, [load]);
  async function request(method, body, query = "") { const response = await fetch(`/api/admin/users${query}`, { method, headers: { "Content-Type": "application/json" }, ...(body && { body: JSON.stringify(body) }) }), result = await response.json(); setMessage(response.ok ? "Kaydedildi." : result.error); if (response.ok) load(); }
  return <section className="settings-section user-admin"><div className="user-admin-head"><div><h2>Kullanıcılar</h2><p>Rolleri ve erişebilecekleri WhatsApp profillerini yönetin.</p></div><span>{users.length} kullanıcı</span></div><form className="user-create" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); request("POST", { email: form.get("email"), password: form.get("password"), role: form.get("role"), profileIds: [] }); event.currentTarget.reset(); }}><label>E-posta<input name="email" type="email" placeholder="kullanici@example.com" required /></label><PasswordField name="password" label="Geçici parola" minLength="10" placeholder="En az 10 karakter" autoComplete="new-password" strength required /><label>Rol<select name="role"><option value="user">Kullanıcı</option><option value="admin">Admin</option></select></label><button>Yeni kullanıcı ekle</button></form>{resetUser && <form className="password-reset-box" onSubmit={(event) => { event.preventDefault(); const password = new FormData(event.currentTarget).get("password"); request("PATCH", { id: resetUser.id, password }); setResetUser(null); }}><strong>{resetUser.email} için yeni parola</strong><PasswordField name="password" minLength="10" autoComplete="new-password" strength required /><div><button>Kaydet</button><button type="button" onClick={() => setResetUser(null)}>Vazgeç</button></div></form>}<div className="user-list">{users.map((item) => <article className="user-card" key={item.id}><header><span className="user-initial">{item.email.slice(0, 1).toUpperCase()}</span><div><strong>{item.email}</strong><small>{item.role === "admin" ? "Tüm profillere erişebilir" : `${item.profileIds.length} profil atanmış`}</small></div><label className="user-role"><span>Rol</span><select value={item.role} onChange={(e) => request("PATCH", { id: item.id, role: e.target.value })}><option value="user">Kullanıcı</option><option value="admin">Admin</option></select></label></header><div className="user-profiles"><strong>Profil erişimi</strong>{accounts.length ? <div>{accounts.map((account) => <label key={account.id}><input type="checkbox" checked={item.role === "admin" || item.profileIds.includes(account.id)} disabled={item.role === "admin"} onChange={() => request("PATCH", { id: item.id, profileIds: item.profileIds.includes(account.id) ? item.profileIds.filter((id) => id !== account.id) : [...item.profileIds, account.id] })} /><span>{account.name}</span></label>)}</div> : <small>Henüz WhatsApp profili yok.</small>}</div><footer><button type="button" onClick={() => setResetUser(item)}>Parolayı sıfırla</button><button type="button" className="danger" onClick={() => confirm(`${item.email} kullanıcısı silinsin mi?`) && request("DELETE", null, `?id=${item.id}`)}>Kullanıcıyı sil</button></footer></article>)}</div>{message && <p className="notice" role="status">{message}</p>}</section>;
}

function CampaignComposer({ busy, onSubmit }) {
  const [templates, setTemplates] = useState([]), [selected, setSelected] = useState(""), [name, setName] = useState(""), [body, setBody] = useState(""), [values, setValues] = useState({}), [excelRows, setExcelRows] = useState([]), [status, setStatus] = useState(""), [minInterval, setMinInterval] = useState(30), [maxInterval, setMaxInterval] = useState(60);
  useEffect(() => { const timer = setTimeout(() => setTemplates(JSON.parse(localStorage.getItem("krio-templates") || "[]")), 0); return () => clearTimeout(timer); }, []);
  const variables = [...new Set([...body.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => match[1]))];
  function choose(template, list = templates) { const item = typeof template === "string" ? list.find((entry) => entry.name === template) : template; setSelected(item?.name || ""); setName(item?.name || ""); setBody(item?.body || ""); setValues({}); setExcelRows([]); setStatus(""); }
  function save() { if (!name.trim() || !body.trim()) return; const next = [...templates.filter((item) => item.name !== name.trim()), { name: name.trim(), body }]; localStorage.setItem("krio-templates", JSON.stringify(next)); setTemplates(next); setSelected(name.trim()); }
  function remove() { const next = templates.filter((item) => item.name !== selected); localStorage.setItem("krio-templates", JSON.stringify(next)); setTemplates(next); choose(next[0], next); }
  async function submit(event) { event.preventDefault(); setStatus(""); try { const form = new FormData(event.currentTarget), payload = excelRows.length ? excelRows : { phone: form.get("phone"), text: body.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => values[key]?.trim() || "") }; setStatus(await onSubmit(payload)); if (excelRows.length) setExcelRows([]); } catch (error) { setStatus(error.message || "Mesaj gönderilemedi."); } }
  async function downloadExcel() { const { default: ExcelJS } = await import("exceljs"), workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Alıcılar"); sheet.addRow(["telefon", ...variables]); sheet.addRow(["905xxxxxxxxx", ...variables.map(() => "")]); const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${selected}.xlsx`; link.click(); URL.revokeObjectURL(url); }
  async function uploadExcel(event) {
    const file = event.target.files[0]; event.target.value = ""; if (!file || file.size > 2_000_000) return alert("Excel dosyası en fazla 2 MB olabilir.");
    try { const { default: ExcelJS } = await import("exceljs"), workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0]; if (!sheet) throw new Error("Excel sayfası bulunamadı."); const headers = sheet.getRow(1).values.slice(1).map(String), required = ["telefon", ...variables]; if (required.some((header) => !headers.includes(header))) throw new Error(`Sütunlar eksik: ${required.join(", ")}`); const rows = []; sheet.eachRow((row, number) => { if (number === 1) return; const record = Object.fromEntries(headers.map((header, index) => [header, row.getCell(index + 1).text.trim()])); if (record.telefon) rows.push(record); }); if (!rows.length || rows.length > 50 || rows.some((row) => !/^\+?\d{7,15}$/.test(row.telefon) || variables.some((key) => !row[key]))) throw new Error("Excel 1-50 geçerli satır içermeli; telefon ve değişken alanları zorunludur."); setExcelRows(rows.map((row) => ({ phone: row.telefon, text: body.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => row[key]) }))); setStatus(""); } catch (error) { alert(error.message || "Excel okunamadı."); }
  }
  return <section className="campaign-page"><aside><h2>Şablonlar</h2><select value={selected} onChange={(event) => choose(event.target.value)}><option value="">Yeni şablon</option>{templates.map((item) => <option key={item.name}>{item.name}</option>)}</select><label>Şablon adı<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Mesaj<textarea rows="10" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Merhaba {{isim}}, siparişiniz {{sipariş_no}} hazır." /></label><div className="campaign-actions"><button type="button" onClick={save}>Kaydet</button><button type="button" onClick={remove} disabled={!selected}>Sil</button></div></aside><div className="campaign-form"><p className="campaign-kicker">YEREL ŞABLON</p><h1>Şablondan mesaj gönder</h1><p>Süslü parantez içindeki değişkenler otomatik olarak aşağıda forma dönüşür.</p><form onSubmit={submit}><label>Telefon numarası<input name="phone" type="tel" placeholder="905xxxxxxxxx" pattern="\+?[0-9]{7,15}" required={!excelRows.length} disabled={Boolean(excelRows.length)} /></label><label>Şablon<select value={selected} onChange={(event) => choose(event.target.value)} required><option value="">Şablon seçin</option>{templates.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>{variables.map((variable) => <label key={variable}>{variable}<input value={values[variable] || ""} onChange={(event) => setValues({ ...values, [variable]: event.target.value })} required={!excelRows.length} disabled={Boolean(excelRows.length)} /></label>)}<div className="campaign-preview">{body.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => values[key] || `{{${key}}}`)}</div><div className="interval-fields"><label>Minimum bekleme (sn)<input type="number" min="10" max="86400" value={minInterval} onChange={(event) => setMinInterval(Number(event.target.value))} /></label><label>Maksimum bekleme (sn)<input type="number" min={minInterval} max="86400" value={maxInterval} onChange={(event) => setMaxInterval(Number(event.target.value))} /></label></div><div className="excel-actions"><button type="button" onClick={downloadExcel} disabled={!selected}>Excel şablonunu indir</button><label className={!selected || busy ? "disabled" : ""}>Excel yükle<input type="file" accept=".xlsx" onChange={uploadExcel} disabled={!selected || busy} /></label>{excelRows.length > 0 && <button type="button" onClick={() => { setExcelRows([]); setStatus(""); }}>Excel’i temizle</button>}</div>{excelRows.length > 0 && <p className="excel-summary"><strong>{excelRows.length} kayıt</strong> gönderime hazır.</p>}<div className="campaign-submit"><button disabled={busy || !selected}>{busy ? "Gönderiliyor…" : "Mesajı gönder"}</button></div>{status && <p className="notice" role="status">{status}</p>}</form></div></section>;
}

function CampaignHistory({ accountId }) {
  const [campaigns, setCampaigns] = useState([]), [selectedId, setSelectedId] = useState("");
  const load = useCallback(async () => { const response = await fetch(`/api/campaigns?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" }); const result = await response.json(); if (response.ok) setCampaigns(result.campaigns); }, [accountId]);
  useEffect(() => { const initial = setTimeout(load, 0), events = new EventSource(`/api/campaigns/events?accountId=${encodeURIComponent(accountId)}`); events.addEventListener("update", load); return () => { clearTimeout(initial); events.close(); }; }, [accountId, load]);
  async function control(id, action) { await fetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, id, action }) }); load(); }
  const selected = campaigns.find((item) => item.id === selectedId) || campaigns[0];
  return <section className="campaign-page campaign-history"><aside><h2>Toplu mesaj geçmişi</h2><small>Biten ve devam eden tüm işlemler</small><div className="campaign-history-list">{campaigns.length ? campaigns.map((item) => <button className={selectedId === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span>{campaignStatuses[item.status] || item.status} · {item.counts.sent || 0}/{item.total}</span><progress value={(item.counts.sent || 0) + (item.counts.failed || 0) + (item.counts.cancelled || 0)} max={item.total || 1} /></button>) : <p>Henüz toplu mesaj işlemi yok.</p>}</div></aside><div className="campaign-history-detail">{selected ? <><p className="campaign-kicker">İŞLEM RAPORU</p><h1>{selected.name}</h1><p>{new Date(selected.createdAt).toLocaleString("tr-TR")} · {campaignStatuses[selected.status] || selected.status}</p><div className="campaign-summary"><span><strong>{selected.total}</strong>Toplam</span><span><strong>{selected.counts.sent || 0}</strong>Gönderildi</span><span><strong>{selected.counts.queued || 0}</strong>Bekliyor</span><span><strong>{selected.counts.failed || 0}</strong>Başarısız</span></div>{["queued", "running"].includes(selected.status) && <div className="campaign-detail-actions"><button onClick={() => control(selected.id, "pause")}>Duraklat</button><button onClick={() => control(selected.id, "cancel")}>İptal et</button></div>}{selected.status === "paused" && <div className="campaign-detail-actions"><button onClick={() => control(selected.id, "resume")}>Devam et</button><button onClick={() => control(selected.id, "cancel")}>İptal et</button></div>}<div className="campaign-recipient-list">{selected.recipients.map((recipient, index) => <article key={`${recipient.phone}-${index}`}><header><strong>+{recipient.phone}</strong><span className={`status-${recipient.status}`}>{campaignStatuses[recipient.status] || recipient.status}</span></header><p>{recipient.text}</p><small>{recipient.attempts} deneme{recipient.error ? ` · ${recipient.error}` : ""}</small></article>)}</div></> : <div className="campaign-history-empty"><h1>İşlem seçin</h1><p>Özet ve alıcı bazlı gönderim raporunu görmek için soldan bir işlem seçin.</p></div>}</div></section>;
}

// Kept temporarily to preserve the previous composer while the new staged Excel flow replaces it.
function LegacyCampaign({ accountId, busy, notice, onSubmit }) {
  const [templates, setTemplates] = useState([]), [selected, setSelected] = useState(""), [name, setName] = useState(""), [body, setBody] = useState(""), [values, setValues] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [minInterval, setMinInterval] = useState(30), [maxInterval, setMaxInterval] = useState(60);
  useEffect(() => { const timer = setTimeout(() => setTemplates(JSON.parse(localStorage.getItem("krio-templates") || "[]")), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => { let active = true; const load = async () => { const response = await fetch(`/api/campaigns?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" }); const result = await response.json(); if (active && response.ok) setCampaigns(result.campaigns); }; load(); const events = new EventSource(`/api/campaigns/events?accountId=${encodeURIComponent(accountId)}`); events.addEventListener("update", load); return () => { active = false; events.close(); }; }, [accountId]);
  const variables = [...new Set([...body.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => match[1]))];
  function choose(template, list = templates) { const item = typeof template === "string" ? list.find((entry) => entry.name === template) : template; setSelected(item?.name || ""); setName(item?.name || ""); setBody(item?.body || ""); setValues({}); }
  function save() { if (!name.trim() || !body.trim()) return; const next = [...templates.filter((item) => item.name !== name.trim()), { name: name.trim(), body }]; localStorage.setItem("krio-templates", JSON.stringify(next)); setTemplates(next); setSelected(name.trim()); }
  function remove() { const next = templates.filter((item) => item.name !== selected); localStorage.setItem("krio-templates", JSON.stringify(next)); setTemplates(next); choose(next[0], next); }
  function submit(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const text = body.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => values[key]?.trim() || ""); onSubmit({ phone: form.get("phone"), text }); }
  async function downloadExcel() {
    const { default: ExcelJS } = await import("exceljs"); const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Alıcılar");
    sheet.addRow(["telefon", ...variables]); sheet.addRow(["905xxxxxxxxx", ...variables.map(() => "")]);
    const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${selected}.xlsx`; link.click(); URL.revokeObjectURL(url);
  }
  async function uploadExcel(event) {
    const file = event.target.files[0]; event.target.value = ""; if (!file || file.size > 2_000_000) return alert("Excel dosyası en fazla 2 MB olabilir.");
    try {
      const minimum = Number(prompt("Mesajlar arası minimum bekleme (saniye)", String(minInterval))), maximum = Number(prompt("Mesajlar arası maksimum bekleme (saniye)", String(maxInterval))); setMinInterval(minimum); setMaxInterval(maximum);
      const { default: ExcelJS } = await import("exceljs"); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("Excel sayfası bulunamadı."); const headers = sheet.getRow(1).values.slice(1).map(String); const required = ["telefon", ...variables];
      if (required.some((header) => !headers.includes(header))) throw new Error(`Sütunlar eksik: ${required.join(", ")}`);
      const rows = []; sheet.eachRow((row, number) => { if (number === 1) return; const record = Object.fromEntries(headers.map((header, index) => [header, row.getCell(index + 1).text.trim()])); if (record.telefon) rows.push(record); });
      if (!rows.length || rows.length > 50 || rows.some((row) => !/^\+?\d{7,15}$/.test(row.telefon) || variables.some((key) => !row[key]))) throw new Error("Excel 1-50 geçerli satır içermeli; telefon ve değişken alanları zorunludur.");
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 10 || maximum < minimum || maximum > 86400) throw new Error("Süreler tam sayı ve 10-86400 saniye arasında olmalı; maksimum minimumdan küçük olamaz.");
      await onSubmit(rows.map((row) => ({ phone: row.telefon, text: body.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => row[key]) })), minimum, maximum);
    } catch (error) { alert(error.message || "Excel okunamadı."); }
  }
  async function control(id, action) { const response = await fetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, id, action }) }); const result = await response.json(); if (response.ok) setCampaigns(result.campaigns); }
  return <section className="campaign-page"><aside><h2>Şablonlar</h2><select value={selected} onChange={(event) => choose(event.target.value)}><option value="">Yeni şablon</option>{templates.map((item) => <option key={item.name}>{item.name}</option>)}</select><label>Şablon adı<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Mesaj<textarea rows="10" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Merhaba {{isim}}, siparişiniz {{sipariş_no}} hazır." /></label><div className="campaign-actions"><button type="button" onClick={save}>Kaydet</button><button type="button" onClick={remove} disabled={!selected}>Sil</button></div></aside><div className="campaign-form"><p className="campaign-kicker">YEREL ŞABLON</p><h1>Şablondan mesaj gönder</h1><p>Süslü parantez içindeki değişkenler otomatik olarak aşağıda forma dönüşür.</p><form onSubmit={submit}><label>Telefon numarası<input name="phone" type="tel" placeholder="905xxxxxxxxx" pattern="\+?[0-9]{7,15}" required /></label><label>Şablon<select value={selected} onChange={(event) => choose(event.target.value)} required><option value="">Şablon seçin</option>{templates.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>{variables.map((variable) => <label key={variable}>{variable}<input value={values[variable] || ""} onChange={(event) => setValues({ ...values, [variable]: event.target.value })} required /></label>)}<div className="campaign-preview">{body.replace(/{{\s*([^{}]+?)\s*}}/g, (_, key) => values[key] || `{{${key}}}`)}</div><div className="excel-actions"><button type="button" onClick={downloadExcel} disabled={!selected}>Excel şablonunu indir</button><label className={!selected || busy ? "disabled" : ""}>Excel ile gönder<input type="file" accept=".xlsx" onChange={uploadExcel} disabled={!selected || busy} /></label></div><div className="campaign-submit"><button disabled={busy || !selected}>{busy ? "Gönderiliyor…" : "Mesajı gönder"}</button></div></form>{notice && <p className="notice">{notice}</p>}{campaigns.map((item) => <article className="campaign-report" key={item.id}><strong>{item.name}</strong><span>{item.status} · {item.counts.sent || 0}/{item.total} gönderildi · {item.counts.failed || 0} başarısız</span><progress value={(item.counts.sent || 0) + (item.counts.failed || 0) + (item.counts.cancelled || 0)} max={item.total} /><div>{["queued", "running"].includes(item.status) && <button type="button" onClick={() => control(item.id, "pause")}>Duraklat</button>}{item.status === "paused" && <button type="button" onClick={() => control(item.id, "resume")}>Devam et</button>}{!["completed", "cancelled"].includes(item.status) && <button type="button" onClick={() => control(item.id, "cancel")}>İptal</button>}</div>{item.failures.map((failure) => <small key={failure.phone}>{failure.phone}: {failure.error}</small>)}</article>)}</div></section>;
}
