import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SDSLogo } from "@/components/ui/SDSLogo";

/**
 * Where the "Forgot password?" email lands. Supabase signs the owner in from the link (a short recovery session);
 * this page then sets the new password. Without that session the link has expired, so a new one is offered.
 */
export function ResetPasswordPage() {
  const { user, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  // The session from the link can take a moment to be read from the address; wait briefly before calling it expired.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 2500);
    return () => window.clearTimeout(id);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Use at least 6 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setSaving(true);
    const { error: err } = await updatePassword(password);
    setSaving(false);
    if (err) return setError(err);
    setDone(true);
    window.setTimeout(() => navigate("/projects", { replace: true }), 1500);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <SDSLogo size="md" variant="dark" subtitle="Virtual Trial Room" />
        </div>
        <h1 className="font-display text-3xl font-bold text-stone-900">Choose a new password</h1>

        {done ? (
          <p role="status" className="mt-6 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Your password has been changed. Taking you to your projects…
          </p>
        ) : user ? (
          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <p className="text-sm text-stone-600">Signed in as {user.email}. Enter your new password twice.</p>
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-stone-700">
                New password
              </label>
              <Input id="new-password" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-stone-700">
                Repeat new password
              </label>
              <Input id="confirm-password" type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={saving}>
              Save new password
            </Button>
          </form>
        ) : loading || !waited ? (
          <p className="mt-6 text-sm text-stone-500">Checking your reset link…</p>
        ) : (
          <div className="mt-6 space-y-4 text-sm text-stone-600">
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2.5 text-amber-900">
              This reset link has expired or was already used. Ask for a new one from the sign-in page.
            </p>
            <Link to="/login" className="inline-block font-semibold text-clay-700 underline underline-offset-2">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
