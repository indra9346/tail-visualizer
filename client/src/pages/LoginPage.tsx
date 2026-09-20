import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { PageContainer } from "@/components/layout/PageContainer";

export function LoginPage() {
  const { user, signInWithPassword, signUpWithPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={location.state?.from?.pathname ?? "/projects"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error: err } = await signInWithPassword(email, password);
        if (err) {
          setError(err);
        } else {
          navigate(location.state?.from?.pathname ?? "/projects", { replace: true });
        }
      } else {
        const { error: err } = await signUpWithPassword(email, password);
        if (err) {
          setError(err);
        } else {
          setInfo("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer className="flex justify-center">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h1 className="font-display text-2xl text-stone-900">{mode === "signin" ? "Sign in" : "Create an account"}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {mode === "signin" ? "Welcome back to Attelier." : "Save projects and revisit your visualizations anytime."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-stone-700">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-stone-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="text-sm text-emerald-700">
                {info}
              </p>
            )}

            <Button type="submit" className="w-full" loading={submitting}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 text-sm font-medium text-clay-700 hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
