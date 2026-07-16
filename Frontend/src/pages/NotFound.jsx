import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const NotFound = () => {
    const location = useLocation();

    useEffect(() => {
        console.error(
            "404 Error: User attempted to access non-existent route:",
            location.pathname
        );
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <Navbar lightTheme />
            <div className="flex-1 min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4">
                {/* Glow */}
                <div className="absolute w-[420px] h-[420px] rounded-full bg-blue-200/40 blur-[150px] pointer-events-none" />

                <div className="relative z-10 text-center rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-xl shadow-slate-200/60 max-w-xl w-full">
                    <h1 className="text-8xl font-black text-blue-200 mb-2">404</h1>
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">
                        Page Not Found
                    </h2>
                    <p className="text-slate-600 mb-8 max-w-md mx-auto">
                        The page <code className="text-blue-600 text-sm bg-blue-50 px-1.5 py-0.5 rounded">{location.pathname}</code> doesn't exist.
                    </p>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-[0.97] transition-all"
                    >
                        Return to Home
                    </Link>
                </div>
            </div>
            <Footer lightTheme />
        </div>
    );
};

export default NotFound;
