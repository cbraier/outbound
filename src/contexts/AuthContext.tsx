import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: string | null; needsConfirm?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  recovery: boolean;
  clearRecovery: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthCtx["signUp"] = async (email, password, nome) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nome } },
      });
      if (error) return { error: error.message };
      // Sem sessão = precisa confirmar o e-mail antes de entrar.
      return { error: null, needsConfirm: !data.session };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Não foi possível criar a conta." };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword: AuthCtx["resetPassword"] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://outbound.zonn.com.br" });
    return { error: error?.message ?? null };
  };

  const updatePassword: AuthCtx["updatePassword"] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const clearRecovery = () => setRecovery(false);

  return (
    <Ctx.Provider value={{ session, user, loading, signIn, signUp, signOut, resetPassword, updatePassword, recovery, clearRecovery }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
