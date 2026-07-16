import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = location.state?.from?.pathname || "/";

  if (user) {
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Login successful");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      toast.error(error.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar lightTheme />
      <main className="flex-1 pt-24 pb-10 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/60">
          <h1 className="text-2xl font-bold mb-1 text-slate-900">Login</h1>
          <p className="text-sm text-slate-600 mb-6">Sign in to access protected docking workflows.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1 text-slate-700">Email</label>
              <input
                type="email"
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1 text-slate-700">Password</label>
              <input
                type="password"
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="text-sm text-slate-600 mt-4 text-center">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="text-blue-600 hover:text-blue-700 hover:underline font-medium">
              Register
            </Link>
          </p>
        </div>
      </main>
      <Footer lightTheme />
    </div>
  );
};

export default Login;
