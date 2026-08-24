// Small shared pieces for the timesheet-lab variations. Notes are deliberately
// absent from the lab variants — deferred as a future feature.
import React, { useState, useEffect } from "react";
import { fmtH } from "../../studio/core.jsx";
import { parseHours, projectPickItems } from "../tracker/shared.jsx";
import { Plus, Minus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";

/* Stock-Input duration field: commits on Enter (empty input on a suggested
   cell accepts the suggestion), Escape reverts. */
export function HoursField({ mins, ghostMins, onCommit, className = "flex-1 tabular-nums" }) {
  const shown = mins != null ? fmtH(mins / 60) : "";
  const [val, setVal] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setVal(shown); }, [shown, focus]); // eslint-disable-line
  const commit = () => {
    const t = String(val).trim();
    if (t === "" && mins == null && ghostMins != null) { onCommit(ghostMins); return; }
    if (t === "") return;
    const m = parseHours(t);
    if (m != null) onCommit(m);
  };
  return (
    <Input value={val} onChange={(e) => setVal(e.target.value)}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setVal(shown); }}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } if (e.key === "Escape") { setVal(shown); e.currentTarget.blur(); } }}
      placeholder={ghostMins != null ? fmtH(ghostMins / 60) : ""}
      className={className}
      aria-label="Hours" />
  );
}

/* V3.1's centered hours cell, composed from the stock InputGroup anatomy:
   - suggested state shows the planned hours as centered muted placeholder,
     and hovering the box reveals a ✓ inside the input that logs them;
   - clicking in selects everything (no double-click), and while focused
     ghost −/+ steppers appear on either side (30-minute steps);
   - Enter or blur commits a changed value, Escape reverts, empty-Enter on a
     suggested cell accepts the suggestion. */
// Clock-style display and parsing for the fancy field: "2:15" = 2h15m,
// "2:30" = 2h30m, whole hours show bare ("2"). A single digit after the
// separator reads as tens ("2:3" = 2h30m, clock shorthand). "." is accepted
// as a typing convenience and normalised to ":".
const fmtHM = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}:${String(m).padStart(2, "0")}` : String(h); };
// Duration in the same clock notation for labels/totals: whole hours keep
// the unit ("3h"), partial hours read as clock ("2:30").
export const fmtClockDur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}h`; };
const parseClock = (t) => {
  const s = String(t).trim().replace(".", ":");
  if (s === "") return null;
  if (!/^\d*(:\d*)?$/.test(s)) return null;
  const [h, mm = ""] = s.split(":");
  const mins = mm === "" ? 0 : Math.min(59, mm.length === 1 ? Number(mm) * 10 : Number(mm.slice(0, 2)));
  const total = Number(h || 0) * 60 + mins;
  return Number.isFinite(total) ? total : null;
};

export function HoursFieldFancy({ mins, ghostMins, onCommit }) {
  const shown = mins != null ? fmtHM(mins) : "";
  const [val, setVal] = useState(shown);
  const [focus, setFocus] = useState(false);
  const elRef = React.useRef(null);
  const stepRef = React.useRef(null);
  // Enter/Escape settle the field themselves before blurring — the blur
  // handler must not commit again (double log) or resurrect an escaped value.
  const settledRef = React.useRef(false);
  useEffect(() => { if (!focus) setVal(shown); }, [shown, focus]); // eslint-disable-line
  const parse = () => parseClock(val);
  const commitIfChanged = () => { const m = parse(); if (m != null && m !== (mins ?? -1)) onCommit(m); };
  // 15-minute steps matching the calendar's drag snap, landing on the
  // quarter grid from any typed value: up from 3.10 → 3.15, down → 3.00.
  const step = (d) => {
    const base = parse() ?? mins ?? ghostMins ?? 0;
    const next = d > 0 ? Math.floor(base / 15) * 15 + 15 : Math.ceil(base / 15) * 15 - 15;
    setVal(fmtHM(Math.max(0, next)));
  };
  stepRef.current = step;
  // Scrolling on the focused input steps the value (native non-passive
  // listener — React's synthetic wheel can't preventDefault the page scroll).
  useEffect(() => {
    const el = elRef.current;
    if (!el || !focus) return;
    const onWheel = (e) => { e.preventDefault(); stepRef.current(e.deltaY < 0 ? 1 : -1); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [focus]);
  const suggested = mins == null && ghostMins != null;
  // Both addons render whenever either could — with invisible same-size
  // stand-ins — so the centered numeral never shifts between states.
  return (
    <InputGroup className="group/hours w-full">
      {(focus || suggested) && (
        <InputGroupAddon>
          {focus
            ? <InputGroupButton size="icon-xs" variant="ghost" aria-label="15 minutes less"
                onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)}><Minus /></InputGroupButton>
            : <InputGroupButton size="icon-xs" variant="ghost" className="invisible" tabIndex={-1} aria-hidden><Minus /></InputGroupButton>}
        </InputGroupAddon>
      )}
      <InputGroupInput value={val} onChange={(e) => setVal(e.target.value)}
        onFocus={(e) => { elRef.current = e.currentTarget; setFocus(true); e.target.select(); }}
        onBlur={() => { setFocus(false); if (!settledRef.current) commitIfChanged(); settledRef.current = false; }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const t = String(val).trim();
            if (t === "" && mins == null && ghostMins != null) onCommit(ghostMins); else commitIfChanged();
            settledRef.current = true;
            e.currentTarget.blur();
          }
          if (e.key === "Escape") { setVal(shown); settledRef.current = true; e.currentTarget.blur(); }
        }}
        placeholder={ghostMins != null ? fmtHM(ghostMins) : ""}
        className="text-center tabular-nums"
        aria-label="Hours" />
      {(focus || suggested) && (
        <InputGroupAddon align="inline-end">
          {focus
            ? <InputGroupButton size="icon-xs" variant="ghost" aria-label="15 minutes more"
                onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)}><Plus /></InputGroupButton>
            : <InputGroupButton size="icon-xs" variant="ghost" className="opacity-0 group-hover/hours:opacity-100" aria-label={"Log " + fmtH(ghostMins / 60) + "h (planned)"}
                onClick={() => onCommit(ghostMins)}><Check /></InputGroupButton>}
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/* The shadcn combobox docs' Popup pattern: a Button trigger whose dropdown
   contains the search input (ComboboxInput moved inside ComboboxContent). */
export function AddProjectPopup({ groups, recents, onPick, className = "w-full" }) {
  const items = projectPickItems(groups, recents);
  return (
    <Combobox items={items} value={null} itemToStringValue={(i) => i.label}
      onValueChange={(it) => { if (it) onPick({ projectId: it.projectId, phaseId: it.phaseId }); }}>
      <ComboboxTrigger render={<Button variant="outline" className={`${className} justify-between font-normal text-muted-foreground`} />}>
        <span className="flex items-center gap-1.5"><Plus data-icon="inline-start" /> Add project</span>
      </ComboboxTrigger>
      <ComboboxContent className="min-w-72">
        <ComboboxInput placeholder="Search projects…" showTrigger={false} autoFocus />
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => <ComboboxItem key={item.key} value={item}>{item.label}</ComboboxItem>}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
