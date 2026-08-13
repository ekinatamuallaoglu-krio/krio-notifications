import AuthForm from "../auth-form";
export default async function ResetPassword({ searchParams }) { return <AuthForm mode="reset-password" token={(await searchParams).token || ""} />; }
