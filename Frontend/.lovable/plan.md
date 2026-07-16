## Rebrand About & Documentation pages to the new SALIDOCK palette

### Problem
`src/pages/About.jsx` and `src/pages/Documentation.jsx` still use the previous sky-blue accent palette (`#38bdf8`, `#0ea5e9`, `bg-sky-50`, `text-blue-600`, blue glows). These pages now look visually disconnected from the new landing page, `Results`, and `Dock` pages, which are already on the light neutral + navy/orange/green token system defined in `src/index.css`.

### Goal
Apply the same light, professional, logo-driven palette to About and Documentation without changing their layout or content. Keep backgrounds neutral (white / subtle muted), and use navy (`hsl(var(--primary))`) for primary accents, orange (`hsl(var(--accent))`) for CTA emphasis where appropriate, and the existing slate token scale for text and borders.

### Changes

#### 1. `src/pages/About.jsx`
Replace hardcoded sky-blue/blue color values with design-token equivalents:
- `#38bdf8` dividers/labels/icons → `bg-primary` / `text-primary`
- `#0ea5e9` headings/corners/icons → `text-primary` / `border-primary`
- `bg-sky-50` / `bg-blue-50` icon/avatar containers → `bg-primary/10`
- `border-blue-200` avatar rings → `border-primary/20`
- `hover:border-blue-300` team cards → `hover:border-primary/40`
- `text-blue-600` social icon hover → `hover:text-primary`
- Blue cursor-glow blobs (`hsl(221 83% 53% / ...)` in `CursorGlow` and `TiltCard` glare) → `hsl(var(--primary) / ...)`
- Raw `#94a3b8` muted text → `text-muted-foreground` where it is purely decorative/secondary
- Keep `bg-white` sections, but ensure large section backgrounds map to `bg-background` or `bg-card` where the page wrapper already uses them.

#### 2. `src/pages/Documentation.jsx`
Apply the same token swap plus route/navigation consistency:
- `#38bdf8` / `#0ea5e9` accents → `text-primary` / `border-primary` / `bg-primary/10`
- `bg-sky-50` icon containers → `bg-primary/10`
- `bg-[#0ea5e9]` Start Docking CTA button → use the shared `src/components/ui/Button.jsx` with `variant="primary"` (navy)
- `shadow-[#0ea5e9]/30` → remove or use `shadow-glow` utility based on primary
- Sidebar dropdown links route to `/cavity` and `/active` → update to `/dock` and `/dock?mode=active` so they match the current unified workflow
- Blue cursor-glow blobs → primary-colored tokens
- `border-sky-100` tip borders → `border-primary/20`
- Bullet dots (`bg-[#0ea5e9]`) → `bg-primary`

#### 3. Cross-page consistency sweep
- Verify both pages import and use `bg-background` / `text-foreground` / `border-border` / `muted-foreground` where applicable, matching `Landing.jsx` and `Dock.jsx`.
- Ensure the `Footer` and `Navbar` props (`lightTheme` if still needed) remain compatible with the new token palette.
- Remove any remaining literal `text-slate-900` / `text-slate-800` overrides that clash with the neutral ink token; replace with `text-foreground` / `text-card-foreground` unless intentional.

### Verification
- Run `bunx eslint src/pages/About.jsx src/pages/Documentation.jsx` and the project typecheck/build to catch class-name typos or broken imports.
- Visually inspect `/about` and `/docs` in the preview: dividers, active sidebar states, section icons, team-card hover borders, and CTA buttons should all read navy rather than sky-blue.
- Confirm the Documentation sidebar "Start Docking" dropdown routes to `/dock` and `/dock?mode=active` and uses the shared `Button` component.

### Out of scope
- No layout or copy changes on these pages.
- No dark-mode work; both pages stay on the light neutral canvas.
- No changes to `Results`, `Dock`, or `Landing`, which are already on the new palette.