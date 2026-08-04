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
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <Navbar />
            <div className="flex-1 min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4">
                {/* Glow */}
                <div className="absolute w-[420px] h-[420px] rounded-full bg-primary/20 blur-[150px] pointer-events-none" />

                <div className="relative z-10 text-center rounded-2xl border border-border bg-card px-8 py-10 shadow-elevated max-w-xl w-full">
                    <h1 className="text-8xl font-black text-primary/20 mb-2">404</h1>
                    <h2 className="text-2xl font-bold text-foreground mb-3">
                        Page Not Found
                    </h2>
                    <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                        The page <code className="text-primary text-sm bg-primary/10 px-1.5 py-0.5 rounded">{location.pathname}</code> doesn't exist.
                    </p>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 active:scale-[0.97] transition-all"
                    >
                        Return to Home
                    </Link>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default NotFound;
