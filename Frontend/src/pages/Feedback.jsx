import { useEffect, useState } from "react";
import { Loader2, Star, MessageSquareText, Quote } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../lib/supabase";

const Feedback = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        setLoading(true);

        const { data, error: queryError } = await supabase
          .from("result_feedback")
          .select("id, username, rating, description, created_at")
          .order("created_at", { ascending: false });

        if (queryError) throw queryError;
        setFeedbacks(data || []);
      } catch (err) {
        setError(err?.message || "Failed to fetch feedbacks");
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbacks();
  }, []);

  const getInitials = (name) => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "U";
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-16 flex flex-col">
      <Navbar lightTheme />

      <div className="max-w-6xl mx-auto px-6 py-8 w-full flex-1">
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-white p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquareText className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">What Users Say</h1>
          </div>
          <p className="text-sm text-slate-600">
            Real testimonials and ratings from docking workflow users.
          </p>
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-600">
            {feedbacks.length > 0 ? `${feedbacks.length} testimonial${feedbacks.length > 1 ? "s" : ""}` : "No testimonials yet"}
          </p>
          {feedbacks.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              Community feedback
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 rounded-xl p-4 text-red-600 text-sm">
            {error}
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-600 shadow-sm">
            No feedback available yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {feedbacks.map((item, index) => (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  index === 0
                    ? "border-blue-300 bg-gradient-to-br from-blue-50 via-white to-white"
                    : "border-slate-200 bg-white hover:border-blue-300"
                }`}
              >
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-blue-100 blur-2xl pointer-events-none" />

                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                      {getInitials(item.username)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.username || "Unknown user"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(item.created_at) || "Recently"}
                      </p>
                    </div>
                  </div>

                  <Quote className="w-4 h-4 text-blue-400 shrink-0" />
                </div>

                <div className="flex items-center gap-1.5 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${
                        s <= (item.rating || 0)
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-slate-300"
                      }`}
                    />
                  ))}
                  <span className="text-xs text-slate-500 ml-1 font-medium">
                    {item.rating || 0}/5
                  </span>
                </div>

                <div className="relative">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                    {item.description}
                  </p>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
      <Footer lightTheme />
    </div>
  );
};

export default Feedback;
