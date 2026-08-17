import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { Field, Modal } from "../ui.jsx";
import { Gift, Check } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const USES = ["Scheduling / capacity planning", "Time tracking", "Billing & invoicing", "Task management", "Client / project management", "Internal team planning", "Something else"];

function Scale({ value, onChange, max = 5, low, high }) {
  return (<div>
    <div className="flex gap-1.5">
      {Array.from({ length: max }, (_, i) => i + (max === 11 ? 0 : 1)).map(n => (
        <button key={n} onClick={() => onChange(n)} type="button"
          className={`w-8 h-8 rounded-lg text-xs font-semibold border ${value === n ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:bg-muted/50"}`}>{n}</button>
      ))}
    </div>
    {(low || high) && <div className="flex justify-between text-[10px] text-muted-foreground/70 mt-1"><span>{low}</span><span>{high}</span></div>}
  </div>);
}

export default function FeedbackModal({ org, me, onClose }) {
  const [a, setA] = useState({
    uses: [], teamSize: "", frequency: "", onboarding: 0, onboardingText: "",
    inviting: 0, invitingText: "", biggestChange: "", features: "", fit: 0,
    customise: "", almostLeft: "", dailyUse: "", nps: null, anythingElse: "",
    email: me?.email || "",
  });
  const set = (k, v) => setA(p => ({ ...p, [k]: v }));
  const toggleUse = (u) => setA(p => ({ ...p, uses: p.uses.includes(u) ? p.uses.filter(x => x !== u) : [...p.uses, u] }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const filled = (s) => String(s ?? "").trim().length > 0;
  const canSubmit = a.uses.length > 0 && filled(a.teamSize) && filled(a.frequency)
    && a.onboarding > 0 && filled(a.onboardingText) && a.inviting > 0 && filled(a.invitingText)
    && filled(a.biggestChange) && filled(a.features) && a.fit > 0 && filled(a.customise)
    && filled(a.almostLeft) && filled(a.dailyUse) && a.nps != null && filled(a.anythingElse) && filled(a.email);

  const submit = async () => {
    if (!canSubmit) { setErr("Please answer every question — the free month is for complete, thoughtful feedback."); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await sb.from("feedback").insert({ org_id: org.id, user_id: me.user_id, email: a.email || me.email, answers: a });
      if (error) throw error;
      const accessToken = (await sb.auth.getSession()).data.session?.access_token;
      fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, accessToken, orgName: org.name, email: a.email || me.email, answers: a }) }).catch(() => {});
      setDone(true);
    } catch (e) { setErr(e.message || "Couldn't send your feedback — please try again."); }
    setBusy(false);
  };

  if (done) return (<Modal title="Thank you!" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-3" style={{ background: "#e9f7ef" }}><Check size={22} color="#27ae60" /></div>
      <p className="text-sm text-foreground/80">Your feedback has been sent. If it qualifies, we'll be in touch at <b>{a.email || me.email}</b> about your free month.</p>
    </div>
  </Modal>);

  const req = <span className="text-destructive">*</span>;

  return (<Modal wide title={<span className="flex items-center gap-2"><Gift size={16} /> Tell us what you think — earn a free month</span>} onClose={onClose}
    footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Submit feedback"}</Button></>}>
    <p className="text-xs text-muted-foreground mb-4">Every question is required — complete, thoughtful answers give us the insights we need, and put you in line for a month on us.</p>

    <Field label={<>What do you use Huddle for? {req}</>}>
      <div className="flex flex-wrap gap-1.5">{USES.map(u => (
        <button key={u} type="button" onClick={() => toggleUse(u)} className={`text-xs px-2.5 py-1.5 rounded-lg border ${a.uses.includes(u) ? "border-primary bg-primary/10 text-primary-foreground" : "border-border text-muted-foreground"}`}>{u}</button>
      ))}</div>
    </Field>

    <div className="grid sm:grid-cols-2 gap-3">
      <Field label={<>How many people on your team use it? {req}</>}><Input value={a.teamSize} onChange={e => set("teamSize", e.target.value)} placeholder="e.g. 6" /></Field>
      <Field label={<>How often do you use it? {req}</>}>
        <NativeSelect className="w-full" value={a.frequency} onChange={e => set("frequency", e.target.value)}>
          <option value="">Choose…</option><option>Multiple times a day</option><option>Daily</option><option>A few times a week</option><option>Weekly</option><option>Rarely</option>
        </NativeSelect>
      </Field>
    </div>

    <Field label={<>How did setting up your studio (onboarding) go? {req}</>}><Scale value={a.onboarding} onChange={v => set("onboarding", v)} low="Painful" high="Effortless" /></Field>
    <Field label={<>What (if anything) was confusing during setup? {req}</>}><Textarea rows={2} value={a.onboardingText} onChange={e => set("onboardingText", e.target.value)} /></Field>

    <Field label={<>How easy was inviting other people? {req}</>}><Scale value={a.inviting} onChange={v => set("inviting", v)} low="Hard" high="Easy" /></Field>
    <Field label={<>Anything that made inviting people harder than it should be? {req}</>}><Textarea rows={2} value={a.invitingText} onChange={e => set("invitingText", e.target.value)} /></Field>

    <Field label={<>If you could change one thing, what would it be? {req}</>}><Textarea rows={3} value={a.biggestChange} onChange={e => set("biggestChange", e.target.value)} placeholder="Be specific — this is the most useful answer for us." /></Field>
    <Field label={<>What features would most benefit your team? {req}</>}><Textarea rows={3} value={a.features} onChange={e => set("features", e.target.value)} /></Field>

    <Field label={<>How well does it fit the way your studio actually works? {req}</>}><Scale value={a.fit} onChange={v => set("fit", v)} low="Poorly" high="Perfectly" /></Field>
    <Field label={<>What would you want to be able to customise or rename to fit your workflow? {req}</>}><Textarea rows={2} value={a.customise} onChange={e => set("customise", e.target.value)} /></Field>

    <Field label={<>What almost stopped you signing up, or nearly made you stop using it? {req}</>}><Textarea rows={2} value={a.almostLeft} onChange={e => set("almostLeft", e.target.value)} /></Field>
    <Field label={<>Walk us through how it fits your typical day. {req}</>}><Textarea rows={2} value={a.dailyUse} onChange={e => set("dailyUse", e.target.value)} /></Field>

    <Field label={<>How likely are you to recommend Huddle to another studio? (0–10) {req}</>}><Scale value={a.nps} onChange={v => set("nps", v)} max={11} low="Not at all" high="Absolutely" /></Field>

    <Field label={<>Anything else you'd like us to know? {req}</>}><Textarea rows={2} value={a.anythingElse} onChange={e => set("anythingElse", e.target.value)} /></Field>
    <Field label={<>Email for your free month {req}</>}><Input value={a.email} onChange={e => set("email", e.target.value)} /></Field>

    {err && <div className="text-xs text-destructive mb-2">{err}</div>}
  </Modal>);
}
