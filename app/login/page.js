import AuthForm from "../auth-form";
import { needsSetup } from "../../lib/auth";
export default async function Login({ searchParams }) { return <AuthForm needsSetup={await needsSetup()} initialSessionType={(await searchParams).session === "user" ? "user" : "central"} />; }
