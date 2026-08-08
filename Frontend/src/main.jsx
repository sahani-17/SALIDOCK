// Build v2.2 — hardcoded relative API pathing
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import App from './App.jsx'

// ── Global MagicUI Ripple Effect ─────────────────────────────────────────────
// Single delegated listener on document — fires for every button/role=button
// click across the entire app. No per-component wiring needed.
document.addEventListener('click', (e) => {
  const target = e.target.closest('button, [role="button"], .ripple-btn');
  if (!target || target.disabled || target.dataset.noRipple) return;

  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = Math.max(rect.width, rect.height) * 2;

  const ripple = document.createElement('span');
  ripple.style.cssText = `
    position:absolute;
    border-radius:50%;
    pointer-events:none;
    width:${size}px;
    height:${size}px;
    top:${y - size / 2}px;
    left:${x - size / 2}px;
    background:#ADD8E6;
    opacity:0.35;
    transform:scale(0);
    animation:salidock-ripple 0.6s ease-out forwards;
    z-index:9999;
  `;
  target.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}, true); // capture phase so it fires before React handlers
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
