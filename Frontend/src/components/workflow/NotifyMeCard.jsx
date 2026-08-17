import React, { useState, useEffect } from 'react';
import { Bell, BellRing, CheckCircle2, Mail, Sparkles, Volume2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  playCompletionChime,
} from '../../utils/notifications';

export default function NotifyMeCard({
  notifyEmail = '',
  setNotifyEmail = () => {},
  emailConfirmed = false,
  setEmailConfirmed = () => {},
  queueStatus = null,
  isRunning = false,
  jobType = 'single',
  className = '',
}) {
  const { user } = useAuth();
  const [browserPerm, setBrowserPerm] = useState(getNotificationPermission());
  const [testedSound, setTestedSound] = useState(false);

  // Auto-fill logged in user email if empty
  useEffect(() => {
    if (user?.email && !notifyEmail) {
      setNotifyEmail(user.email);
    }
  }, [user, notifyEmail, setNotifyEmail]);

  const handleRequestDesktopAlert = async () => {
    const result = await requestNotificationPermission();
    setBrowserPerm(result);
    if (result === 'granted') {
      toast.success('Desktop notifications enabled! You can now switch tabs safely.');
      playCompletionChime();
    } else if (result === 'denied') {
      toast.error('Notifications blocked by browser. Please enable permissions in your browser bar.');
    }
  };

  const handleTestSound = () => {
    playCompletionChime();
    setTestedSound(true);
    setTimeout(() => setTestedSound(false), 2000);
    toast.info('Audio alert tested! This chime will play when your job completes.');
  };

  const isQueued = queueStatus && (queueStatus.total_queued > 0 || (queueStatus.total_active || 0) > 0);
  const queueCount = queueStatus?.total_queued || 0;
  const etaText = queueStatus?.eta_label || (queueCount > 0 ? `~${queueCount * 2} min` : 'Under 1 min');

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 ${
        isRunning || isQueued
          ? 'border-primary/30 bg-card/90 shadow-elevated ring-1 ring-primary/20'
          : 'border-border bg-card/60'
      } p-5 ${className}`}
    >
      {/* Header with Live Status & Queue indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            {browserPerm === 'granted' ? <BellRing size={16} className="animate-pulse" /> : <Bell size={16} />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>Notify Me on Completion</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {isRunning ? 'Run in Progress' : 'Queue Alert'}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Never wait around — get pinged the instant your {jobType === 'batch' ? 'batch results' : 'docked poses'} are ready.
            </p>
          </div>
        </div>

        {/* Real-time Queue Badge */}
        {isQueued && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>{queueCount > 0 ? `${queueCount} Job${queueCount > 1 ? 's' : ''} in Queue` : 'Active Server Load'} · Est. {etaText}</span>
          </div>
        )}
      </div>

      {/* Grid of Notification Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
        
        {/* Option 1: Desktop Browser Push Notification */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-background flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Bell size={13} className="text-primary" />
                Browser Push Alert
              </span>
              {browserPerm === 'granted' && (
                <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                  <ShieldCheck size={12} /> Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Receive a desktop popup and chime even if you switch tabs or minimize the window.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {browserPerm === 'granted' ? (
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-medium text-emerald-500 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Desktop Alerts Ready
                </span>
                <button
                  type="button"
                  onClick={handleTestSound}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
                  title="Test completion sound chime"
                >
                  <Volume2 size={12} /> {testedSound ? 'Playing…' : 'Test Sound'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRequestDesktopAlert}
                className="w-full py-2 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <BellRing size={14} /> Enable Desktop Push Alert
              </button>
            )}
          </div>
        </div>

        {/* Option 2: Email Notification */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-background flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Mail size={13} className="text-primary" />
                Direct Email Results Link
              </span>
              <span className="text-[10px] text-muted-foreground">Optional</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              We&apos;ll send a direct results summary and 3D viewer link directly to your inbox.
            </p>
          </div>

          <div>
            {emailConfirmed && notifyEmail.includes('@') ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 size={13} className="text-primary shrink-0" />
                  <span className="text-xs font-bold text-primary truncate" title={notifyEmail}>
                    {notifyEmail}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailConfirmed(false)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-2 shrink-0"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your.email@university.edu"
                  value={notifyEmail}
                  onChange={(e) => {
                    setNotifyEmail(e.target.value);
                    if (emailConfirmed) setEmailConfirmed(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && notifyEmail.includes('@')) {
                      setEmailConfirmed(true);
                      toast.success(`Email alert set for ${notifyEmail}`);
                    }
                  }}
                  className="flex-1 min-w-0 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (notifyEmail.includes('@')) {
                      setEmailConfirmed(true);
                      toast.success(`Email alert set for ${notifyEmail}`);
                    }
                  }}
                  disabled={!notifyEmail.includes('@')}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap"
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Helpful Hint banner when waiting in queue or during execution */}
      {(isRunning || isQueued) && (
        <div className="mt-3.5 p-2.5 rounded-xl bg-muted/40 border border-border/60 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Sparkles size={13} className="text-primary shrink-0" />
          <span>
            <strong>Pro Tip:</strong> You can safely switch tabs or minimize your browser. SaliDock will automatically alert you the second your job concludes.
          </span>
        </div>
      )}
    </div>
  );
}
