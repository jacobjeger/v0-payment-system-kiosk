import { redirect } from "next/navigation";

export default function LoginRedirect() {
  // Redirect to the correct member login page
  redirect("/member/login");
}
