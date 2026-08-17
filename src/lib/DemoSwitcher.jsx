import React, { useState } from "react";
import { demoApi } from "./demo.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Demo-only floating role switcher (bottom-right). Lets you view the app as
// any role without signing out — for testing what each permission level sees.
const ROLES = [
  ["owner", "Owner"], ["admin", "Administrator"], ["manager", "Manager"],
  ["finance", "Finance"], ["member", "Team member"], ["tracker", "Time tracking only"], ["viewer", "Viewer"],
];

export default function DemoSwitcher() {
  const [role, setRole] = useState(() => (demoApi ? demoApi.getRole() : "owner"));
  if (!demoApi) return null;
  return (
    <div className="fixed bottom-3 right-3 z-[60] flex items-center gap-2 bg-violet-600 text-white rounded-full shadow-lg pl-3.5 pr-2 py-1.5 text-xs font-semibold">
      <span>Demo · viewing as</span>
      <Select value={role} onValueChange={(v) => { setRole(v); demoApi.setRole(v); }} items={Object.fromEntries(ROLES)}>
        <SelectTrigger size="sm" className="w-44"><SelectValue/></SelectTrigger>
        <SelectContent><SelectGroup>{ROLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </div>
  );
}
