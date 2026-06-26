import { useEffect, useState } from "react";
import { Loader2, Star, MessageSquareText } from "lucide-react";
import Navbar from "../components/Navbar";
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

  return (
    <div className="min-h-screen bg-background pt-16">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquareText className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">User Feedback</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          All submitted ratings and feedback descriptions.
        </p>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-card border border-destructive/20 rounded-xl p-4 text-destructive text-sm">
            {error}
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="bg-card border border-primary/10 rounded-xl p-8 text-center text-muted-foreground">
            No feedback available yet.
          </div>
        ) : (
          <div className="space-y-4">
            {feedbacks.map((item) => (
              <div
                key={item.id}
                className="bg-card border border-primary/10 rounded-xl p-5 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm text-muted-foreground">User name</p>
                    <p className="text-base font-semibold text-foreground">
                      {item.username || "Unknown user"}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Rating</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= (item.rating || 0)
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">
                        {item.rating || 0}/5
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Feedback</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Feedback;
