"use client";

import React from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import {
  formulaReferencesBase,
  formulaToTokens,
  parseTokensStrict,
  PRESET_A,
} from "@/lib/formula-engine";
import type { FormulaTokens } from "@/components/FormulaBuilder";

const FormulaBuilder = dynamic(() => import("@/components/FormulaBuilder"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[12rem] rounded-2xl bg-stone-100 animate-pulse border border-stone-200" aria-hidden />
  ),
});

export type FormulasTabPanelProps = {
  user: any;
  formulas: any[];
  formulaEditorOpen: boolean;
  setFormulaEditorOpen: (v: boolean) => void;
  setEditingFormulaId: (v: string | null) => void;
  setFormulaDraftName: (v: string) => void;
  setFormulaDraftTokens: (v: FormulaTokens) => void;
  formulaDraftName: string;
  formulaDraftTokens: FormulaTokens;
  priceRounding: import("@/lib/priceRounding").PriceRoundingOption;
  setPriceRoundingWithPersist: (v: import("@/lib/priceRounding").PriceRoundingOption) => void;
  formulaValid: boolean;
  setFormulaValid: (v: boolean) => void;
  roundForDisplay: (n: number) => number;
  calculateFullBreakdown: (...args: any[]) => any;
  metalList: any[];
  calcHours: number | "";
  calcRate: number | "";
  calcOtherCosts: number | "";
  calcStoneList: { name: string; cost: number; markup: number }[];
  calcOverheadCost: number | "";
  overheadType: "flat" | "percent";
  applyManualMetalInCalculator: boolean;
  calculatorFindingsMult: number | undefined;
  subscriptionStatus: { subscribed: boolean } | null;
  setShowVaultPlusModal: (v: boolean) => void;
  setNotification: (n: any) => void;
  editingFormulaId: string | null;
  setFormulas: (fn: (prev: any[]) => any[]) => void;
  savingFormula: boolean;
  setSavingFormula: (v: boolean) => void;
  formulaToReadableString: (node: any) => string;
  deletingFormulaId: string | null;
  setDeletingFormulaId: (v: string | null) => void;
  selectedFormulaId: string | null;
  setSelectedFormulaId: (v: string | null) => void;
  setCustomFormulaModel: (v: {
    formula_base: any;
    formula_wholesale: any;
    formula_retail: any;
  }) => void;
};

