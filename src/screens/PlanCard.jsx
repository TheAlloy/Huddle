import React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";


export function priceText(p) {
  if (p.amount == null) return "";
  if (p.amount === 0) return "Free";
  const sym = p.currency === "GBP" ? "£" : p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : p.currency + " ";
  const n = Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2);
  return `${sym}${n}`;
}
export function perInterval(p) { return p.interval === "year" ? "/yr" : p.interval === "week" ? "/wk" : "/mo"; }
export function seatsText(p) {
  if (p.seats == null) return "Unlimited team members";
  return `Up to ${p.seats} team member${p.seats === 1 ? "" : "s"}`;
}
function trialLabel(days) {
  if (days >= 28 && days <= 31) return "1-month";
  if (days % 7 === 0) return `${days / 7}-week`;
  return `${days}-day`;
}

export function PlanCard({ plan, current, onChoose, busy, ctaLabel = "Subscribe" }) {
  const price = priceText(plan);
  const per = perInterval(plan);
  const isTrial = plan.trialDays > 0;
  return (
    <Card className={current ? "border-primary bg-primary/10" : undefined}>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        {plan.description && <CardDescription>{plan.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {isTrial ? (
          <>
            <div className="text-2xl font-semibold text-foreground">Free <span className="text-sm font-normal text-muted-foreground line-through">{price}{per}</span></div>
            <div className="text-xs text-muted-foreground">{trialLabel(plan.trialDays)} free trial, then {price}{per}</div>
          </>
        ) : (
          <div className="text-2xl font-semibold text-foreground">{price || "Free"}<span className="text-xs font-normal text-muted-foreground">{plan.amount ? per : ""}</span></div>
        )}
        <div className="text-xs text-muted-foreground mt-1">{seatsText(plan)}</div>
      </CardContent>
      <CardFooter className="mt-auto">
        {current
          ? <Button variant="secondary" className="w-full" disabled><Check data-icon="inline-start" /> Current plan</Button>
          : <Button className="w-full" onClick={() => onChoose(plan.priceId)} disabled={busy}>{isTrial ? "Start free trial" : ctaLabel}</Button>}
      </CardFooter>
    </Card>
  );
}
