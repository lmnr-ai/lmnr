"use client";

// TEMPORARY icon-library prototyping control — switches every app icon live.
// Safe to delete with the rest of style-explorer + the components/ui/icon-lib folder.

import { Button } from "@/components/ui/button";
import {
  Bell,
  Check,
  ChevronDown,
  Filter,
  Play,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  User,
  X,
} from "@/components/ui/icon-lib";
import {
  DEFAULT_ICON_STROKE,
  ICON_LIBS,
  type IconLib,
  setIconLib,
  setIconStroke,
  useIconLib,
  useIconStroke,
} from "@/components/ui/icon-lib/store";

const LABELS: Record<IconLib, string> = {
  lucide: "Lucide",
  tabler: "Tabler",
  phosphor: "Phosphor",
  hugeicons: "HugeIcons",
  remix: "Remix",
};

const PREVIEW = [Check, X, ChevronDown, Search, Settings, Trash2, Plus, Play, Star, Bell, User, Filter];

export default function IconsTab() {
  const lib = useIconLib();
  const stroke = useIconStroke();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        {ICON_LIBS.map((l) => (
          <Button key={l} variant="ghost" isActive={lib === l} onClick={() => setIconLib(l)} className="justify-start">
            {LABELS[l]}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="icon-stroke" className="text-xs text-muted-foreground">
          Stroke
        </label>
        <input
          id="icon-stroke"
          type="range"
          min={0.5}
          max={3}
          step={0.25}
          value={stroke}
          onChange={(e) => setIconStroke(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-8 text-right text-xs tabular-nums text-foreground">{stroke}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIconStroke(DEFAULT_ICON_STROKE)}
          className="text-xs text-muted-foreground"
        >
          Reset
        </Button>
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-2 text-xs text-muted-foreground">Preview — {LABELS[lib]}</div>
        <div className="grid grid-cols-6 gap-3">
          {PREVIEW.map((Ico, i) => (
            <div key={i} className="flex items-center justify-center text-foreground">
              <Ico className="size-5" />
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Switches every icon in the app live. Non-Lucide libraries render from hand-verified maps; an icon with no
        mapping shows a dashed box. Stroke maps to width for Lucide/Tabler/HugeIcons and to the nearest weight for
        Phosphor; Remix has fixed-weight glyphs.
      </p>
    </div>
  );
}
