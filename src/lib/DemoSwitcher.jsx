import React, { useState } from "react";
import { demoApi } from "./demo.js";

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
      <select
        value={role}
        onChange={(e) => { setRole(e.target.value); demoApi.setRole(e.target.value); }}
        className="text-xs font-semibold rounded-full bg-white text-violet-700 px-2 py-1 outline-none cursor-pointer"
      >
        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
