"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import type { ExtractedClass } from "@/features/upload/hooks/use-upload";
import { PALETTE } from "@/features/upload/lib/palette";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  ArrowLeft, Download, ImageIcon, ImagePlus, RotateCcw,
  Undo2, Redo2, Copy, BringToFront, SendToBack, Eraser, Type,
  Grid3x3, Palette, Plus, Trash2, Sparkles,
  ChevronDown, ChevronUp, Check,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function formatTime(time: string): string {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// Samples the photo and estimates whether it is dark overall, so text placed
// on top (timetable subjects/times) can pick a contrasting color.
function isImageDark(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement("canvas");
    const size = 24;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return sum / (data.length / 4) < 128;
  } catch {
    return false;
  }
}

type TimetableEntry = {
  subject: string;
  time: string;
  color: string;
};

type DesignTable = {
  days: string[];
  rows: { time: string; cells: TimetableEntry[][] }[];
};

type DesignItem = {
  id: string;
  label: string;
  sub: string | null;
  color: string;
  x: number; // % from left
  y: number; // % from top
  scale: number;
  z: number;
  table?: DesignTable;
};

type ResizeDir = "e" | "w" | "n" | "s" | "se" | "sw" | "ne" | "nw";

const DAY_ORDER = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

type Tool = "text" | "classes" | "background" | "color";

type Props = {
  classes: ExtractedClass[];
  imageUrl?: string;
  onClose: () => void;
};

function RailButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors md:w-full ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-primary"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

