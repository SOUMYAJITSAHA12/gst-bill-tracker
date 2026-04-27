"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const DEMO_USER = {
  id: "demo-user",
  email: "demo@gst-tracker.app",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as unknown as User;

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isDemo: false,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const demo = !isSupabaseConfigured();

  useEffect(() => {
    if (demo) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [demo]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (demo) {
      setUser(DEMO_USER);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, [demo]);

  const signOut = useCallback(async () => {
    if (demo) {
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
  }, [demo]);

  return (
    <AuthContext.Provider value={{ user, session, loading, isDemo: demo, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
