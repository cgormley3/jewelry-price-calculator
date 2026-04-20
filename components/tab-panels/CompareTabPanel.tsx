"use client";

import React from "react";
import { createPortal } from "react-dom";
import { findingsMultFromItem } from "@/lib/findings-mult";
import {
  VAULT_PLUS_PRICING_HEADLINE,
  VAULT_PLUS_SUPPORT_COPY,
} from "@/lib/vault-plus-copy";

export type CompareTabPanelProps = {
  user: any;
  showVaultPlusUpgradeLikeCompare: boolean;
  setShowAuth: (v: boolean) => void;
  setShowVaultPlusModal: (v: boolean) => void;
  VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED: boolean;
  setLoading: (v: boolean) => void;
  fetchInventory: () => void | Promise<void>;
  syncingVaultPlus: boolean;
  syncVaultPlusFromStripe: () => void | Promise<void>;
  compareFilterButtonRef: React.RefObject<HTMLButtonElement | null>;
  showCompareFilterMenu: boolean;
  setShowCompareFilterMenu: (v: boolean | ((p: boolean) => boolean)) => void;
  compareFilterDropdownRect: { top: number; left: number } | null;
  locations: string[];
  uniqueTags: string[];
  compareFilterLocation: string;
  setCompareFilterLocation: (v: string) => void;
  compareFilterTag: string;
  setCompareFilterTag: (v: string) => void;
  compareFilterStatus: string;
  setCompareFilterStatus: (v: string) => void;
  compareFilterStrategy: string;
  setCompareFilterStrategy: (v: string) => void;
  compareFilterMetal: string;
  setCompareFilterMetal: (v: string) => void;
  compareSearchTerm: string;
  setCompareSearchTerm: (v: string) => void;
  compareShowLive: boolean;
  setCompareShowLive: (fn: (p: boolean) => boolean) => void;
  compareFormulas: { a: boolean; b: boolean; customIds: string[] };
  setCompareFormulas: (fn: (p: { a: boolean; b: boolean; customIds: string[] }) => { a: boolean; b: boolean; customIds: string[] }) => void;
  formulas: any[];
  compareSpotEnabled: boolean;
  setCompareSpotEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  compareCustomSpots: { gold: number; silver: number; platinum: number; palladium: number };
  setCompareCustomSpots: (
    v:
      | { gold: number; silver: number; platinum: number; palladium: number }
      | ((p: { gold: number; silver: number; platinum: number; palladium: number }) => {
          gold: number;
          silver: number;
          platinum: number;
          palladium: number;
        })
  ) => void;
  prices: Record<string, any>;
  subscriptionStatus: { subscribed: boolean } | null;
  compareFilteredInventory: any[];
  inventory: any[];
  convertStonesToArray: (item: any) => { name: string; cost: number; markup: number }[];
  calculateFullBreakdown: (...args: any[]) => any;
  getItemPrices: (item: any, current: any) => { wholesale: number; retail: number };
  getPricesForFormulas: (
    item: any,
    selected: { a: boolean; b: boolean; customIds: string[] },
    priceOverride?: { gold: number; silver: number; platinum: number; palladium: number }
  ) => Record<string, { wholesale: number; retail: number } | undefined>;
  formatCompareWholesaleRetail: (wh: number, ret: number, alignEnd?: boolean) => React.ReactNode;
  renderComparePriceDelta: (baseW: number, baseR: number, scenW: number, scenR: number) => React.ReactNode;
};

