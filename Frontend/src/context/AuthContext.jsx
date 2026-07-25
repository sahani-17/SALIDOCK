import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Safety fallback: Never allow auth loading to block the app for >1.5s
    const timer = setTimeout(() => {
      if (mounted && loading) {
        setLoading(false);
      }
    }, 1500);

    try {
      if (supabase && supabase.auth) {
        supabase.auth.getSession()
          .then(({ data }) => {
            if (!mounted) return;
            clearTimeout(timer);
            setUser(data?.session?.user ?? null);
            setLoading(false);
          })
          .catch((err) => {
            console.warn("Auth getSession error:", err);
            if (!mounted) return;
            clearTimeout(timer);
            setLoading(false);
          });

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!mounted) return;
          setUser(session?.user ?? null);
          setLoading(false);
        });

        return () => {
          mounted = false;
          clearTimeout(timer);
          subscription?.unsubscribe();
        };
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.warn("Auth initialization error:", err);
      if (mounted) setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signOut: () => supabase.auth.signOut(),
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
