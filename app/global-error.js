"use client";
import ErrorView from "./error-view";
export default function GlobalError({ reset }) { return <html lang="tr"><body><ErrorView code="500" title="Uygulama başlatılamadı." description="Beklenmeyen bir sistem hatası oluştu. Lütfen tekrar deneyin." retry={reset} /></body></html>; }