export default function CompareTabPanel(props: CompareTabPanelProps) {
  const {
    user,
    showVaultPlusUpgradeLikeCompare,
    setShowAuth,
    setShowVaultPlusModal,
    VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED,
    setLoading,
    fetchInventory,
    syncingVaultPlus,
    syncVaultPlusFromStripe,
    compareFilterButtonRef,
    showCompareFilterMenu,
    setShowCompareFilterMenu,
    compareFilterDropdownRect,
    locations,
    uniqueTags,
    compareFilterLocation,
    setCompareFilterLocation,
    compareFilterTag,
    setCompareFilterTag,
    compareFilterStatus,
    setCompareFilterStatus,
    compareFilterStrategy,
    setCompareFilterStrategy,
    compareFilterMetal,
    setCompareFilterMetal,
    compareSearchTerm,
    setCompareSearchTerm,
    compareShowLive,
    setCompareShowLive,
    compareFormulas,
    setCompareFormulas,
    formulas,
    compareSpotEnabled,
    setCompareSpotEnabled,
    compareCustomSpots,
    setCompareCustomSpots,
    prices,
    subscriptionStatus,
    compareFilteredInventory,
    inventory,
    convertStonesToArray,
    calculateFullBreakdown,
    getItemPrices,
    getPricesForFormulas,
    formatCompareWholesaleRetail,
    renderComparePriceDelta,
  } = props;

  return (
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] border-2 border-brand shadow-sm flex flex-col flex-1 min-h-0 min-h-[50vh] lg:min-h-0 lg:max-h-[calc(100vh-5rem)] overflow-hidden">
            <div className="p-3 sm:p-6 border-b border-stone-100 bg-white space-y-3 sm:space-y-4 rounded-t-2xl sm:rounded-t-[2.5rem] shrink-0">
              <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Compare Prices</h2>
              <div className="text-[10px] text-stone-500 space-y-2">
                <p>
                  Default view shows <span className="font-bold">Saved</span> (snapshot) and <span className="font-bold">Live</span> (current spot) pricing.
                </p>
                <p>
                  Select <span className="font-bold">Formulas</span> to compare prices, and use <span className="font-bold">Spot Scenario</span> to generate amber columns for comparing custom metal prices against your Saved vault prices or Formula prices.
                </p>
              </div>
              {(!user || showVaultPlusUpgradeLikeCompare) ? (
                <div className="py-8 px-4 rounded-xl bg-stone-50 border border-stone-200 text-center space-y-4">
                  {!user && (
                    <p className="text-stone-600 font-bold uppercase text-xs tracking-wider">
                      Sign in to compare prices. With a vault and Vault+, you can compare item prices across different formulas.
                    </p>
                  )}
                  {user && showVaultPlusUpgradeLikeCompare && (
                    <p className="text-[10px] text-stone-500 font-medium leading-snug max-w-md mx-auto normal-case tracking-normal">
                      {VAULT_PLUS_PRICING_HEADLINE}. {VAULT_PLUS_SUPPORT_COPY}
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
                    {!user ? (
                      <button onClick={() => setShowAuth(true)} className="px-6 py-3 rounded-xl text-[10px] font-black uppercase bg-brand text-white hover:bg-forest transition shadow-sm">
                        Sign in
                      </button>
                    ) : (
                      <>
                        <button onClick={() => setShowVaultPlusModal(true)} className="px-6 py-3 rounded-xl text-[10px] font-black uppercase bg-brand text-white hover:bg-forest transition shadow-sm">
                          Upgrade to Vault+
                        </button>
                        {VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED && (
                          <>
                            <button type="button" onClick={() => { setLoading(true); void fetchInventory(); }} className="text-[10px] font-bold uppercase text-stone-400 hover:text-brand transition">Refresh</button>
                            <button type="button" disabled={syncingVaultPlus} onClick={() => { void syncVaultPlusFromStripe(); }} className="text-[10px] font-bold uppercase text-brand hover:text-foreground transition disabled:opacity-50">
                              {syncingVaultPlus ? 'Syncing…' : 'Sync from Stripe'}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
              <>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 min-h-[48px] sm:h-12">
                <div className="relative flex-1 flex gap-2 w-full min-h-[48px] sm:h-full">
                  <div className="relative shrink-0 min-h-[48px] sm:h-full w-12">
                    <button
                      ref={compareFilterButtonRef}
                      onClick={() => setShowCompareFilterMenu(!showCompareFilterMenu)}
                      className={`w-full h-full min-h-[48px] sm:min-h-0 flex items-center justify-center rounded-xl border transition-all ${showCompareFilterMenu ? 'bg-charcoal text-white border-charcoal' : 'bg-stone-50 border-stone-200 text-stone-400 hover:border-brand'}`}
                    >
                      <span className="text-lg">⚡</span>
                    </button>
                    {showCompareFilterMenu && compareFilterDropdownRect && typeof document !== 'undefined' && createPortal(
                      <div
                        className="fixed w-[min(18rem,calc(100vw-1rem))] max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem))] bg-white rounded-2xl shadow-2xl border-2 border-brand z-[9999] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2"
                        style={{ top: compareFilterDropdownRect.top, left: compareFilterDropdownRect.left }}
                      >
                        <div className="overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4 min-h-0 flex-1 custom-scrollbar">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase text-foreground">Compare Filters</h4>
                          <button onClick={() => {
                            setCompareFilterLocation('All'); setCompareFilterTag('All'); setCompareFilterStrategy('All'); setCompareFilterMetal('All'); setCompareFilterStatus('Active'); setCompareSearchTerm('');
                          }} className="text-[9px] font-bold text-brand uppercase hover:text-foreground">Reset</button>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Location</label>
                          <select value={compareFilterLocation} onChange={e => setCompareFilterLocation(e.target.value)} className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold">
                            <option>All</option>
                            {locations.map(l => <option key={l}>{l}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Tag</label>
                          <div className="flex flex-wrap gap-2">
                            <button key="All" onClick={() => setCompareFilterTag('All')} className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border ${compareFilterTag === 'All' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>All</button>
                            {uniqueTags.map(t => (
                              <button key={t} onClick={() => setCompareFilterTag(t)} className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border ${compareFilterTag === t ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>{t}</button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Item Status</label>
                          <div className="flex gap-2 bg-stone-100 p-1 rounded-lg flex-wrap">
                            {['Active', 'Draft', 'Archived', 'All'].map(s => (
                              <button key={s} onClick={() => setCompareFilterStatus(s)} className={`flex-1 py-1.5 rounded-md text-[8px] font-black uppercase transition-all ${compareFilterStatus === s ? 'bg-white text-foreground shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>{s}</button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Formula</label>
                          <div className="flex gap-2">
                            {['All', 'A', 'B', 'custom'].map(s => (
                              <button key={s} onClick={() => setCompareFilterStrategy(s)} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border ${compareFilterStrategy === s ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>{s === 'custom' ? 'Custom' : s}</button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Metal Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['All', 'Gold', 'Silver', 'Platinum'].map(m => (
                              <button key={m} onClick={() => setCompareFilterMetal(m)} className={`py-1.5 rounded-lg text-[9px] font-black uppercase border ${compareFilterMetal === m ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>{m}</button>
                            ))}
                          </div>
                        </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                  <div className="relative flex-1 min-w-0 min-h-[48px] sm:h-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 text-xs">🔍</span>
                    <input
                      type="text"
                      placeholder="Search by name, tag, metal, location..."
                      className="w-full h-full min-h-[48px] sm:min-h-0 pl-10 pr-4 bg-stone-50 border rounded-xl text-xs font-bold outline-none focus:border-brand transition-all"
                      value={compareSearchTerm}
                      onChange={(e) => setCompareSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[9px] font-bold text-stone-400 uppercase">Show:</span>
                <button
                  type="button"
                  onClick={() => setCompareShowLive(p => !p)}
                  className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${compareShowLive ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                >
                  Live
                </button>
                <span className="text-[9px] font-bold text-stone-400 uppercase">Formulas:</span>
                <button
                  type="button"
                  onClick={() => setCompareFormulas(p => ({ ...p, a: !p.a }))}
                  className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${compareFormulas.a ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                >
                  Formula A
                </button>
                <button
                  type="button"
                  onClick={() => setCompareFormulas(p => ({ ...p, b: !p.b }))}
                  className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${compareFormulas.b ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                >
                  Formula B
                </button>
                {formulas.map((f: any) => {
                  const isSelected = compareFormulas.customIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) setCompareFormulas(p => ({ ...p, customIds: p.customIds.filter(id => id !== f.id) }));
                        else setCompareFormulas(p => ({ ...p, customIds: [...p.customIds, f.id] }));
                      }}
                      title={f.name}
                      className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase border transition-all truncate max-w-[140px] ${isSelected ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = !compareSpotEnabled;
                    setCompareSpotEnabled(next);
                    if (next && compareCustomSpots.gold === 0 && compareCustomSpots.silver === 0) {
                      setCompareCustomSpots({ gold: prices.gold || 0, silver: prices.silver || 0, platinum: prices.platinum || 0, palladium: prices.palladium || 0 });
                    }
                  }}
                  className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${compareSpotEnabled ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                >
                  {compareSpotEnabled ? 'Spot scenario on' : 'Spot scenario'}
                </button>
                {compareSpotEnabled && (
                  <>
                    <p className="w-full basis-full text-[8px] font-bold text-stone-500 normal-case">Scenario spots: <span className="font-black">US$/ozt</span> (same unit as live).</p>
                    {(['gold', 'silver', 'platinum', 'palladium'] as const).map(metal => (
                      <div key={metal} className="flex flex-col gap-0.5">
                        <label className="text-[8px] font-black uppercase text-stone-400">{metal} ($/ozt)</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={compareCustomSpots[metal] || ''}
                            onChange={e => setCompareCustomSpots(p => ({ ...p, [metal]: Number(e.target.value) || 0 }))}
                            className="w-[92px] pl-5 pr-2 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-bold outline-none focus:border-brand transition-all"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCompareCustomSpots({ gold: prices.gold || 0, silver: prices.silver || 0, platinum: prices.platinum || 0, palladium: prices.palladium || 0 })}
                      className="py-1.5 px-3 rounded-lg text-[9px] font-black uppercase text-brand border border-brand/30 hover:bg-brand/10 transition-all"
                    >
                      Load live
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCompareSpotEnabled(false); setCompareCustomSpots({ gold: 0, silver: 0, platinum: 0, palladium: 0 }); }}
                      className="py-1.5 px-3 rounded-lg text-[9px] font-black uppercase text-stone-400 border border-stone-200 hover:bg-stone-100 transition-all"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </>
              )}
            </div>
            {user && subscriptionStatus?.subscribed && (
            <div className="flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain touch-pan-x px-2 pt-1 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] sm:p-6 sm:pb-6 [scrollbar-gutter:stable]">
              {compareFilteredInventory.length === 0 ? (
                <div className="text-center py-12 text-stone-500 text-sm">
                  {inventory.length === 0 ? 'Add items to your vault to compare prices. Use the Vault tab to add items.' : 'No items match your filters. Try adjusting filters or search.'}
                </div>
              ) : !compareShowLive && !compareFormulas.a && !compareFormulas.b && compareFormulas.customIds.length === 0 && !compareSpotEnabled ? (
                <div className="text-center py-12 text-stone-500 text-sm">
                  Turn on Live, Spot scenario, or select at least one formula to compare.
                </div>
              ) : (
                <div className="min-w-max w-full">
                  <p className="sm:hidden text-[9px] font-bold uppercase tracking-wide text-stone-400 mb-2 px-0.5">Scroll sideways — item names are shortened on phone; full name on tap (hold) or desktop.</p>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-stone-200">
                        <th className="py-1 pr-1.5 pl-1 sm:py-1.5 sm:pr-3 sm:pl-0 text-[9px] sm:text-[10px] font-black uppercase text-stone-500 bg-white border-r border-stone-200 relative sm:sticky sm:left-0 sm:z-20 sm:shadow-[4px_0_12px_-6px_rgba(0,0,0,0.12)] max-sm:w-[min(48vw,10.75rem)] max-sm:max-w-[min(48vw,10.75rem)] sm:max-w-[13rem] sm:w-auto">Item</th>
                        <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-stone-500 whitespace-nowrap bg-stone-100 max-sm:max-w-[2.75rem] max-sm:min-w-0">Saved</th>
                        {compareSpotEnabled && (
                          <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-amber-700 whitespace-nowrap bg-amber-50 border-l border-amber-100 max-sm:max-w-[2.75rem] max-sm:min-w-0" title="Each item’s saved formula (A, B, or custom) recalculated at scenario spot prices">
                            <span className="sm:hidden">V@S</span>
                            <span className="hidden sm:inline">Vault @ Scn</span>
                          </th>
                        )}
                        {compareShowLive && <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-slate-700 whitespace-nowrap bg-slate-50 border-l border-stone-100 max-sm:max-w-[2.75rem] max-sm:min-w-0">Live</th>}
                        {compareFormulas.a && <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-stone-500 whitespace-nowrap bg-white max-sm:max-w-[2.75rem] max-sm:min-w-0"><span className="sm:hidden">A</span><span className="hidden sm:inline">Formula A</span></th>}
                        {compareSpotEnabled && compareFormulas.a && <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-amber-600 whitespace-nowrap bg-amber-50 max-sm:max-w-[2.75rem] max-sm:min-w-0"><span className="sm:hidden">A*</span><span className="hidden sm:inline">A @ Scn</span></th>}
                        {compareFormulas.b && <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-stone-500 whitespace-nowrap bg-white max-sm:max-w-[2.75rem] max-sm:min-w-0"><span className="sm:hidden">B</span><span className="hidden sm:inline">Formula B</span></th>}
                        {compareSpotEnabled && compareFormulas.b && <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-amber-600 whitespace-nowrap bg-amber-50 max-sm:max-w-[2.75rem] max-sm:min-w-0"><span className="sm:hidden">B*</span><span className="hidden sm:inline">B @ Scn</span></th>}
                        {compareFormulas.customIds.map(id => {
                          const f = formulas.find((x: any) => x.id === id);
                          if (!f) return null;
                          return (<React.Fragment key={f.id}>
                            <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-stone-500 whitespace-nowrap truncate max-sm:max-w-[2.6rem] max-sm:min-w-0 sm:max-w-[5.5rem] bg-white" title={f.name}><span className="sm:hidden">{f.name.length > 6 ? `${f.name.slice(0, 5)}…` : f.name}</span><span className="hidden sm:inline">{f.name}</span></th>
                            {compareSpotEnabled && <th className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-[8px] sm:text-[10px] font-black uppercase text-amber-600 whitespace-nowrap bg-amber-50 truncate max-sm:max-w-[2.6rem] max-sm:min-w-0 sm:max-w-[5.5rem]" title={`${f.name} @ Scenario`}><span className="sm:hidden">{f.name.length > 4 ? `${f.name.slice(0, 3)}…*` : `${f.name}*`}</span><span className="hidden sm:inline">{f.name} @ Scn</span></th>}
                          </React.Fragment>);
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {compareFilteredInventory.map((item: any) => {
                        const stonesForRow = convertStonesToArray(item);
                        const liveBreakdownForItem = calculateFullBreakdown(
                          item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0,
                          stonesForRow, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat',
                          item.multiplier, item.markup_b, undefined, false, true, findingsMultFromItem(item)
                        );
                        const liveItemPrices = getItemPrices(item, liveBreakdownForItem);
                        const scenarioBreakdownForItem = compareSpotEnabled
                          ? calculateFullBreakdown(
                              item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0,
                              stonesForRow, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat',
                              item.multiplier, item.markup_b, compareCustomSpots, false, true, findingsMultFromItem(item)
                            )
                          : null;
                        const vaultScenarioPrices = scenarioBreakdownForItem ? getItemPrices(item, scenarioBreakdownForItem) : null;
                        const pricesByFormula = getPricesForFormulas(item, compareFormulas);
                        const scenarioPrices = compareSpotEnabled ? getPricesForFormulas(item, compareFormulas, compareCustomSpots) : null;
                        const itemStrategy = item.strategy === 'custom' && item.custom_formula?.formula_name ? item.custom_formula.formula_name : item.strategy;
                        const itemTitle = (item.name || 'Untitled').toUpperCase();
                        return (
                          <tr key={item.id} className="group border-b border-stone-100 hover:bg-stone-50/50">
                            <td
                              className="py-1 pr-1.5 pl-1 sm:py-1.5 sm:pr-3 sm:pl-0 text-[10px] sm:text-xs font-bold text-slate-800 bg-white group-hover:bg-stone-50 border-r border-stone-100 relative sm:sticky sm:left-0 sm:z-10 max-sm:shadow-none sm:shadow-[4px_0_12px_-6px_rgba(0,0,0,0.08)] max-sm:w-[min(48vw,10.75rem)] max-sm:max-w-[min(48vw,10.75rem)] sm:max-w-[13rem] sm:w-auto align-top overflow-hidden"
                              title={itemTitle}
                            >
                              <span className="block truncate sm:truncate-none sm:line-clamp-2 sm:break-words sm:hyphens-auto">{itemTitle}</span>
                            </td>
                            <td className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-stone-600 tabular-nums bg-stone-100 group-hover:bg-stone-50 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0">
                              {formatCompareWholesaleRetail(Number(item.wholesale), Number(item.retail))}
                            </td>
                            {compareSpotEnabled && vaultScenarioPrices && (
                              <td
                                className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-amber-50 border-l border-amber-100 group-hover:bg-amber-50/90 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0"
                                title="This piece’s saved pricing strategy at your scenario spot prices (labor, overhead, stones unchanged)"
                              >
                                {formatCompareWholesaleRetail(vaultScenarioPrices.wholesale, vaultScenarioPrices.retail)}
                                {renderComparePriceDelta(Number(item.wholesale), Number(item.retail), vaultScenarioPrices.wholesale, vaultScenarioPrices.retail)}
                              </td>
                            )}
                            {compareShowLive && (
                              <td className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 text-slate-800 tabular-nums bg-slate-50 border-l border-stone-100 group-hover:bg-stone-50/90 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0" title={"At current spot, using this item's saved formula"}>
                                {formatCompareWholesaleRetail(liveItemPrices.wholesale, liveItemPrices.retail)}
                              </td>
                            )}
                            {compareFormulas.a && (
                              <td className={`max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-white group-hover:bg-stone-50/50 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0 ${itemStrategy === 'A' ? 'bg-brand/10 font-bold text-slate-800' : 'text-stone-600'}`}>
                                {formatCompareWholesaleRetail(pricesByFormula['A']?.wholesale ?? 0, pricesByFormula['A']?.retail ?? 0)}
                              </td>
                            )}
                            {compareSpotEnabled && compareFormulas.a && scenarioPrices && (
                              <td className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-amber-50 group-hover:bg-amber-50/90 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0">
                                {formatCompareWholesaleRetail(scenarioPrices['A']?.wholesale ?? 0, scenarioPrices['A']?.retail ?? 0)}
                                {renderComparePriceDelta(
                                  pricesByFormula['A']?.wholesale ?? 0,
                                  pricesByFormula['A']?.retail ?? 0,
                                  scenarioPrices['A']?.wholesale ?? 0,
                                  scenarioPrices['A']?.retail ?? 0
                                )}
                              </td>
                            )}
                            {compareFormulas.b && (
                              <td className={`max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-white group-hover:bg-stone-50/50 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0 ${itemStrategy === 'B' ? 'bg-brand/10 font-bold text-slate-800' : 'text-stone-600'}`}>
                                {formatCompareWholesaleRetail(pricesByFormula['B']?.wholesale ?? 0, pricesByFormula['B']?.retail ?? 0)}
                              </td>
                            )}
                            {compareSpotEnabled && compareFormulas.b && scenarioPrices && (
                              <td className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-amber-50 group-hover:bg-amber-50/90 align-top max-sm:max-w-[2.75rem] max-sm:min-w-0">
                                {formatCompareWholesaleRetail(scenarioPrices['B']?.wholesale ?? 0, scenarioPrices['B']?.retail ?? 0)}
                                {renderComparePriceDelta(
                                  pricesByFormula['B']?.wholesale ?? 0,
                                  pricesByFormula['B']?.retail ?? 0,
                                  scenarioPrices['B']?.wholesale ?? 0,
                                  scenarioPrices['B']?.retail ?? 0
                                )}
                              </td>
                            )}
                            {compareFormulas.customIds.map(id => {
                              const f = formulas.find((x: any) => x.id === id);
                              if (!f) return null;
                              const p = pricesByFormula[f.name];
                              const sp = scenarioPrices?.[f.name];
                              const isCurrent = itemStrategy === f.name;
                              return (<React.Fragment key={f.id}>
                                <td className={`max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-white group-hover:bg-stone-50/50 align-top max-sm:max-w-[2.6rem] max-sm:min-w-0 sm:max-w-[5.5rem] ${isCurrent ? 'bg-brand/10 font-bold text-slate-800' : 'text-stone-600'}`}>
                                  {formatCompareWholesaleRetail(p?.wholesale ?? 0, p?.retail ?? 0)}
                                </td>
                                {compareSpotEnabled && sp ? (
                                  <td className="max-sm:py-0.5 max-sm:px-[2px] sm:py-1.5 sm:px-1.5 tabular-nums bg-amber-50 group-hover:bg-amber-50/90 align-top max-sm:max-w-[2.6rem] max-sm:min-w-0 sm:max-w-[5.5rem]">
                                    {formatCompareWholesaleRetail(sp.wholesale ?? 0, sp.retail ?? 0)}
                                    {renderComparePriceDelta(p?.wholesale ?? 0, p?.retail ?? 0, sp.wholesale ?? 0, sp.retail ?? 0)}
                                  </td>
                                ) : null}
                              </React.Fragment>);
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}
          </div>

  );
}
