import WhatsApp from "./whatsapp";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";

export default async function Home() {
  const user = await currentUser({ cookies: await cookies() });
  if (!user) redirect("/login");
  return <WhatsApp initialUser={user} />;
}
