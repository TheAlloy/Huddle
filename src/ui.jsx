import React from "react";
import { NAVY, AVATAR_BG, inputCls, textareaCls, initials } from "./studio/core.jsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar as AvatarRoot, AvatarFallback } from "@/components/ui/avatar";

// Shared constants live in studio/core.jsx (CLAUDE.md); re-exported here so the
// screens that import them from ui.jsx keep working unchanged. They used to be
// defined in both files and had drifted — see docs/foundations-plan.md, step 3.
export { NAVY, AVATAR_BG, inputCls, textareaCls, initials };

export function Field({label, hint, error, children}){
  return (<label className="block mb-3">
    <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
    {children}
    {error
      ? <span className="block text-xs text-destructive mt-1">{error}</span>
      : hint && <span className="block text-xs text-muted-foreground/70 mt-1">{hint}</span>}
  </label>);
}

// Thin wrapper over the shadcn Button so all screens pick up its styling
// without changing their Btn calls. The old variant names map onto shadcn's;
// "dark" (was an inline NAVY background) becomes secondary.
const BTN_VARIANT = { primary:"default", dark:"secondary", ghost:"ghost", outline:"outline", danger:"destructive" };
export function Btn({children, variant="primary", className="", ...rest}){
  return <Button variant={BTN_VARIANT[variant]||"default"} className={className} {...rest}>{children}</Button>;
}

export function Card({title, action, children, className=""}){
  return (<div className={`bg-card text-card-foreground border rounded-xl shadow-xs ${className}`}>
    {(title||action) && <div className="flex items-center gap-2 px-4 py-3 border-b">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="ml-auto">{action}</div>
    </div>}
    <div className="p-4">{children}</div>
  </div>);
}

// Same API as before (mount to open), rebuilt on the shadcn Dialog for the
// focus trap, Escape handling and aria labelling the old overlay never had.
// The built-in top-right close button replaces the old header X.
export function Modal({title, onClose, children, footer, wide}){
  return (<Dialog open onOpenChange={(o)=>{ if(!o) onClose?.(); }}>
    <DialogContent className={`p-0 gap-0 max-h-[90vh] flex flex-col text-base ${wide?"sm:max-w-3xl":"sm:max-w-lg"}`}>
      <DialogHeader className="px-5 py-3.5 border-b">
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="p-5 overflow-y-auto">{children}</div>
      {footer && <DialogFooter className="mx-0 mb-0 px-5 py-3">{footer}</DialogFooter>}
    </DialogContent>
  </Dialog>);
}

// shadcn Avatar under the hood; same {name, i, size} API. The indexed palette
// stays — it is data color (member identity), not chrome.
export function Avatar({name, i=0, size=28}){
  return (<AvatarRoot style={{width:size, height:size}}>
    <AvatarFallback className="text-white font-bold" style={{background:AVATAR_BG[i%AVATAR_BG.length], fontSize:size*0.4}}>{initials(name)}</AvatarFallback>
  </AvatarRoot>);
}

export function Pill({children, color="#94a3b8"}){
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{background:color+"22", color}}>{children}</span>;
}

export function Empty({title, children}){
  return (<div className="text-center py-12 px-4">
    <div className="font-medium mb-1">{title}</div>
    <div className="text-sm text-muted-foreground max-w-md mx-auto">{children}</div>
  </div>);
}

export function Spinner({label="Loading…"}){
  return (<div className="h-full grid place-items-center text-muted-foreground text-sm">
    <div className="text-center">
      <div className="w-6 h-6 border-2 border-muted border-t-muted-foreground rounded-full animate-spin mx-auto mb-2"/>
      {label}
    </div>
  </div>);
}
