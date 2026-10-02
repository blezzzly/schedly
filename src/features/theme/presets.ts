export type ThemePreset = {
  id: string;
  name: string;
  swatch: string;
  vars: Record<string, string>;
};

const h = (l: number, c: number, hue: number) => `oklch(${l} ${c} ${hue})`;

// Layered texture backdrop — kept neutral so the theme's accent color only
// shows on interactive elements (buttons, highlights), not the background.
const TEXTURE_LIGHT = [
  "radial-gradient(circle at 20% 80%, rgba(0,0,0,0.03) 0%, transparent 50%)",
  "radial-gradient(circle at 80% 20%, rgba(0,0,0,0.02) 0%, transparent 50%)",
].join(", ");

function derive(hue: number): ThemePreset["vars"] {
  return {
    "--background": h(0.975, 0.008, hue),
    "--foreground": h(0.17, 0.01, 20),
    "--card": "oklch(1 0 0)",
    "--card-foreground": h(0.17, 0.01, 20),
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": h(0.17, 0.01, 20),
    "--primary": h(0.59, 0.22, hue),
    "--primary-foreground": h(0.99, 0, 0),
    "--secondary": h(0.95, 0.02, hue),
    "--secondary-foreground": h(0.40, 0.18, hue),
    "--accent": h(0.93, 0.03, hue),
    "--accent-foreground": h(0.35, 0.18, hue),
    "--muted": h(0.96, 0.01, hue),
    "--muted-foreground": h(0.50, 0.02, hue),
    "--destructive": h(0.58, 0.22, 30),
    "--destructive-foreground": h(0.99, 0, 0),
    "--border": h(0.91, 0.02, hue),
    "--input": h(0.91, 0.02, hue),
    "--ring": h(0.59, 0.22, hue),
    "--chart-1": h(0.59, 0.22, hue),
    "--chart-2": h(0.68, 0.20, 340),
    "--chart-3": h(0.55, 0.22, 300),
    "--chart-4": h(0.70, 0.15, 195),
    "--chart-5": h(0.75, 0.15, 80),
    "--sidebar": h(0.965, 0.012, hue),
    "--sidebar-foreground": h(0.17, 0.01, 20),
    "--sidebar-accent": h(0.93, 0.025, hue),
    "--sidebar-accent-foreground": h(0.17, 0.01, 20),
    "--sidebar-border": h(0.91, 0.02, hue),
    "--sidebar-primary": h(0.59, 0.22, hue),
    "--sidebar-primary-foreground": h(0.99, 0, 0),
    "--sidebar-ring": h(0.59, 0.22, hue),
    "--app-bg-image": TEXTURE_LIGHT,
  };
}

// Dark variant for the Midnight theme — black backdrop, dark indigo
// surfaces, and brighter accent colors that pop on dark.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "rose",
    name: "Rose",
    swatch: h(0.59, 0.22, 355),
    vars: derive(355),
  },
  {
    id: "ocean",
    name: "Ocean",
    swatch: h(0.55, 0.20, 250),
    vars: derive(250),
  },
  {
    id: "emerald",
    name: "Emerald",
    swatch: h(0.55, 0.20, 160),
    vars: derive(160),
  },
  {
    id: "lavender",
    name: "Lavender",
    swatch: h(0.55, 0.20, 300),
    vars: derive(300),
  },
  {
    id: "amber",
    name: "Amber",
    swatch: h(0.60, 0.18, 80),
    vars: derive(80),
  },
  {
    id: "teal",
    name: "Teal",
    swatch: h(0.55, 0.18, 190),
    vars: derive(190),
  },
  {
    id: "coral",
    name: "Coral",
    swatch: h(0.60, 0.20, 25),
    vars: derive(25),
  },
  {
    id: "slate",
    name: "Slate",
    swatch: h(0.50, 0.05, 260),
    vars: derive(260),
  },
];

export const DEFAULT_THEME_ID = "rose";
