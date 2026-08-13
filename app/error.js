"use client";
import { useEffect } from "react";
import ErrorView from "./error-view";
export default function Error({ error, reset }) { useEffect(() => { console.error(error); }, [error]); return <ErrorView code="500" title="Bir şeyler ters gitti." description="İşleminiz tamamlanamadı. Tekrar deneyebilir veya ana sayfaya dönebilirsiniz." retry={reset} />; }