export default function FormulasTabPanel(props: FormulasTabPanelProps) {
  const {
    user,
    formulas,
    formulaEditorOpen,
    setFormulaEditorOpen,
    setEditingFormulaId,
    setFormulaDraftName,
    setFormulaDraftTokens,
    formulaDraftName,
    formulaDraftTokens,
    priceRounding,
    setPriceRoundingWithPersist,
    formulaValid,
    setFormulaValid,
    roundForDisplay,
    calculateFullBreakdown,
    metalList,
    calcHours,
    calcRate,
    calcOtherCosts,
    calcStoneList,
    calcOverheadCost,
    overheadType,
    applyManualMetalInCalculator,
    calculatorFindingsMult,
    subscriptionStatus,
    setShowVaultPlusModal,
    setNotification,
    editingFormulaId,
    setFormulas,
    savingFormula,
    setSavingFormula,
    formulaToReadableString,
    deletingFormulaId,
    setDeletingFormulaId,
    selectedFormulaId,
    setSelectedFormulaId,
    setCustomFormulaModel,
  } = props;

  return (
          <div className="bg-white rounded-[2.5rem] border-2 border-brand shadow-sm flex flex-col flex-1 min-h-0 min-h-[50vh] lg:min-h-0 lg:max-h-[calc(100vh-5rem)] overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-white space-y-4 rounded-t-[2.5rem] shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Saved Formulas</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingFormulaId(null);
                    setFormulaDraftName('');
                    setFormulaDraftTokens({ base: formulaToTokens(PRESET_A.base), wholesale: formulaToTokens(PRESET_A.wholesale), retail: formulaToTokens(PRESET_A.retail) });
                    setFormulaEditorOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-black uppercase hover:bg-forest transition"
                >
                  Create formula
                </button>
              </div>
              <p className="text-[10px] text-stone-500">Create custom price formulas. Star one to make it the default in the Calculator.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 max-md:pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] space-y-4">
              {!user ? (
                <div className="text-center py-12 text-stone-400 text-sm font-bold">
                  Sign in to create and manage formulas.
                </div>
              ) : formulas.length === 0 && !formulaEditorOpen ? (
                <div className="text-center py-12 space-y-4">
                  <p className="text-stone-500 text-sm">No formulas yet.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFormulaId(null);
                      setFormulaDraftName('');
                      setFormulaDraftTokens({ base: formulaToTokens(PRESET_A.base), wholesale: formulaToTokens(PRESET_A.wholesale), retail: formulaToTokens(PRESET_A.retail) });
                      setFormulaEditorOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-black uppercase hover:bg-forest transition"
                  >
                    Create your first formula
                  </button>
                </div>
              ) : formulaEditorOpen ? (
                <div className="bg-stone-50 rounded-2xl border border-stone-200 p-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-bold text-stone-400 uppercase">Round preview to</span>
                    {(['none', 1, 5, 10, 25] as const).map(opt => (
                      <button key={opt} type="button" onClick={() => setPriceRoundingWithPersist(opt)}
                        className={`py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase border transition-all ${priceRounding === opt ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>
                        {opt === 'none' ? 'None' : `$${opt}`}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Formula name</label>
                    <input
                      type="text"
                      value={formulaDraftName}
                      onChange={(e) => setFormulaDraftName(e.target.value)}
                      placeholder="e.g. High-End Retail"
                      className="w-full p-3 rounded-xl border border-stone-200 bg-white text-sm font-bold outline-none focus:border-brand"
                    />
                  </div>
                  <FormulaBuilder
                    tokens={formulaDraftTokens}
                    onChange={setFormulaDraftTokens}
                    onValidationChange={setFormulaValid}
                    roundForDisplay={roundForDisplay}
                    previewContext={(() => {
                      const a = calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult);
                      return {
                        metalCost: a.metalCost,
                        labor: a.labor,
                        other: a.other,
                        stoneCost: a.stones,
                        stoneRetail: a.stoneRetail,
                        overhead: a.overhead,
                        totalMaterials: a.totalMaterials,
                      };
                    })()}
                  />
                  {!formulaValid && (
                    <div className="text-red-700 bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                      <span className="text-xl" aria-hidden>⚠</span>
                      <p className="font-black text-base">Formula is invalid — Save is disabled until you fix it above.</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (subscriptionStatus && !subscriptionStatus.subscribed) {
                          setShowVaultPlusModal(true);
                          return;
                        }
                        if (!formulaDraftName.trim()) {
                          setNotification({ title: 'Name required', message: 'Please enter a name for your formula.', type: 'info' });
                          return;
                        }
                        const baseRes = parseTokensStrict(formulaDraftTokens.base);
                        const wholesaleRes = parseTokensStrict(formulaDraftTokens.wholesale);
                        const retailRes = parseTokensStrict(formulaDraftTokens.retail);
                        if (!baseRes.valid || !wholesaleRes.valid || !retailRes.valid) {
                          setNotification({ title: 'Invalid formula', message: 'Formula must be valid to save. Each slot needs values and operations in a valid pattern (e.g. Metal + Labor).', type: 'error' });
                          return;
                        }
                        if (baseRes.node && formulaReferencesBase(baseRes.node)) {
                          setNotification({ title: 'Invalid formula', message: 'Base formula cannot reference Base (circular).', type: 'error' });
                          return;
                        }
                        setSavingFormula(true);
                        try {
                          const session = (await supabase.auth.getSession()).data.session;
                          const accessToken = (session as any)?.access_token;
                          if (!accessToken || !user?.id) {
                            setNotification({ title: 'Session expired', message: 'Please sign in again.', type: 'info' });
                            return;
                          }
                          const body: any = { accessToken, userId: user.id, formula: { name: formulaDraftName.trim(), formula_base: baseRes.node, formula_wholesale: wholesaleRes.node, formula_retail: retailRes.node } };
                          if (editingFormulaId) body.formula.id = editingFormulaId;
                          const res = await fetch('/api/save-formula', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                          if (res.ok) {
                            const saved = await res.json();
                            setFormulas(prev => {
                              const without = prev.filter(f => f.id !== saved.id);
                              const existing = prev.find(f => f.id === saved.id);
                              const merged = { ...saved, is_starred: existing?.is_starred ?? saved.is_starred ?? false };
                              const next = [merged, ...without];
                              next.sort((a, b) => (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0));
                              return next;
                            });
                            setFormulaEditorOpen(false);
                            setEditingFormulaId(null);
                            setFormulaDraftName('');
                            setNotification({ title: 'Formula saved', message: `"${formulaDraftName}" has been saved.`, type: 'success' });
                          } else if (res.status === 402) {
                            const err = await res.json().catch(() => ({}));
                            if (err?.code === 'PAYWALL_FORMULAS') setShowVaultPlusModal(true);
                            else setNotification({ title: 'Save failed', message: err?.error || 'Could not save formula.', type: 'error' });
                          } else {
                            const err = await res.json().catch(() => ({}));
                            setNotification({ title: 'Save failed', message: err?.error || 'Could not save formula.', type: 'error' });
                          }
                        } finally {
                          setSavingFormula(false);
                        }
                      }}
                      disabled={savingFormula || !formulaValid}
                      title={!formulaValid ? 'Formula must be valid to save' : undefined}
                      className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-black uppercase hover:bg-forest transition disabled:opacity-50"
                    >
                      {savingFormula ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormulaEditorOpen(false);
                        setEditingFormulaId(null);
                        setFormulaDraftName('');
                      }}
                      className="px-4 py-2 rounded-xl bg-stone-200 text-stone-600 text-xs font-black uppercase hover:bg-stone-300 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {formulas.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 rounded-xl border border-stone-200 bg-white hover:border-brand/50 transition flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-foreground truncate">{f.name}</p>
                        <p className="text-[10px] text-stone-500 truncate mt-1" title={formulaToReadableString(f.formula_base) + ' → ' + formulaToReadableString(f.formula_wholesale) + ' → ' + formulaToReadableString(f.formula_retail)}>
                          Base: {formulaToReadableString(f.formula_base)} | Wholesale: {formulaToReadableString(f.formula_wholesale)} | Retail: {formulaToReadableString(f.formula_retail)}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0 items-center">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const session = (await supabase.auth.getSession()).data.session;
                              const accessToken = (session as any)?.access_token;
                              if (!accessToken || !user?.id) return;
                              const res = await fetch('/api/star-formula', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ accessToken, userId: user.id, formulaId: f.is_starred ? null : f.id }),
                              });
                              if (res.ok) {
                                const updated = await res.json();
                                if (updated.id) {
                                  setFormulas(prev => {
                                    const next = prev.map(x => x.id === updated.id ? { ...updated, is_starred: true } : { ...x, is_starred: false });
                                    const starred = next.find(x => x.is_starred);
                                    return starred ? [starred, ...next.filter(x => x.id !== starred.id)] : next;
                                  });
                                  setSelectedFormulaId(updated.id);
                                  setCustomFormulaModel({ formula_base: updated.formula_base, formula_wholesale: updated.formula_wholesale, formula_retail: updated.formula_retail });
                                } else {
                                  setFormulas(prev => prev.map(x => ({ ...x, is_starred: false })));
                                }
                              }
                            } catch { /* ignore */ }
                          }}
                          title={f.is_starred ? 'Remove as default' : 'Set as default in Calculator'}
                          className={`p-1.5 rounded-lg border transition ${f.is_starred ? 'text-amber-500 border-amber-300 bg-amber-50' : 'text-stone-400 border-stone-200 hover:border-brand hover:text-brand'}`}
                        >
                          {f.is_starred ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFormulaId(f.id);
                            setFormulaDraftName(f.name);
                            setFormulaDraftTokens({ base: formulaToTokens(f.formula_base), wholesale: formulaToTokens(f.formula_wholesale), retail: formulaToTokens(f.formula_retail) });
                            setFormulaEditorOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold border border-stone-200 hover:border-brand transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              setDeletingFormulaId(f.id);
                              const session = (await supabase.auth.getSession()).data.session;
                              const accessToken = (session as any)?.access_token;
                              if (!accessToken || !user?.id) {
                                setNotification({ title: 'Session expired', message: 'Please sign in again.', type: 'info' });
                                return;
                              }
                              const res = await fetch('/api/delete-formula', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken, userId: user.id, formulaId: f.id }) });
                              if (res.ok) {
                                setFormulas(prev => prev.filter(x => x.id !== f.id));
                                if (selectedFormulaId === f.id) {
                                  setSelectedFormulaId(null);
                                  setCustomFormulaModel({ formula_base: PRESET_A.base, formula_wholesale: PRESET_A.wholesale, formula_retail: PRESET_A.retail });
                                }
                                setNotification({ title: 'Formula deleted', message: `"${f.name}" has been removed.`, type: 'success' });
                              } else {
                                const err = await res.json().catch(() => ({}));
                                setNotification({ title: 'Delete failed', message: err?.error || 'Could not delete formula.', type: 'error' });
                              }
                            } catch (err) {
                              setNotification({ title: 'Delete failed', message: 'Could not delete formula.', type: 'error' });
                            } finally {
                              setDeletingFormulaId(null);
                            }
                          }}
                          disabled={deletingFormulaId === f.id}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold border border-red-200 text-red-600 hover:border-red-400 transition disabled:opacity-50"
                        >
                          {deletingFormulaId === f.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

  );
}
