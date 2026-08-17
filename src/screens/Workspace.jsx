import React from "react";
import { Card, Avatar } from "../ui.jsx";
import { Lock } from "lucide-react";

/** Shown wherever someone's permissions don't allow a screen. */
export function NoAccess({ what }) {
  return (<div className="h-full grid place-items-center p-6">
    <div className="text-center max-w-sm">
      <Lock size={28} className="mx-auto text-muted-foreground mb-3" />
      <div className="font-medium mb-1">You don't have access to {what}</div>
      <p className="text-sm text-muted-foreground">Ask an owner or administrator in your studio to give you access on the People page.</p>
    </div>
  </div>);
}

/* ── People directory (read-only view for those without team.manage) ──────── */
export function TeamLite({ members }) {
  return (<div className="p-4 overflow-y-auto h-full">
    <Card title="Your team">
      <div className="flex flex-col">
        {members.map((m, i) => (<div key={m.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0">
          <Avatar name={m.display_name || m.email} i={i} />
          <div><div>{m.display_name || m.email}</div><div className="text-xs text-muted-foreground">{m.job_title || m.role}</div></div>
        </div>))}
      </div>
    </Card>
  </div>);
}
