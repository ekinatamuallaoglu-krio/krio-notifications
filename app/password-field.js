"use client";
import { useState } from "react";

export default function PasswordField({ label = "Parola", strength = false, className = "", value, onChange, ...props }) {
  const [visible, setVisible] = useState(false), [localPassword, setLocalPassword] = useState("");
  const password = value ?? localPassword;
  const score = [password.length >= 10, password.length >= 14, /[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password), /[^\w\s]/.test(password)].filter(Boolean).length;
  const levels = ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü", "Çok güçlü"];
  return <label className={`password-field ${className}`}>{label}<span><input {...props} {...(value !== undefined && { value })} type={visible ? "text" : "password"} onChange={(event) => { if (value === undefined) setLocalPassword(event.target.value); onChange?.(event); }} /><button type="button" onClick={() => setVisible((shown) => !shown)} aria-label={visible ? "Parolayı gizle" : "Parolayı göster"}>{visible ? "Gizle" : "Göster"}</button></span>{strength && password && <small className={`password-strength strength-${score}`}><i><b style={{ width: `${Math.max(1, score) * 20}%` }} /></i>{levels[score]}</small>}</label>;
}
