import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-elevated">
          <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary mb-4">
            Join Salidock
          </div>
          <h1 className="text-2xl font-bold mb-1 text-foreground">Register</h1>
          <p className="text-sm text-muted-foreground mb-6">Create an account to access SALIDOCK secure pages.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1 font-medium text-foreground">User name</label>
              <input
                type="text"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 outline-none text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1 font-medium text-foreground">Email</label>
              <input
                type="email"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 outline-none text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1 font-medium text-foreground">Password</label>
              <input
                type="password"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 outline-none text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-bold hover:brightness-110 transition-all disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="text-sm text-muted-foreground mt-4 text-center">
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
