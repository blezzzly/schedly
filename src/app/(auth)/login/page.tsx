import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <div className="w-full max-w-lg">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
