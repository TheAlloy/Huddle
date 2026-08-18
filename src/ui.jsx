import React from "react";
import { NAVY, AVATAR_BG, initials } from "./studio/core.jsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field as FieldRoot, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Card as CardRoot, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty as EmptyRoot, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Spinner as SpinnerIcon } from "@/components/ui/spinner";

export { NAVY, AVATAR_BG, initials };

/*
 * Content-pouring shims ONLY. Each renders the stock shadcn anatomy untouched —
 * our side supplies content (labels, options, data colors), never styling.
 * If something here needs a visual override, it does not belong here: change
 * the call site to compose the stock components directly instead.
 * (docs/foundations-plan.md — component adoption rules.)
 */

export function Field({label, hint, error, children}){
  return (<FieldRoot data-invalid={error ? true : undefined}>
    <FieldLabel>{label}</FieldLabel>
    {children}
    {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
  </FieldRoot>);
}

export function Card({title, action, children, className}){
  return (<CardRoot className={className}>
    {(title||action) && <CardHeader>
      {title && <CardTitle>{title}</CardTitle>}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>}
    <CardContent>{children}</CardContent>
  </CardRoot>);
}

// Same mount-to-open API the screens already use; anatomy is the stock Dialog
// (built-in close button, stock header/footer spacing).
export function Modal({title, onClose, children, footer, wide}){
  // Scrolling lives on DialogContent (like ModalShell) so its stock padding
  // gives focus rings room — an unpadded scroll wrapper clips them.
  return (<Dialog open onOpenChange={(o)=>{ if(!o) onClose?.(); }}>
    <DialogContent className={`${wide?"sm:max-w-3xl":"sm:max-w-lg"} max-h-[90svh] overflow-y-auto`}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      {children}
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </DialogContent>
  </Dialog>);
}

// Stock Badge; color is data (status, role, priority).
export function Pill({children, color="#94a3b8"}){
  return <Badge style={{background:color+"22", color}}>{children}</Badge>;
}

export function Empty({title, children}){
  return (<EmptyRoot>
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      {children && <EmptyDescription>{children}</EmptyDescription>}
    </EmptyHeader>
  </EmptyRoot>);
}

export function Spinner({label="Loading…"}){
  return (<div className="h-full grid place-items-center">
    <div className="flex items-center gap-2 text-sm text-muted-foreground"><SpinnerIcon /> {label}</div>
  </div>);
}
