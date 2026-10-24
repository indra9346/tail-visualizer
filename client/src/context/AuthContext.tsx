import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  /** Emails a link that signs the owner in on /reset-password to choose a new password. */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // A reset link that landed anywhere else (e.g. the site's home page) still ends on the new-password form.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") window.location.replace("/reset-password");
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithPassword(email: string, password: string) {
    // The confirmation link returns to THIS site (not the project's Site URL, which was once localhost).
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } });
    if (error) return { error: error.message, needsConfirmation: false };
    // An existing confirmed email returns a user with no identities (Supabase hides "already registered").
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: "This email is already registered. Please sign in instead.", needsConfirmation: false };
    }
    // A session means email confirmation is switched off: the user is already signed in.
    return { error: null, needsConfirmation: !data.session };
  }

  async function resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/login` } });
    return { error: error?.message ?? null };
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    return { error: error?.message ?? null };
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, signInWithPassword, signUpWithPassword, resendConfirmation, sendPasswordReset, updatePassword, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
