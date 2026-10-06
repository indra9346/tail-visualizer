import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams, Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TileScene } from "@/components/ui/TileScene";
import { SDSLogo } from "@/components/ui/SDSLogo";

/** Self-serve account creation: anyone can register and gets a private workspace (own designs, tiles and credits). */
const SIGNUP_ENABLED = true;

const perks = [
  "Upload a photo of your unfinished room",
  "Browse genuine tiles from verified showroom catalogs",
  "See a photorealistic preview before the first tile is fixed",
  "Compare 3 tiles in your real space to choose with confidence",
];

export function LoginPage() {
  const { user, signInWithPassword, signUpWithPassword, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(SIGNUP_ENABLED && params.get("mode") === "signup" ? "signup" : "signin");
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
        if (err) setError(err);
        else navigate(destination);
      } else {
        const { error: err, needsConfirmation } = await signUpWithPassword(email, password);
        if (err) {
          setError(err);
        } else if (needsConfirmation) {
          setAwaitingConfirmation(true);
          setInfo("Check your email for a confirmation link before signing in.");
        } else {
          navigate(destination);
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!email) return;
    const { error: err } = await resendConfirmation(email);
    if (err) setError(err);
    else setInfo(`Confirmation email re-sent to ${email}.`);
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#efe6d8] lg:block">
        <TileScene scene="terrazzo" className="absolute inset-0 h-full w-full" />
        <div className="relative flex h-full flex-col justify-between p-10 text-stone-900">
          <div className="flex items-center">
            <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-lg backdrop-blur-md"><SDSLogo size="lg" variant="dark" subtitle="Virtual Trial Room" /></div>
          </div>

          <div className="mb-4 rounded-2xl bg-white/85 p-7 shadow-lg backdrop-blur-md">
            <span className="rounded-full border border-clay-300 bg-clay-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-800">
              The Virtual Trial Room for Your Home
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-stone-900">
              See your finished room before the first tile is laid.
            </h2>
            <ul className="mt-6 space-y-3 text-stone-700">
              {perks.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-clay-600 text-xs font-bold text-white">✓</span>
                  <span className="text-sm">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-stone-700">
            &copy; {new Date().getFullYear()} SDS TILES & CERAMICS. All rights reserved.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 lg:hidden">
            <SDSLogo size="md" variant="dark" subtitle="Virtual Trial Room" />
          </div>

          <h1 className="font-display text-3xl font-bold text-stone-900 sm:text-4xl">{mode === "signin" ? "Welcome Back" : "Create Your Account"}</h1>
          <p className="mt-2 text-stone-600">
            {mode === "signin" ? "Sign in to continue your virtual trial projects." : "Save room captures and revisit your virtual previews anytime."}
          </p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-stone-700">
                Email Address
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
                placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "Your password"}
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

            <Button type="submit" size="lg" className="w-full shadow-md" loading={submitting}>
              {mode === "signin" ? "Sign In to Trial Room →" : "Create Account & Start Trial →"}
            </Button>
          </form>

          {SIGNUP_ENABLED && (
            <p className="mt-6 text-center text-sm text-stone-600">
              {mode === "signin" ? "New to SDS TILES & CERAMICS? " : "Already have an account? "}
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
          )}

          <div className="mt-8 border-t border-stone-200 pt-6 text-center">
            <Link to="/" className="text-xs text-stone-500 hover:text-stone-900 transition">
              ← Back to SDS TILES & CERAMICS Home
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