export function ScheduleDesignEditor({ classes, imageUrl, onClose }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [bgDims, setBgDims] = useState<{ w: number; h: number } | null>(null);
  // Whether the background photo is dark — the timetable text switches between
  // light/dark so it always stays readable over the photo.
  const [bgDark, setBgDark] = useState(false);
  // Display size of the background canvas: scaled to fit the screen while
  // preserving the image's aspect ratio (the export uses the full size).
  const [bgSize, setBgSize] = useState<{ w: number; h: number } | null>(null);
  const [items, setItems] = useState<DesignItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  // Mobile: the tool panel can be collapsed/expanded with a floating button
  // without losing the active tool's state.
  const [panelHidden, setPanelHidden] = useState(false);
  const [undoStack, setUndoStack] = useState<DesignItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DesignItem[][]>([]);
  const [textInput, setTextInput] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const dragState = useRef<{
    type: "move" | ResizeDir;
    id: string;
    startX: number;
    startY: number;
    itemX: number;
    itemY: number;
    itemScale: number;
    natW: number;
    natH: number;
  } | null>(null);
  const zCounter = useRef(1);
  const dupCounter = useRef(1);
  const textCounter = useRef(1);

  const addedIds = new Set(items.map((i) => i.id));
  const hasTimetable = items.some((i) => i.table);
  const tableLine = bgDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)";
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const commit = (updater: (prev: DesignItem[]) => DesignItem[]) => {
    setUndoStack((past) => [...past.slice(-49), items]);
    setRedoStack([]);
    setItems(updater);
  };

  const undo = () => {
    const past = undoStack;
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    setUndoStack(past.slice(0, -1));
    setRedoStack((future) => [...future.slice(-49), items]);
    setItems(prev);
  };

  const redo = () => {
    const future = redoStack;
    if (future.length === 0) return;
    const next = future[future.length - 1]!;
    setRedoStack(future.slice(0, -1));
    setUndoStack((past) => [...past.slice(-49), items]);
    setItems(next);
  };

  const addItem = (classIndex: number) => {
    const cls = classes[classIndex]!;
    const stagger = (items.length % 6) * 9;
    const days = cls.days.length
      ? cls.days.map((d) => DAY_LABELS[d]).join(", ")
      : null;
    const time = cls.startTime
      ? `${formatTime(cls.startTime)} – ${formatTime(cls.endTime || cls.startTime)}`
      : null;
    commit((prev) => [
      ...prev,
      {
        id: String(classIndex),
        label: cls.shortName || cls.subject,
        sub: [days, time].filter(Boolean).join(" · ") || null,
        color: PALETTE[classIndex % PALETTE.length]!,
        x: 10 + stagger,
        y: 10 + stagger * 0.7,
        scale: 1,
        z: zCounter.current++,
      },
    ]);
    setSelectedId(String(classIndex));
    // Close the tool panel so the whole canvas is visible again and the
    // newly added item can be dragged anywhere (the panel would otherwise
    // cover the bottom of the canvas).
    setActiveTool(null);
  };

  // "Select all" — places one timetable item (like the dashboard's schedule
  // grid): columns per active day, rows per start time, colored class blocks.
  const addAllClasses = () => {
    if (classes.length === 0) return;
    const toMinutes = (t: string) => {
      const [hh, mm] = t.split(":").map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    const clsDays = DAY_ORDER.filter((d) => classes.some((c) => c.days.includes(d)));
    if (clsDays.length === 0) return;
    const slots = Array.from(new Set(classes.map((c) => toMinutes(c.startTime)))).sort(
      (a, b) => a - b
    );
    const rows = slots.map((slot) => ({
      time: formatTime(
        `${Math.floor(slot / 60)}:${String(slot % 60).padStart(2, "0")}`
      ),
      cells: clsDays.map((day) =>
        classes
          .map((c, i) => ({ c, i }))
          .filter(
            ({ c }) =>
              c.days.includes(day) && toMinutes(c.startTime) === slot
          )
          .map(({ c, i }) => ({
            subject: c.shortName || c.subject,
            time: `${formatTime(c.startTime)} – ${formatTime(c.endTime || c.startTime)}`,
            color: PALETTE[i % PALETTE.length]!,
          }))
      ),
    }));
    commit((prev) => [
      ...prev,
      {
        id: "table-all",
        label: "Weekly Schedule",
        sub: null,
        color: "transparent",
        table: { days: clsDays.map((d) => DAY_LABELS[d] ?? d), rows },
        x: 5,
        y: 5,
        scale: 1,
        z: zCounter.current++,
      },
    ]);
    setSelectedId("table-all");
    setActiveTool(null);
  };

  const removeItem = (id: string) => {
    if (!items.some((i) => i.id === id)) return;
    commit((prev) => prev.filter((i) => i.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const duplicateItem = () => {
    const item = selectedItem;
    if (!item) return;
    const newId = `${item.id}-copy-${dupCounter.current++}`;
    commit((prev) => [
      ...prev,
      {
        ...item,
        id: newId,
        x: Math.min(92, item.x + 6),
        y: Math.min(92, item.y + 6),
        z: zCounter.current++,
      },
    ]);
    setSelectedId(newId);
  };

  const bringForward = () => {
    const item = selectedItem;
    if (!item) return;
    const sorted = [...items].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((i) => i.id === item.id);
    const next = sorted[idx + 1];
    if (!next) return;
    commit((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, z: next.z }
          : i.id === next.id
            ? { ...i, z: item.z }
            : i
      )
    );
  };

  const sendBackward = () => {
    const item = selectedItem;
    if (!item) return;
    const sorted = [...items].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((i) => i.id === item.id);
    const prev = sorted[idx - 1];
    if (!prev) return;
    commit((itemsPrev) =>
      itemsPrev.map((i) =>
        i.id === item.id
          ? { ...i, z: prev.z }
          : i.id === prev.id
            ? { ...i, z: item.z }
            : i
      )
    );
  };

  const clearAll = () => {
    if (items.length === 0) return;
    commit(() => []);
    setSelectedId(null);
  };

  const addTextItem = () => {
    const label = textInput.trim();
    if (!label) return;
    const id = `text-${textCounter.current++}`;
    commit((prev) => [
      ...prev,
      {
        id,
        label,
        sub: null,
        color: selectedItem?.color ?? PALETTE[0]!,
        x: 10,
        y: 10,
        scale: 1,
        z: zCounter.current++,
      },
    ]);
    setSelectedId(id);
    setTextInput("");
    setActiveTool(null);
  };

  const applyColor = (color: string) => {
    const item = selectedItem;
    if (!item || item.color === color) return;
    commit((prev) => prev.map((i) => (i.id === item.id ? { ...i, color } : i)));
  };

  // Fit the canvas on screen at the image's TRUE proportions: it fills the
  // available width (never exceeding the image's natural resolution) so there
  // is no white letterboxing on the sides. Tall canvases are only capped at a
  // generous height and simply scroll instead of being squished.
  const bgDimsRef = useRef<{ w: number; h: number } | null>(null);

  const fitBg = () => {
    const dims = bgDimsRef.current;
    if (!dims) return;
    const isMd = window.matchMedia("(min-width: 768px)").matches;
    const maxW = isMd
      ? Math.max(400, window.innerWidth - 340)
      : Math.max(200, window.innerWidth - 48);
    const maxH = Math.max(window.innerHeight * 1.5, 1200);
    const ratio = dims.w / dims.h;
    let w = Math.min(maxW, dims.w);
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    setBgSize({ w: Math.round(w), h: Math.round(h) });
  };

  useEffect(() => {
    window.addEventListener("resize", fitBg);
    return () => window.removeEventListener("resize", fitBg);
  }, []);

  const loadBgDims = (src: string) => {
    const img = new Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      bgDimsRef.current = dims;
      setBgDims(dims);
      fitBg();
      setBgDark(isImageDark(img));
    };
    img.onerror = () => {
      bgDimsRef.current = null;
      setBgDims(null);
      setBgSize(null);
    };
    img.src = src;
  };

  const handleBackgroundChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setBackgroundUrl(url);
      loadBgDims(url);
      setActiveTool(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handlePointerDown = (e: React.PointerEvent, id: string, type: "move" | ResizeDir) => {
    e.preventDefault();
    e.stopPropagation();
    const item = items.find((i) => i.id === id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!item || !rect) return;
    setSelectedId(id);
    setUndoStack((past) => [...past.slice(-49), items]);
    setRedoStack([]);
    // Natural (unscaled) size: the item div's layout size. CSS transforms do
    // not affect offsetWidth/offsetHeight, so this stays stable while scaling.
    const host = e.currentTarget as HTMLElement;
    const el = type === "move" ? host : (host.parentElement as HTMLElement);
    const natW = el.offsetWidth;
    const natH = el.offsetHeight;
    dragState.current = {
      type, id,
      startX: e.clientX,
      startY: e.clientY,
      itemX: item.x,
      itemY: item.y,
      itemScale: item.scale,
      natW,
      natH,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragState.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.type === "move") {
      const nx = Math.min(92, Math.max(0, drag.itemX + (dx / rect.width) * 100));
      const ny = Math.min(92, Math.max(0, drag.itemY + (dy / rect.height) * 100));
      setItems((prev) =>
        prev.map((i) => (i.id === drag.id ? { ...i, x: nx, y: ny } : i))
      );
      return;
    }
    // Directional resize (Canva-style): the anchor edge stays put while the
    // item grows toward the pointer, so x/y are compensated for w/n/ne/nw.
    const dir = drag.type;
    const W = Math.max(1, drag.natW);
    const H = Math.max(1, drag.natH);
    const xPct = 100 / rect.width;
    const yPct = 100 / rect.height;
    let scale = drag.itemScale;
    let nx = drag.itemX;
    let ny = drag.itemY;
    switch (dir) {
      case "e":
        scale += dx / W;
        break;
      case "w":
        scale -= dx / W;
        nx = drag.itemX - W * (scale - drag.itemScale) * xPct;
        break;
      case "s":
        scale += dy / H;
        break;
      case "n":
        scale -= dy / H;
        ny = drag.itemY - H * (scale - drag.itemScale) * yPct;
        break;
      case "se":
        scale += Math.max(dx / W, dy / H);
        break;
      case "sw":
        scale += Math.max(-dx / W, dy / H);
        nx = drag.itemX - W * (scale - drag.itemScale) * xPct;
        break;
      case "ne":
        scale += Math.max(dx / W, -dy / H);
        ny = drag.itemY - H * (scale - drag.itemScale) * yPct;
        break;
      case "nw":
        scale += Math.max(-dx / W, -dy / H);
        nx = drag.itemX - W * (scale - drag.itemScale) * xPct;
        ny = drag.itemY - H * (scale - drag.itemScale) * yPct;
        break;
    }
    scale = Math.min(3, Math.max(0.4, scale));
    const ox = Math.min(92, Math.max(-20, nx));
    const oy = Math.min(92, Math.max(-20, ny));
    setItems((prev) =>
      prev.map((i) =>
        i.id === drag.id ? { ...i, scale, x: ox, y: oy } : i
      )
    );
  };

  const handlePointerUp = () => {
    dragState.current = null;
  };

  const handleExport = async () => {
    const el = canvasRef.current;
    if (!el) return;
    setExporting(true);
    setExportError(null);
    try {
      // Capture the canvas exactly as it is displayed so the download always
      // matches the edit, then scale the capture up to 4K (3840px on the
      // longest side) so the PNG is sharp enough to use as a wallpaper.
      // The items, text, and image scale together.
      const TARGET_LONG = 3840;
      const MAX_SCALE = 8;
      const longSide = Math.max(el.offsetWidth, el.offsetHeight);
      let scale: number;
      if (bgDims && bgSize) {
        // Start from the uploaded image's natural resolution, then bump the
        // scale up to 4K if the photo is smaller than 4K. Photos already
        // larger than 4K keep their full resolution (no downscaling).
        scale = bgDims.w / bgSize.w;
        const to4k = TARGET_LONG / Math.max(bgDims.w, bgDims.h);
        if (to4k > scale) scale = to4k;
      } else {
        scale = TARGET_LONG / longSide;
      }
      scale = Math.min(scale, MAX_SCALE);
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(el, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `schedly-design-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to export image");
    } finally {
      setExporting(false);
    }
  };

  const toggleTool = (tool: Tool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
    // A newly opened tool always shows its panel.
    setPanelHidden(false);
  };

  return (
    <div className="flex h-screen flex-col gap-3 p-3 md:grid md:h-auto md:grid-cols-[5rem_minmax(0,1fr)_15rem] md:grid-rows-[auto_1fr] md:gap-4 md:p-0">
      {/* Top bar — spans the full width on desktop */}
      <div className="flex shrink-0 items-center justify-between gap-2 md:col-span-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Back"
            className="text-foreground hover:bg-transparent hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">Design Editor</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Create your own schedule design
              </p>
            </div>
          </div>
        </div>
        <Button
          onClick={handleExport}
          disabled={exporting || items.length === 0}
          className="shrink-0 px-2.5 sm:px-4"
        >
          {exporting ? (
            <Spinner size={16} color="var(--primary-foreground)" className="sm:mr-2" />
          ) : (
            <Download className="h-4 w-4 sm:mr-2" />
          )}
          <span className="hidden sm:inline">{exporting ? "Exporting…" : "Download PNG"}</span>
        </Button>
      </div>

      {/* Tool rail — pinned above the scrollable canvas on mobile, so the
          tools are always visible; left column on desktop */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto md:col-start-1 md:row-start-2 md:w-20 md:flex-col md:gap-1 md:overflow-visible">
        <RailButton icon={Undo2} label="Undo" onClick={undo} disabled={undoStack.length === 0} />
        <RailButton icon={Redo2} label="Redo" onClick={redo} disabled={redoStack.length === 0} />
        <div className="hidden h-px w-full bg-border md:block" />
        <RailButton icon={Grid3x3} label="Classes" onClick={() => toggleTool("classes")} active={activeTool === "classes"} />
        <RailButton icon={Type} label="Text" onClick={() => toggleTool("text")} active={activeTool === "text"} />
        <RailButton icon={ImageIcon} label="Background" onClick={() => toggleTool("background")} active={activeTool === "background"} />
        <RailButton icon={Palette} label="Color" onClick={() => toggleTool("color")} active={activeTool === "color"} />
        <div className="hidden h-px w-full bg-border md:block" />
        <RailButton icon={Copy} label="Duplicate" onClick={duplicateItem} disabled={!selectedItem} />
        <RailButton icon={BringToFront} label="Front" onClick={bringForward} disabled={!selectedItem} />
        <RailButton icon={SendToBack} label="Back" onClick={sendBackward} disabled={!selectedItem} />
        <RailButton icon={Eraser} label="Clear" onClick={clearAll} disabled={items.length === 0} />
      </div>

      {/* Scrollable canvas area — the canvas itself scrolls on mobile while
          the top bar and tool rail stay put */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden md:col-start-2 md:row-start-2 md:flex-none md:flex-row md:items-start md:justify-center md:overflow-visible">
        {/* Canvas — the background image is displayed scaled to fit the
            screen (ratio preserved) but is exported at full size */}
        <div
          ref={canvasRef}
          onPointerDown={() => {
            setSelectedId(null);
            setPanelHidden(true);
          }}
          className={`relative overflow-hidden rounded-xl border border-border bg-white ${
            bgDims && bgSize
              ? "mx-auto flex-none"
              : "min-h-0 flex-1 w-full md:mx-auto md:aspect-[4/3] md:max-h-[70vh] md:max-w-3xl"
          }`}
          style={bgDims && bgSize ? { width: `${bgSize.w}px`, height: `${bgSize.h}px` } : undefined}
        >
          {backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backgroundUrl}
              alt="Schedule design background"
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
          )}

          {!backgroundUrl && items.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
              <Palette className="h-8 w-8 opacity-60" />
              <p className="text-sm">
                Your design is empty.
                <br />
                Add classes, text, or a photo background from the tools.
              </p>
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              onPointerDown={(e) => handlePointerDown(e, item.id, "move")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`absolute cursor-move touch-none select-none rounded-lg px-3 py-1.5 ${
                item.color === "transparent"
                  ? "border border-black/10 text-slate-800"
                  : "text-white shadow-lg"
              }`}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: `scale(${item.scale})`,
                transformOrigin: "top left",
                backgroundColor: item.color === "transparent" ? undefined : item.color,
                // "Transparent" color = glossy glass: translucent white gradient
                // with a bright inner highlight so it reads as shiny glass over
                // any background photo. (The timetable item handles its own
                // glass background instead.)
                ...(item.color === "transparent" && !item.table
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.85) 100%)",
                      border: "1px solid rgba(255,255,255,0.9)",
                      boxShadow:
                        "0 1px 4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 2px rgba(255,255,255,0.4)",
                    }
                  : {}),
                zIndex: item.z,
                outline: selectedId === item.id
                  ? "2px solid hsl(var(--primary))"
                  : undefined,
                outlineOffset: 2,
              }}
            >
              {item.table ? (
                <div
                  className="w-full min-w-[260px] rounded-xl overflow-hidden"
                  style={{
                    // Transparent color = clear glass: transparent panel with
                    // backdrop blur. A picked color switches to a frosted tint.
                    backgroundColor:
                      item.color && item.color !== "transparent"
                        ? bgDark
                          ? "rgba(10,10,10,0.62)"
                          : "rgba(255,255,255,0.82)"
                        : "transparent",
                    backdropFilter: "blur(8px) saturate(150%)",
                    border: item.color && item.color !== "transparent"
                      ? `2px solid ${item.color}`
                      : "none",
                  }}
                >
                  <div
                    className="grid px-1 pb-1 pt-1"
                    style={{
                      gridTemplateColumns: `repeat(${item.table!.days.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {item.table!.days.map((d, di) => (
                      <div
                        key={d}
                        className="px-1 py-1.5 text-center text-[10px] font-semibold"
                        style={{
                          color: bgDark ? "#ffffff" : "#1a1416",
                          borderLeft: di > 0 ? `1px solid ${tableLine}` : undefined,
                          borderBottom: `1px solid ${tableLine}`,
                        }}
                      >
                        {d}
                      </div>
                    ))}
                    {item.table!.rows.map((row, ri) => (
                      <Fragment key={ri}>
                        {row.cells.map((cell, ci) => (
                          <div
                            key={ci}
                            className="min-h-[38px] p-0.5"
                            style={{
                              borderLeft: ci > 0 ? `1px solid ${tableLine}` : undefined,
                              borderTop: ri > 0 ? `1px solid ${tableLine}` : undefined,
                            }}
                          >
                            {cell.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {cell.map((e, ei) => (
                                  <div
                                    key={ei}
                                    className="rounded-md px-1.5 py-1 text-center text-white"
                                    style={{
                                      backgroundColor: e.color,
                                      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                                    }}
                                  >
                                    <div className="text-[10px] font-semibold leading-tight break-words">
                                      {e.subject}
                                    </div>
                                    <div className="mt-0.5 text-[9px] leading-tight opacity-80">
                                      {e.time}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="h-full min-h-[38px]" />
                            )}
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold leading-tight">{item.label}</div>
                  {item.sub && <div className="text-[10px] font-medium leading-tight opacity-90">{item.sub}</div>}
                </>
              )}
              {selectedId === item.id && (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeItem(item.id)}
                    className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                    aria-label={`Remove ${item.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  {(
                    [
                      ["n", "absolute -top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize"],
                      ["s", "absolute -bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize"],
                      ["e", "absolute -right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"],
                      ["w", "absolute -left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"],
                      ["se", "absolute -bottom-1.5 -right-1.5 cursor-nwse-resize"],
                    ] as [ResizeDir, string][]
                  ).map(([dir, pos]) => (
                    <div
                      key={dir}
                      onPointerDown={(e) => handlePointerDown(e, item.id, dir)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      className={`absolute z-10 flex h-3.5 w-3.5 touch-none items-center justify-center rounded-full border border-slate-400 bg-white shadow-sm ${pos}`}
                      aria-label={`Resize ${dir}`}
                    />
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Side panel — bottom sheet on mobile, right column on desktop */}
      {activeTool && !panelHidden && (
        <div className="fixed inset-x-0 bottom-0 z-20 max-h-[45dvh] w-full shrink-0 space-y-4 overflow-y-auto rounded-t-2xl border border-border border-b-0 bg-card p-3.5 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:inset-auto md:col-start-3 md:row-start-2 md:max-h-none md:w-64 md:self-start md:rounded-xl md:border-b md:shadow-none md:overflow-visible md:pb-4">
            {activeTool === "classes" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Your Classes</h3>
                  <div className="flex items-center gap-2">
                    {classes.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {addedIds.size} / {classes.length} added
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs hover:bg-transparent hover:text-primary"
                      onClick={addAllClasses}
                      disabled={classes.length === 0 || hasTimetable}
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Select All
                    </Button>
                  </div>
                </div>
                {classes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {classes.map((cls, i) => {
                      const added = addedIds.has(String(i));
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={added}
                          onClick={() => addItem(i)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all min-w-[120px] ${
                            added
                              ? "bg-muted text-muted-foreground/60 cursor-default"
                              : "bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30"
                          }`}
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          <span className="truncate">{cls.shortName || cls.subject}</span>
                          {added && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-6 text-center border-2 border-dashed border-border/50 rounded-xl">
                    <Palette className="h-6 w-6 opacity-40" />
                    <p className="text-sm text-muted-foreground">No classes extracted yet</p>
                    <p className="text-[11px] text-muted-foreground/70">Go to Review to extract from photo</p>
                  </div>
                )}
              </div>
            )}

            {activeTool === "text" && (
              <>
                <h3 className="text-sm font-semibold text-foreground">Add Text</h3>
                <TextField
                  label="Text"
                  className="mb-1"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTextItem();
                  }}
                />
                <Button size="sm" className="w-full" onClick={addTextItem} disabled={!textInput.trim()}>
                  <Type className="mr-1 h-3 w-3" /> Add Text
                </Button>
              </>
            )}

            {activeTool === "background" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Background</h3>
                {/* Actions first so the buttons are always visible even if the
                    preview is large */}
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => bgInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" /> Upload photo
                  </Button>
                  {imageUrl && backgroundUrl !== imageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setBackgroundUrl(imageUrl);
                        loadBgDims(imageUrl);
                        setActiveTool(null);
                      }}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" /> Use schedule photo
                    </Button>
                  )}
                  {backgroundUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive hover:bg-transparent"
                      onClick={() => {
                        setBackgroundUrl(null);
                        bgDimsRef.current = null;
                        setBgDims(null);
                        setBgSize(null);
                      }}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Remove background
                    </Button>
                  )}
                  {!backgroundUrl && !imageUrl && (
                    <p className="text-[11px] text-center text-muted-foreground/60 pt-1">
                      No background set — canvas uses solid white
                    </p>
                  )}
                </div>
                {/* Current background preview — shows the whole image */}
                {(backgroundUrl || imageUrl) && (
                  <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted/40 md:h-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backgroundUrl || imageUrl!}
                      alt="Current background"
                      className="h-full w-full object-contain"
                    />
                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] text-white/90">
                      <span className="rounded bg-black/40 px-1.5 py-0.5 truncate max-w-[160px]">
                        {backgroundUrl === imageUrl ? "Schedule photo" : "Custom upload"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTool === "color" && (
              <>
                <p className="text-xs font-medium text-muted-foreground">Item color</p>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => applyColor(color)}
                      aria-label={`Use color ${color}`}
                      className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                        selectedItem?.color === color
                          ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => applyColor("transparent")}
                    aria-label="Use transparent color"
                    title="Transparent"
                    className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                      selectedItem?.color === "transparent"
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                        : ""
                    }`}
                    style={{
                      background:
                        "conic-gradient(rgba(0,0,0,0.18) 25%, transparent 0 50%, rgba(0,0,0,0.18) 0 75%, transparent 0)",
                      backgroundSize: "12px 12px",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>
                {!selectedItem && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Select an item on the canvas to change its color.
                  </p>
                )}
              </>
            )}
          </div>
        )}

      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBackgroundChange}
      />

      {/* Mobile: floating button to hide/show the tool panel */}
      {activeTool && (
        <button
          type="button"
          onClick={() => setPanelHidden((h) => !h)}
          className={`fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-all active:scale-95 md:hidden ${
            panelHidden ? "bottom-6" : "bottom-[calc(45dvh+0.75rem)]"
          }`}
          aria-label={panelHidden ? "Show panel" : "Hide panel"}
          style={{ marginBottom: "var(--sab, 0px)" }}
        >
          {panelHidden ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
      )}

      {exportError && <p className="text-sm text-red-500">{exportError}</p>}
    </div>
  );
}
