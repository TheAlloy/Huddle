import React from "react";
import { X } from "lucide-react";

export const NAVY = "#1f2d4e";
export const AVATAR_BG = ["#2f80ed","#9b51e0","#16a0a0","#eb5757","#27ae60","#f2994a","#2d9cdb","#6b7a99"];
export const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400";

export const initials = (n)=> (n||"?").split(" ").filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");

export function Field({label, hint, children}){
  return (<label className="block mb-3">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
  </label>);
}

export function Btn({children, variant="primary", className="", ...rest}){
  const base="inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg px-3.5 py-2 disabled:opacity-40 disabled:cursor-not-allowed";
  const styles={
    primary:"bg-blue-600 text-white hover:bg-blue-700",
    dark:"text-white hover:opacity-90",
    ghost:"text-slate-600 hover:bg-slate-100",
    outline:"border border-slate-200 text-slate-700 hover:bg-slate-50",
    danger:"bg-red-600 text-white hover:bg-red-700",
  };
  const style = variant==="dark" ? {background:NAVY} : undefined;
  return <button className={`${base} ${styles[variant]||styles.primary} ${className}`} style={style} {...rest}>{children}</button>;
}

export function Card({title, action, children, className=""}){
  return (<div className={`bg-white border border-slate-200 rounded-xl ${className}`}>
    {(title||action) && <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="ml-auto">{action}</div>
    </div>}
    <div className="p-4">{children}</div>
  </div>);
}

export function Modal({title, onClose, children, footer, wide}){
  return (<div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-xl w-full ${wide?"max-w-3xl":"max-w-lg"} max-h-[90vh] flex flex-col`} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center gap-2 px-5 py-3.5 rounded-t-2xl text-white" style={{background:NAVY}}>
        <h2 className="font-semibold">{title}</h2>
        <button onClick={onClose} className="ml-auto opacity-80 hover:opacity-100"><X size={18}/></button>
      </div>
      <div className="p-5 overflow-y-auto">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 justify-end">{footer}</div>}
    </div>
  </div>);
}

export function Avatar({name, i=0, size=28}){
  return <span className="rounded-full grid place-items-center text-white font-bold shrink-0"
    style={{background:AVATAR_BG[i%AVATAR_BG.length], width:size, height:size, fontSize:size*0.4}}>{initials(name)}</span>;
}

export function Pill({children, color="#94a3b8"}){
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{background:color+"22", color}}>{children}</span>;
}

export function Empty({title, children}){
  return (<div className="text-center py-12 px-4">
    <div className="text-slate-700 font-semibold mb-1">{title}</div>
    <div className="text-sm text-slate-400 max-w-md mx-auto">{children}</div>
  </div>);
}

export function Spinner({label="Loading…"}){
  return (<div className="h-full grid place-items-center text-slate-400 text-sm">
    <div className="text-center">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-2"/>
      {label}
    </div>
  </div>);
}
