import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const Register = () => {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) throw error;

      toast.success("Registration successful. You can now log in.");
      navigate("/login", { replace: true, state: location.state });
    } catch (error) {
      toast.error(error.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-10 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card/80 backdrop-blur-2xl p-6 sm:p-8 shadow-elevated apple-specular-edge">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary mb-3">
            Join SaliDock
          </div>
          <h1 className="text-2xl font-bold mb-1 text-foreground tracking-tight">Register</h1>
          <p className="text-sm text-muted-foreground mb-6">Create an account to access SaliDock secure workflows.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5 font-semibold text-muted-foreground">Username</label>
              <input
                type="text"
                className="w-full rounded-xl bg-card/70 border border-border/80 px-3.5 py-2.5 outline-none text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5 font-semibold text-muted-foreground">Email</label>
              <input
                type="email"
                className="w-full rounded-xl bg-card/70 border border-border/80 px-3.5 py-2.5 outline-none text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5 font-semibold text-muted-foreground">Password</label>
              <input
                type="password"
                className="w-full rounded-xl bg-card/70 border border-border/80 px-3.5 py-2.5 outline-none text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-primary text-primary-foreground py-2.5 font-semibold text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out shadow-sm shadow-primary/20 apple-specular-edge disabled:opacity-40"
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="text-sm text-muted-foreground mt-5 text-center">
            Already have an account?{" "}
            <Link to="/login" state={location.state} className="text-primary hover:underline font-semibold">
              Login
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Register;
