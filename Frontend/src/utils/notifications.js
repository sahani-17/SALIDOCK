/**
 * notifications.js — Client-side notifications & audio alerts for SaliDock.
 * Provides browser desktop notifications, Web Audio synthesized chime, and helpers.
 */

// Synthesize a pleasant harmonic chime when a docking run completes
export function playCompletionChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    // Harmonic arpeggio: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.09);

      gain.gain.setValueAtTime(0, now + index * 0.09);
      gain.gain.linearRampToValueAtTime(0.18, now + index * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.09);
      osc.stop(now + index * 0.09 + 0.48);
    });
  } catch (err) {
    console.debug('Audio chime skipped:', err);
  }
}

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return 'denied';
  }
}

export function sendBrowserNotification(title, options = {}) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return null;

  try {
    const notification = new Notification(title, {
      icon: '/salidock-logo.png',
      badge: '/favicon.png',
      silent: false,
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      if (options.url) {
        window.location.href = options.url;
      }
      notification.close();
    };

    return notification;
  } catch (err) {
    console.error('Error sending browser notification:', err);
    return null;
  }
}

export function notifyJobCompletion({ title = 'SaliDock: Docking Completed! 🎉', body = 'Your molecular docking job has finished.', url = null }) {
  // 1. Play audio chime
  playCompletionChime();

  // 2. Send desktop notification if granted
  if (isNotificationSupported() && Notification.permission === 'granted') {
    sendBrowserNotification(title, { body, url });
  }
}
