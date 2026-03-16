import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "../components/Navbar";

const NotFound = () => {
    const location = useLocation();

    useEffect(() => {
        console.error(
            "404 Error: User attempted to access non-existent route:",
            location.pathname
        );
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="min-h-screen flex flex-col items-center justify-center px-4">
                {/* Glow */}
                <div className="absolute w-[400px] h-[400px] rounded-full bg-primary/[0.04] blur-[150px] pointer-events-none" />

                <div className="relative z-10 text-center">
                    <h1 className="text-8xl font-black text-primary/30 mb-2">404</h1>
                    <h2 className="text-2xl font-bold text-foreground mb-3">
                        Page Not Found
                    </h2>
                    <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                        The page <code className="text-primary/70 text-sm">{location.pathname}</code> doesn't exist.
                    </p>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 active:scale-[0.97] transition-all"
                    >
                        Return to Home
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default NotFound;
