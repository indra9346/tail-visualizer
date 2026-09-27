import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TilePattern } from "@/components/ui/TilePattern";

const perks = [
  "Upload a photo of your unfinished room",
  "Browse real tiles from our catalog",
  "See a photorealistic preview before you buy",
];

export function LoginPage() {
  const { user, signInWithPassword, signUpWithPassword, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from?.pathname ?? "/projects";

  if (user) return <Navigate to={destination} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setAwaitingConfirmation(false);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error: err } = await signInWithPassword(email, password);
        if (err) {
          setError(
            /confirm/i.test(err)
              ? "Your email isn't confirmed yet. Check your inbox (and spam folder), or resend the email below."
              : err,
          );
          if (/confirm/i.test(err)) setAwaitingConfirmation(true);
        } else {
          navigate(destination, { replace: true });
        }
      } else {
        const { error: err, needsConfirmation } = await signUpWithPassword(email, password);
        if (err) {
          setError(err);
        } else if (needsConfirmation) {
          setAwaitingConfirmation(true);
          setInfo(`We sent a confirmation link to ${email}. Open it, then come back and sign in. It can take a few minutes; check spam too.`);
          setMode("signin");
        } else {
          navigate(destination, { replace: true });
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    const { error: err } = await resendConfirmation(email);
    if (err) setError(err);
    else setInfo(`Confirmation email re-sent to ${email}.`);
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-stone-900 lg:block">
        <TilePattern className="absolute inset-0 h-full w-full opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-900/60 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <h2 className="font-display text-4xl leading-tight">See your finished room before the first tile is laid.</h2>
          <ul className="mt-8 space-y-3 text-stone-200">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-clay-500 text-xs">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <h1 className="font-display text-4xl text-stone-900">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-stone-600">
            {mode === "signin" ? "Sign in to continue your projects." : "Save projects and revisit your visualizations anytime."}
          </p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-stone-700">
                Email
              </label>
              <Input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                {info}
              </p>
            )}
            {awaitingConfirmation && email && (
              <button type="button" onClick={onResend} className="text-sm font-medium text-clay-700 underline underline-offset-2">
                Resend confirmation email
              </button>
            )}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-600">
            {mode === "signin" ? "New to TileTry? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-clay-700 hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
                setAwaitingConfirmation(false);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
