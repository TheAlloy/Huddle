// Small shared pieces for the timesheet-lab variations.
import React, { useState, useEffect } from "react";
import { fmtH } from "../../studio/core.jsx";
import { parseHours } from "../tracker/shared.jsx";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

export function NoteButton({ note, onSave, revealOnHover = true }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(note || "");
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setVal(note || ""); }}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" title={note || "Add note"} className={note || !revealOnHover ? "" : "opacity-0 group-hover:opacity-100"} />}><NotebookPen /></PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="flex items-center gap-2">
          <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="What was this time?"
            onKeyDown={(e) => { if (e.key === "Enter") { onSave(val.trim() || null); setOpen(false); } }} />
          <Button onClick={() => { onSave(val.trim() || null); setOpen(false); }}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
