import React from "react";
import { Btn } from "../ui.jsx";

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

export function PlanCard({ plan, current, onChoose, busy, ctaLabel = "Subscribe", dark = false }) {
  const price = priceText(plan);
  const per = perInterval(plan);
  const isTrial = plan.trialDays > 0;
  return (
    <div className={`rounded-xl border p-4 flex flex-col ${current ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
      <div className="font-semibold text-slate-800">{plan.name}</div>
      {isTrial ? (
        <>
          <div className="text-2xl font-bold text-slate-800">Free <span className="text-sm font-normal text-slate-400 line-through">{price}{per}</span></div>
          <div className="text-[11px] text-emerald-700 font-medium">{trialLabel(plan.trialDays)} free trial, then {price}{per}</div>
        </>
      ) : (
        <div className="text-2xl font-bold text-slate-800">{price || "Free"}<span className="text-xs font-normal text-slate-400">{plan.amount ? per : ""}</span></div>
      )}
      {plan.description && <div className="text-[11px] text-slate-500 my-1 leading-snug">{plan.description}</div>}
      <div className="text-[11px] text-slate-400 mt-1 mb-1.5">{seatsText(plan)}</div>
      <div className="mt-auto pt-3">
        {current
          ? <span className="inline-flex items-center justify-center w-full gap-1.5 text-xs font-semibold text-blue-700 bg-blue-100 rounded-lg py-2">✓ Current plan</span>
          : <Btn variant={dark ? "dark" : undefined} className="w-full justify-center" onClick={() => onChoose(plan.priceId)} disabled={busy}>{isTrial ? "Start free trial" : ctaLabel}</Btn>}
      </div>
    </div>
  );
}
