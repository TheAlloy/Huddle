// Connection / sync state in the header (offline.js does the work). Hidden
// while online with nothing waiting; otherwise a small button —
// "Offline · 3 waiting", "Syncing…", "All changes synced", or "1 needs
// attention" — that opens the detail, including any change the server
// refused or that clashed with someone else's edit made in the meantime.
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { offline, fmtDay } from "../lib/offline.js";
import { CloudOff, CloudCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const show = (v) => (v == null || v === "" ? "empty" : typeof v === "object" ? "edited" : String(fmtDay(v)));
const label = (f) => f.replace(/_id$/, "").replace(/_/g, " ");

export default function SyncStatus() {
  const st = useSyncExternalStore(offline.subscribe, offline.getState);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  // "All changes synced" shows for a few seconds after an upload finishes.
  useEffect(() => { if (!st.justSynced) return; const t = setTimeout(() => tick((x) => x + 1), 4200); return () => clearTimeout(t); }, [st.justSynced]);

  const issues = st.issues.length;
  const synced = st.online && !st.pending && !issues && Date.now() - st.justSynced < 4000;
  if (st.online && !st.pending && !issues && !synced && !open) return null;

  const chip = issues
    ? { variant: "destructive", icon: <TriangleAlert data-icon="inline-start" />, text: `${issues} ${issues === 1 ? "change needs" : "changes need"} attention` }
    : !st.online
      ? { variant: "outline", icon: <CloudOff data-icon="inline-start" />, text: st.pending ? `Offline · ${st.pending} waiting` : "Offline" }
      : st.pending
        ? { variant: "ghost", icon: <RefreshCw data-icon="inline-start" className="animate-spin" />, text: `Syncing ${st.pending}…` }
        : { variant: "ghost", icon: <CloudCheck data-icon="inline-start" />, text: "All changes synced" };

  return (
    <>
      <Button variant={chip.variant} size="sm" onClick={() => setOpen(true)}>{chip.icon}{chip.text}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{!st.online ? "You're offline" : issues ? "Changes that need attention" : st.pending ? "Uploading your changes" : "All changes synced"}</DialogTitle>
            <DialogDescription>
              {!st.online
                ? "Huddle keeps working. Everything you do is saved on this computer and uploads automatically when you're back online."
                : issues ? "These couldn't be uploaded as they were. Nothing has been lost — choose what to do with each."
                : st.pending ? "You're back online — your changes are uploading now."
                : "Everything you did offline is now saved."}
            </DialogDescription>
          </DialogHeader>

          {st.pending > 0 && <p className="text-sm">{st.pending} {st.pending === 1 ? "change" : "changes"} waiting to upload.</p>}

          {st.issues.map((it) => {
            const d = offline.describe(it);
            return (
              <div key={it.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="text-sm font-medium">{d.title}{d.label ? <span className="font-normal text-muted-foreground"> · {d.label}</span> : null}</div>
                {it.kind === "clash" && <>
                  <p className="text-sm text-muted-foreground">Someone else changed this while you were offline.</p>
                  <div className="flex flex-col gap-1 text-sm">
                    {it.clashes.map((c, i) => (
                      <div key={i}><span className="font-medium capitalize">{label(c.field)}</span> — theirs: {show(c.theirs)} · yours: {show(c.mine)}</div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => offline.discardIssue(it.id)}>Keep theirs</Button>
                    <Button size="sm" onClick={() => offline.keepMine(it.id)}>Keep mine</Button>
                  </div>
                </>}
                {it.kind === "failed" && <>
                  <p className="text-sm text-muted-foreground">The server refused this change: {it.error}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => offline.discardIssue(it.id)}>Discard</Button>
                    <Button size="sm" onClick={() => offline.retryIssue(it.id)}>Try again</Button>
                  </div>
                </>}
                {it.kind === "gone" && <>
                  <p className="text-sm text-muted-foreground">Someone deleted this while you were offline, so your change couldn't be applied.</p>
                  <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => offline.discardIssue(it.id)}>OK</Button></div>
                </>}
              </div>
            );
          })}

          <DialogFooter>
            {(!st.online || st.pending > 0) && <Button variant="outline" onClick={() => offline.syncNow()}><RefreshCw data-icon="inline-start" /> Try now</Button>}
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
