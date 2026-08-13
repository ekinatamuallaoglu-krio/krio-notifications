"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
export default function ErrorView({ code, title, description, retry }) {
  const router = useRouter();
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  return <main className="error-page"><section className="error-copy"><KrioLogo /><div><span>{code}</span><h1>{title}</h1><p>{description}</p><div>{retry && <button onClick={retry}>Tekrar dene</button>}<Link href="/">Ana sayfaya dön</Link><button className="error-logout" onClick={signOut}>Çıkış yap</button></div></div><small>Krio Notify · easyplus güvencesiyle</small></section><aside aria-hidden="true"><strong>{code}</strong><div><i /><i /><i /><i /></div></aside></main>;
}

function KrioLogo() { return <span className="krio-brand"><span className="krio-mark" aria-hidden="true"><i /><i /><i /><i /></span><span className="krio-wordmark"><b>KRIO</b><small>easyplus</small></span><span className="krio-product">Krio Notify</span></span>; }
