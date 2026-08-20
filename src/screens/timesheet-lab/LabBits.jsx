// Small shared pieces for the timesheet-lab variations. Notes are deliberately
// absent from the lab variants — deferred as a future feature.
import React, { useState, useEffect } from "react";
import { fmtH } from "../../studio/core.jsx";
import { parseHours, projectPickItems } from "../tracker/shared.jsx";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
