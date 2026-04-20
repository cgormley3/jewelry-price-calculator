"use client";

import React from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { formulaToReadableString } from "@/lib/formula-engine";
import { findingsMultFromItem } from "@/lib/findings-mult";
import type { PriceRoundingOption } from "@/lib/priceRounding";
import {
  metalRowDollarValueFromSpotOzt,
  metalRowLiveDollarValue,
  resolveSpotOzForMetal,
} from "@/lib/vault-metal-display";
import { vaultThumbnailSrc } from "@/lib/vault-thumbnail";
import { localTodayYYYYMMDD } from "@/lib/local-date";

export type VaultTabPanelProps = {
  SHOPIFY_FEATURE_ENABLED: boolean;
  VAULT_DIAGNOSTICS_UI_ENABLED: boolean;
  VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED: boolean;
  MAX_VAULT_PHOTO_UPLOAD_BYTES: number;
  VAULT_PHOTO_ACCEPT: string;
  VAULT_PLUS_PRICE_PHRASE: string;
  addCustomLocation: (itemId: string) => void | Promise<void>;
  addCustomTag: (itemId: string) => void | Promise<void>;
  calculateFullBreakdown: (...args: any[]) => any;
  clearTag: (id: string) => void | Promise<void>;
  convertStonesToArray: (item: any) => { name: string; cost: number; markup: number }[];
  deleteInventoryItem: (id: string, name: string) => void | Promise<void>;
  deleteLocation: (loc: string) => void | Promise<void>;
  deleteTagFromLibrary: (tag: string) => void | Promise<void>;
  editingNameId: string | null;
  exportToCSV: () => void | Promise<void>;
  fetchInventory: () => void | Promise<void>;
  filterButtonRef: React.RefObject<HTMLButtonElement | null>;
  filterDropdownRect: { top: number; left: number } | null;
  filterLocation: string;
  filterMaxPrice: string;
  filterMetal: string;
  filterMinPrice: string;
  filterStatus: string;
  filterStrategy: string;
  filterTag: string;
  filteredInventory: any[];
  getItemPrices: (item: any, current: any) => { wholesale: number; retail: number };
  hasValidSupabaseCredentials: boolean;
  inventory: any[];
  loadItemIntoCalculator: (item: any) => void;
  loading: boolean;
  locations: string[];
  newLocationInput: string;
  newNameValue: string;
  newTagInput: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>, itemId: string) => void;
  openExistingImageInCropper: (itemId: string, imageUrl: string) => void | Promise<void>;
  openMenuId: string | null;
  prices: Record<string, any>;
  pricesLoaded: boolean;
  priceRounding: PriceRoundingOption;
  renameItem: (id: string) => void | Promise<void>;
  roundForDisplay: (n: number) => number;
  saveNote: (id: string, note: string) => void | Promise<void>;
  searchTerm: string;
  selectedItems: Set<string>;
  setEditingItem: (item: any) => void;
  setEditingNameId: (id: string | null) => void;
  setEditingTimeEntryId: (id: string | null) => void;
  setFilterLocation: (v: string) => void;
  setFilterMaxPrice: (v: string) => void;
  setFilterMetal: (v: string) => void;
  setFilterMinPrice: (v: string) => void;
  setFilterStatus: (v: string) => void;
  setFilterStrategy: (v: string) => void;
  setFilterStartDate: (v: string) => void;
  setFilterEndDate: (v: string) => void;
  setFilterTag: (v: string) => void;
  setLoading: (v: boolean) => void;
  setLogTimeAllowItemSelect: (v: boolean) => void;
  setLogTimeDate: (v: string) => void;
  setLogTimeHours: (v: string) => void;
  setLogTimeItemId: (v: string | null) => void;
  setLogTimeNote: (v: string) => void;
  setManualRetail: (v: string) => void;
  setManualWholesale: (v: string) => void;
  setNewLocationInput: (v: string) => void;
  setNewNameValue: (v: string) => void;
  setNewTagInput: (v: string) => void;
  setOpenMenuId: (id: string | null) => void;
  setRecalcItem: (item: any) => void;
  setRecalcItemFormulaMode: (v: "keep" | string) => void;
  setRecalcParams: (v: { gold: string; silver: string; platinum: string; palladium: string; laborRate: string }) => void;
  setSearchTerm: (v: string) => void;
  setShowFilterMenu: (v: boolean | ((p: boolean) => boolean)) => void;
  setShowGlobalRecalc: (v: boolean) => void;
  setShowLogTimeModal: (v: boolean) => void;
  setShowPDFOptions: (v: boolean) => void;
  setShowQuickAddPiece: (v: boolean) => void;
  setShowShopifyExportOptions: (v: boolean) => void;
  setShowSiteProductCsvModal: (v: boolean) => void;
  setShowLocationMenuId: (id: string | null) => void;
  setShowTagMenuId: (id: string | null) => void;
  setShowVaultMenu: (v: boolean | ((p: boolean) => boolean)) => void;
  setShowVaultPlusModal: (v: boolean) => void;
  setVaultDiagnostic: (v: string | null) => void;
  setVaultImageErrorRetries: (fn: (prev: Record<string, number>) => Record<string, number>) => void;
  shopifyConnected: boolean;
  shopifyExporting: boolean;
  showFilterMenu: boolean;
  showLocationMenuId: string | null;
  showTagMenuId: string | null;
  showVaultMenu: boolean;
  showVaultPlusUpgradeLikeCompare: boolean;
  subscriptionStatus: { subscribed: boolean } | null;
  syncToMarket: (item: any) => void | Promise<void>;
  syncingVaultPlus: boolean;
  syncVaultPlusFromStripe: () => void | Promise<void>;
  toggleSelectAll: () => void;
  toggleSelection: (id: string) => void;
  totalVaultValue: number;
  trackedTimeByItem: Record<string, number>;
  uniqueTags: string[];
  updateLocation: (itemId: string, loc: string) => void | Promise<void>;
  updateStatus: (id: string, status: string) => void | Promise<void>;
  updateStockQty: (id: string, nextRaw: number) => void | Promise<void>;
  updateTag: (itemId: string, tag: string) => void | Promise<void>;
  uploadingId: string | null;
  vaultDiagnostic: string | null;
  vaultImageErrorRetries: Record<string, number>;
  vaultImageVisibilityEpoch: number;
  vaultItemStockQty: (item: { stock_qty?: unknown }) => number;
  vaultPaywallHasItems: boolean;
  vaultPullPx: number;
  vaultPullRefreshing: boolean;
  vaultPullScrollRef: React.RefObject<HTMLDivElement | null>;
  updatingStockId: string | null;
};

export default function VaultTabPanel(props: VaultTabPanelProps) {
  const {
    SHOPIFY_FEATURE_ENABLED,
    VAULT_DIAGNOSTICS_UI_ENABLED,
    VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED,
    MAX_VAULT_PHOTO_UPLOAD_BYTES,
    VAULT_PHOTO_ACCEPT,
    VAULT_PLUS_PRICE_PHRASE,
    addCustomLocation,
    addCustomTag,
    calculateFullBreakdown,
    clearTag,
    convertStonesToArray,
    deleteInventoryItem,
    deleteLocation,
    deleteTagFromLibrary,
    editingNameId,
    exportToCSV,
    fetchInventory,
    filterButtonRef,
    filterDropdownRect,
    filterLocation,
    filterMaxPrice,
    filterMetal,
    filterMinPrice,
    filterStatus,
    filterStrategy,
    filterTag,
    filteredInventory,
    getItemPrices,
    hasValidSupabaseCredentials,
    inventory,
    loadItemIntoCalculator,
    loading,
    locations,
    newLocationInput,
    newNameValue,
    newTagInput,
    onFileSelect,
    openExistingImageInCropper,
    openMenuId,
    prices,
    pricesLoaded,
    priceRounding,
    renameItem,
    roundForDisplay,
    saveNote,
    searchTerm,
    selectedItems,
    setEditingItem,
    setEditingNameId,
    setEditingTimeEntryId,
    setFilterLocation,
    setFilterMaxPrice,
    setFilterMetal,
    setFilterMinPrice,
    setFilterStatus,
    setFilterStrategy,
    setFilterStartDate,
    setFilterEndDate,
    setFilterTag,
    setLoading,
    setLogTimeAllowItemSelect,
    setLogTimeDate,
    setLogTimeHours,
    setLogTimeItemId,
    setLogTimeNote,
    setManualRetail,
    setManualWholesale,
    setNewLocationInput,
    setNewNameValue,
    setNewTagInput,
    setOpenMenuId,
    setRecalcItem,
    setRecalcItemFormulaMode,
    setRecalcParams,
    setSearchTerm,
    setShowFilterMenu,
    setShowGlobalRecalc,
    setShowLogTimeModal,
    setShowPDFOptions,
    setShowQuickAddPiece,
    setShowShopifyExportOptions,
    setShowSiteProductCsvModal,
    setShowLocationMenuId,
    setShowTagMenuId,
    setShowVaultMenu,
    setShowVaultPlusModal,
    setVaultDiagnostic,
    setVaultImageErrorRetries,
    shopifyConnected,
    shopifyExporting,
    showFilterMenu,
    showLocationMenuId,
    showTagMenuId,
    showVaultMenu,
    showVaultPlusUpgradeLikeCompare,
    subscriptionStatus,
    syncToMarket,
    syncingVaultPlus,
    syncVaultPlusFromStripe,
    toggleSelectAll,
    toggleSelection,
    totalVaultValue,
    trackedTimeByItem,
    uniqueTags,
    updateLocation,
    updateStatus,
    updateStockQty,
    updateTag,
    uploadingId,
    vaultDiagnostic,
    vaultImageErrorRetries,
    vaultImageVisibilityEpoch,
    vaultItemStockQty,
    vaultPaywallHasItems,
    vaultPullPx,
    vaultPullRefreshing,
    vaultPullScrollRef,
    updatingStockId,
  } = props;

  return (
          <div className="bg-white rounded-[2.5rem] border-2 border-brand shadow-sm flex flex-col flex-1 min-h-0 min-h-[50vh] lg:min-h-0 lg:max-h-[calc(100vh-5rem)] overflow-hidden">
            <div className="p-6 border-b border-stone-100 bg-white space-y-4 rounded-t-[2.5rem] shrink-0">
              <div className="flex justify-between items-center text-left">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Vault Inventory</h2>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{inventory.length} Records Stored</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-stone-400 uppercase italic">Total Vault Value</p>
                  <p className="text-2xl font-black text-foreground">${pricesLoaded ? roundForDisplay(totalVaultValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--.--"}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 min-h-[48px] sm:h-12"> {/* Responsive height for mobile */}
                <div className="relative flex-1 flex gap-2 w-full min-h-[48px] sm:h-full">
                  {/* NEW: Filter Button (Fixed w-12 h-12) */}
                  <div className="relative filter-menu-container shrink-0 min-h-[48px] sm:h-full w-12"> {/* Explicit w-12 with min-height */}
                    <button
                      ref={filterButtonRef}
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      className={`filter-menu-trigger w-full h-full min-h-[48px] sm:min-h-0 flex items-center justify-center rounded-2xl border-2 transition-all ${showFilterMenu ? 'bg-charcoal text-white border-charcoal' : 'bg-white border-stone-200 text-stone-400 hover:border-brand shadow-sm'}`}
                    >
                      <span className="text-lg">⚡</span>
                    </button>

                    {/* Filter Menu Dropdown - rendered via portal to avoid overflow clipping when vault has no items */}
                    {showFilterMenu && filterDropdownRect && typeof document !== 'undefined' && createPortal(
                      <div
                        className="filter-menu-dropdown fixed w-[min(18rem,calc(100vw-1rem))] max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem))] bg-white rounded-2xl shadow-2xl border-2 border-brand z-[9999] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2"
                        style={{ top: filterDropdownRect.top, left: filterDropdownRect.left }}
                      >
                        <div className="overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4 min-h-0 flex-1 custom-scrollbar">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase text-foreground">Filters</h4>
                          <button onClick={() => {
                            setFilterLocation('All'); setFilterTag('All'); setFilterStrategy('All'); setFilterMetal('All'); setFilterStatus('Active');
                            setFilterMinPrice(''); setFilterMaxPrice(''); setFilterStartDate(''); setFilterEndDate('');
                          }} className="text-[9px] font-bold text-brand uppercase hover:text-foreground">Reset</button>
                        </div>

                        {/* Location */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Location</label>
                          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold">
                            <option>All</option>
                            {locations.map(l => <option key={l}>{l}</option>)}
                          </select>
                        </div>

                        {/* Tag */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Tag</label>
                          <div className="flex flex-wrap gap-2">
                            <button key="All" onClick={() => setFilterTag('All')} className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border ${filterTag === 'All' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>All</button>
                            {uniqueTags.map(t => (
                              <button key={t} onClick={() => setFilterTag(t)} className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border ${filterTag === t ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>{t}</button>
                            ))}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Item Status</label>
                          <div className="flex gap-2 bg-stone-100 p-1 rounded-lg flex-wrap">
                            {['Active', 'Draft', 'Archived', 'All'].map(s => (
                              <button key={s} onClick={() => setFilterStatus(s)} className={`flex-1 py-1.5 rounded-md text-[8px] font-black uppercase transition-all ${filterStatus === s ? 'bg-white text-foreground shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>{s}</button>
                            ))}
                          </div>
                        </div>

                        {/* Formula */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Formula</label>
                          <div className="flex gap-2">
                            {['All', 'A', 'B', 'custom'].map(s => (
                              <button key={s} onClick={() => setFilterStrategy(s)} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border ${filterStrategy === s ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>{s === 'custom' ? 'Custom' : s}</button>
                            ))}
                          </div>
                        </div>

                        {/* Metal */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Metal Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['All', 'Gold', 'Silver', 'Platinum'].map(m => (
                              <button key={m} onClick={() => setFilterMetal(m)} className={`py-1.5 rounded-lg text-[9px] font-black uppercase border ${filterMetal === m ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-400'}`}>{m}</button>
                            ))}
                          </div>
                        </div>

                        {/* Price Range */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Live Retail Price ($)</label>
                          <div className="flex gap-2">
                            <input type="number" placeholder="Min" value={filterMinPrice} onChange={e => setFilterMinPrice(e.target.value)} className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" />
                            <input type="number" placeholder="Max" value={filterMaxPrice} onChange={e => setFilterMaxPrice(e.target.value)} className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" />
                          </div>
                        </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>

                  <div className="relative flex-1 min-w-0 min-h-[48px] sm:h-full"> {/* min-height for mobile */}
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 text-xs">🔍</span>
                    <input
                      type="text"
                      placeholder="Search by name, tag, metal, location..."
                      className="w-full h-full min-h-[48px] sm:min-h-0 pl-10 pr-4 bg-white border-2 border-stone-200 rounded-full md:rounded-xl text-xs font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 transition-all shadow-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 md:items-stretch">
                  <button
                    onClick={() => setShowQuickAddPiece(true)}
                    className="min-h-[48px] sm:min-h-0 flex-1 md:flex-initial px-4 rounded-2xl text-[10px] font-black uppercase tracking-wide bg-brand text-white border-2 border-brand hover:bg-forest hover:border-forest transition shadow-md flex items-center justify-center"
                  >
                    Quick add piece
                  </button>
                  {filteredInventory.length > 0 ? (
                    <>
                      {/* Desktop: Select All as standalone button */}
                      <button
                        onClick={toggleSelectAll}
                        className="hidden md:flex px-4 rounded-2xl text-[10px] font-black uppercase items-center justify-center gap-2 transition shadow-sm bg-white text-slate-700 hover:bg-stone-50 border-2 border-stone-200 hover:border-brand/50"
                        title={selectedItems.size === filteredInventory.length && filteredInventory.length > 0 ? 'Deselect all' : 'Select all items'}
                      >
                        {selectedItems.size === filteredInventory.length && filteredInventory.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                      {/* Mobile: More dropdown with Select All + actions */}
                      <div className="md:hidden relative vault-menu-container min-h-[48px] sm:h-full flex-1 min-w-0">
                        <button
                          onClick={() => setShowVaultMenu(!showVaultMenu)}
                          className="vault-menu-trigger w-full h-full min-h-[48px] sm:min-h-0 sm:w-auto px-4 rounded-2xl text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2 transition shadow-sm bg-white text-slate-700 hover:bg-stone-50 border-2 border-stone-200 hover:border-brand/50"
                          title="Select All, Export options"
                        >
                          More {showVaultMenu ? '▲' : '▼'}
                        </button>
                        {showVaultMenu && (
                        <div className="vault-menu-dropdown absolute right-0 mt-2 w-56 max-h-[80vh] bg-white rounded-2xl shadow-2xl border-2 border-brand z-[50] overflow-hidden animate-in fade-in flex flex-col">
                          <div className="overflow-y-auto min-h-0 flex-1 custom-scrollbar">
                          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-foreground">Select All</span>
                            <input type="checkbox" onChange={toggleSelectAll} checked={selectedItems.size === filteredInventory.length && filteredInventory.length > 0} className="accent-brand w-4 h-4 cursor-pointer" />
                          </div>
                          {/* Mobile only: action items merged into More */}
                          <div className="md:hidden">
                            <button onClick={() => { setShowGlobalRecalc(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                              Recalculate {selectedItems.size > 0 ? `Selected (${selectedItems.size})` : 'All'} items
                            </button>
                            {SHOPIFY_FEATURE_ENABLED && shopifyConnected && (
                              <button onClick={() => { setShowShopifyExportOptions(true); setShowVaultMenu(false); }} disabled={shopifyExporting} className={`w-full px-4 py-3 text-left text-[10px] font-black uppercase border-b border-stone-100 transition-colors ${shopifyExporting ? 'text-stone-400 cursor-not-allowed' : 'text-slate-700 hover:bg-stone-50'}`}>
                                {shopifyExporting ? 'Exporting…' : `Export to Shopify ${selectedItems.size > 0 ? `(${selectedItems.size})` : `(${filteredInventory.length})`}`}
                              </button>
                            )}
                            <button onClick={() => { setShowPDFOptions(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                              Export PDF {selectedItems.size > 0 && `(${selectedItems.size})`}
                            </button>
                            <button onClick={() => { exportToCSV(); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                              Export CSV {selectedItems.size > 0 && `(${selectedItems.size})`}
                            </button>
                            <button onClick={() => { setShowSiteProductCsvModal(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                              Export CSV for your site {selectedItems.size > 0 && `(${selectedItems.size})`}
                            </button>
                          </div>
                          </div>
                        </div>
                      )}
                      </div>
                    </>
                  ) : (
                    <button
                      disabled
                      className="min-h-[48px] sm:min-h-0 flex-1 md:flex-initial px-4 rounded-2xl text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2 bg-stone-50 text-stone-400 cursor-not-allowed border-2 border-stone-200"
                      title={SHOPIFY_FEATURE_ENABLED ? "Add items to unlock Recalculate, Export, and Shopify" : "Add items to unlock Recalculate and Export"}
                    >
                      Vault Options
                    </button>
                  )}
                </div>
                </div>

                {/* Row 2: Action bar when items exist (desktop only; mobile uses More dropdown) */}
                {filteredInventory.length > 0 && (
                  <div className="hidden md:flex flex-wrap gap-2">
                      <button onClick={() => { setShowGlobalRecalc(true); }} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-white text-slate-700 border-2 border-stone-200 hover:border-brand hover:bg-stone-50 transition shadow-sm">
                        Recalculate {selectedItems.size > 0 ? `Selected (${selectedItems.size})` : 'All'} items
                      </button>
                      {SHOPIFY_FEATURE_ENABLED && shopifyConnected && (
                        <button onClick={() => { setShowShopifyExportOptions(true); }} disabled={shopifyExporting} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition shadow-sm ${shopifyExporting ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-white text-slate-700 border-2 border-stone-200 hover:border-brand hover:bg-stone-50'}`}>
                          {shopifyExporting ? 'Exporting…' : `Export to Shopify ${selectedItems.size > 0 ? `(${selectedItems.size})` : `(${filteredInventory.length})`}`}
                        </button>
                      )}
                      <button onClick={() => { setShowPDFOptions(true); }} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-white text-slate-700 border-2 border-stone-200 hover:border-brand hover:bg-stone-50 transition shadow-sm">
                        Export PDF {selectedItems.size > 0 && `(${selectedItems.size})`}
                      </button>
                      <button onClick={() => exportToCSV()} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-white text-slate-700 border-2 border-stone-200 hover:border-brand hover:bg-stone-50 transition shadow-sm">
                        Export CSV {selectedItems.size > 0 && `(${selectedItems.size})`}
                      </button>
                      <button type="button" onClick={() => setShowSiteProductCsvModal(true)} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-white text-slate-700 border-2 border-stone-200 hover:border-brand hover:bg-stone-50 transition shadow-sm">
                        Export CSV for your site {selectedItems.size > 0 && `(${selectedItems.size})`}
                      </button>
                    </div>
                )}
              </div>

            {/* flex-1 min-h-0 allows scrolling when parent has max-h on desktop; mobile: cap at ~4 cards height */}
            <div className="flex-1 min-h-0 overflow-hidden rounded-b-[2.5rem] bg-stone-50/20 flex flex-col">
            <div
              ref={vaultPullScrollRef}
              className="flex-1 min-h-0 max-h-[34rem] md:max-h-none overflow-y-auto p-4 md:p-6 pb-[calc(14.25rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(10rem+env(safe-area-inset-bottom,0px))] custom-scrollbar overscroll-behavior-contain touch-pan-y [overflow-anchor:none]"
            >
              <div className="will-change-transform" style={{ transform: `translate3d(0, ${vaultPullPx}px, 0)` }}>
                {(vaultPullPx > 6 || vaultPullRefreshing) && (
                  <div className="flex flex-col items-center justify-center gap-1 py-1 text-brand pointer-events-none select-none" aria-hidden>
                    <span
                      className={`text-xl leading-none inline-block origin-center ${vaultPullRefreshing ? 'animate-spin' : ''}`}
                      style={
                        vaultPullRefreshing
                          ? undefined
                          : { transform: `rotate(${(Math.min(vaultPullPx, 64) / 64) * 360}deg)` }
                      }
                    >
                      ↻
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-stone-400">
                      {vaultPullRefreshing ? 'Updating spots…' : vaultPullPx >= 64 ? 'Release to refresh' : 'Pull for latest spots'}
                    </span>
                  </div>
                )}
              {loading ? (
                <div className="p-20 text-center text-stone-400 font-bold uppercase text-xs tracking-widest animate-pulse">Opening Vault...</div>
              ) : inventory.length === 0 && hasValidSupabaseCredentials ? (
                <div className="p-12 text-center space-y-4">
                  {showVaultPlusUpgradeLikeCompare && vaultPaywallHasItems ? (
                    <>
                      <p className="text-stone-600 font-bold uppercase text-xs tracking-wider">To see your items upgrade to Vault+ ({VAULT_PLUS_PRICE_PHRASE})</p>
                      <div className="flex flex-col sm:flex-row gap-2 items-center justify-center">
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
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-stone-500 font-bold uppercase text-xs tracking-wider">No items yet</p>
                      {showVaultPlusUpgradeLikeCompare && (
                        <button
                          type="button"
                          onClick={() => setShowVaultPlusModal(true)}
                          className="px-6 py-3 rounded-xl text-[10px] font-black uppercase bg-brand text-white hover:bg-forest transition shadow-sm"
                        >
                          Upgrade to Vault+
                        </button>
                      )}
                    </div>
                  )}
                  {VAULT_DIAGNOSTICS_UI_ENABLED && (subscriptionStatus?.subscribed || vaultPaywallHasItems) && (
                    <button
                      onClick={async () => {
                        setVaultDiagnostic(null);
                        const session = (await supabase.auth.getSession()).data.session;
                        const accessToken = (session as any)?.access_token;
                        if (!accessToken) return;
                        try {
                          const res = await fetch('/api/vault-diagnostic', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accessToken }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (data.fix_suggestion) {
                            setVaultDiagnostic(data.fix_suggestion);
                          } else if (data.access_block_reason) {
                            setVaultDiagnostic(String(data.access_block_reason));
                          } else if (data.subscribed && data.inventory_count_for_you === 0) {
                            setVaultDiagnostic('You’re subscribed and no items exist yet for your account. Your vault is empty.');
                          } else {
                            setVaultDiagnostic(`Subscribed: ${data.subscribed}. Status: ${data.subscription_status ?? '—'}. Period end: ${data.subscription_period_end ?? '—'}. Items: ${data.inventory_count_for_you}. Run Diagnose again or tap Sync from Stripe.`);
                          }
                        } catch (_) {
                          setVaultDiagnostic('Diagnostic failed. Check the browser console.');
                        }
                      }}
                      className="text-[9px] font-bold uppercase text-stone-400 hover:text-brand transition underline"
                    >
                      Not seeing items? Diagnose
                    </button>
                  )}
                  {VAULT_DIAGNOSTICS_UI_ENABLED && vaultDiagnostic && (
                    <div className="mt-4 p-4 bg-stone-50 rounded-xl text-left">
                      <p className="text-xs font-mono text-slate-700 break-all whitespace-pre-wrap">{vaultDiagnostic}</p>
                      {(vaultDiagnostic.includes('UPDATE inventory') || vaultDiagnostic.includes('UPDATE subscriptions')) && (
                        <button onClick={() => { setVaultDiagnostic(null); setLoading(true); fetchInventory(); }} className="mt-2 text-[10px] font-bold uppercase text-brand hover:underline">I ran the SQL — Refresh</button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredInventory.map(item => {
                  const stonesArray = convertStonesToArray(item);
                  const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat', item.multiplier, item.markup_b, undefined, undefined, undefined, findingsMultFromItem(item));
                  const labor = item.labor_at_making || 0;
                  const itemPrices = getItemPrices(item, current);
                  const liveWholesale = itemPrices.wholesale;
                  const liveRetail = itemPrices.retail;
                  const priceDiff = liveRetail - item.retail;
                  const isUp = priceDiff >= 0;

                  const formatCurrency = (num: number) => {
                    return roundForDisplay(num).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    });
                  };

                  const savedMetalCost = current.metalCost;

                  // Stone cost for Materials display only (does not affect other calculations)
                  const savedStonesArray = convertStonesToArray(item);
                  const savedStoneCost = savedStonesArray.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);

                  const isSold = item.status === 'sold';
                  const isArchived = item.status === 'archived';

                  return (
                    <div
                      key={item.id}
                      // UPDATED: Dynamic z-index for stacking context
                      className={`bg-white rounded-[2rem] border border-stone-100 shadow-sm overflow-visible relative transition-all hover:shadow-md pl-12 ${isSold || isArchived ? 'opacity-70 bg-stone-50' : ''}`}
                      style={{ zIndex: openMenuId === item.id ? 50 : 0 }}
                    >
                      {/* Selection Checkbox */}
                      <div className="absolute left-4 top-6 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="w-5 h-5 accent-brand cursor-pointer rounded-md border-stone-300"
                        />
                      </div>

                      <div className="p-5 md:p-6 flex flex-col gap-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start flex-nowrap justify-between gap-3 relative">

                            {/* Circular 64x64 thumbnail - square crop stored for Shopify export */}
                            {item.image_url && (
                              <div className="shrink-0 w-16 h-16 rounded-full overflow-hidden border border-stone-200 shadow-sm bg-stone-100">
                                <img
                                  key={`vault-thumb-${item.id}-${vaultImageVisibilityEpoch}-${vaultImageErrorRetries[item.id] ?? 0}`}
                                  src={vaultThumbnailSrc(item.image_url, vaultImageVisibilityEpoch, vaultImageErrorRetries[item.id] ?? 0)}
                                  alt={(item.name || '').toUpperCase()}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  onError={() => {
                                    setVaultImageErrorRetries((prev) => {
                                      const n = prev[item.id] ?? 0;
                                      if (n >= 4) return prev;
                                      return { ...prev, [item.id]: n + 1 };
                                    });
                                  }}
                                />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              {editingNameId === item.id ? (
                                <div className="w-full animate-in fade-in slide-in-from-left-1 flex items-center gap-2">
                                  <input
                                    type="text"
                                    // FIXED: Added min-w-0 to prevent flex item blowout on mobile
                                    className="flex-1 bg-stone-50 border-2 border-brand rounded-xl px-4 py-2 text-sm font-black uppercase outline-none shadow-inner min-w-0"
                                    value={newNameValue}
                                    autoFocus
                                    onChange={(e) => setNewNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') renameItem(item.id);
                                      if (e.key === 'Escape') setEditingNameId(null);
                                    }}
                                  />
                                  <button onClick={() => renameItem(item.id)} className="w-10 h-10 flex items-center justify-center bg-brand text-white rounded-xl font-black text-lg shadow-sm hover:bg-forest transition-colors shrink-0">✓</button>
                                </div>
                              ) : (
                                <div className="flex items-start flex-nowrap gap-2 w-full">
                                  <h3 className={`text-lg font-black leading-tight uppercase tracking-tight break-words flex-1 ${isSold ? 'line-through text-stone-400' : 'text-foreground'}`}>
                                    {(item.name || '').toUpperCase()}
                                  </h3>
                                  <div className="relative shrink-0 pt-0.5 item-menu-container">
                                    <button
                                      onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                                      className="item-menu-trigger w-8 h-8 flex items-center justify-center rounded-full bg-stone-50 text-brand border border-stone-100 hover:bg-stone-100 transition-all shadow-sm"
                                    >
                                      <span className="text-[10px] transform transition-transform duration-200" style={{ transform: openMenuId === item.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                    </button>

                                    {openMenuId === item.id && (
                                      <div className="item-menu-dropdown absolute top-full left-auto right-0 mt-2 w-56 bg-white border border-stone-200 rounded-2xl shadow-xl z-[150] overflow-hidden animate-in fade-in slide-in-from-top-1">
                                        <div className="px-3 py-1.5 border-b border-stone-100">
                                          <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">Item actions</p>
                                        </div>
                                        <div className="py-0.5">
                                          <button
                                            onClick={() => loadItemIntoCalculator(item)}
                                            className={`w-full px-4 py-2 text-left text-sm font-semibold hover:bg-stone-50 transition-colors flex items-center gap-3 ${item.status === 'draft' ? 'text-[#2d4a22] font-bold' : 'text-slate-700'}`}
                                          >
                                            <span className="text-stone-400 w-5 text-center">🧪</span>
                                            {item.status === 'draft' ? 'Add metals & components' : 'Edit metals & components'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingNameId(item.id);
                                              setNewNameValue(item.name);
                                              setOpenMenuId(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3"
                                          >
                                            <span className="text-stone-400 w-5 text-center">✎</span>
                                            Edit name
                                          </button>
                                          {item.image_url && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                void openExistingImageInCropper(item.id, item.image_original_url || item.image_url);
                                              }}
                                              disabled={uploadingId === item.id}
                                              className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              <span className="text-stone-400 w-5 text-center">⊙</span>
                                              <span className="flex flex-col items-start gap-0.5">
                                                <span>Re-crop &amp; adjust photo</span>
                                                <span className="text-[9px] font-normal text-stone-400 normal-case">Same picture — zoom, rotate, position</span>
                                              </span>
                                            </button>
                                          )}
                                          <label className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3 cursor-pointer block">
                                            <span className="text-stone-400 w-5 text-center">📷</span>
                                            <span className="flex flex-col items-start gap-0.5">
                                              <span>Change image</span>
                                              <span className="text-[9px] font-normal text-stone-400 normal-case">iPhone Photos · max {Math.round(MAX_VAULT_PHOTO_UPLOAD_BYTES / (1024 * 1024))} MB</span>
                                            </span>
                                            <input
                                              type="file"
                                              accept={VAULT_PHOTO_ACCEPT}
                                              className="hidden"
                                              disabled={uploadingId === item.id}
                                              onChange={(e) => onFileSelect(e, item.id)}
                                            />
                                          </label>
                                        </div>
                                        <div className="border-t border-stone-100 py-0.5">
                                          <p className="px-4 pt-1 pb-0.5 text-[9px] font-black uppercase tracking-wider text-stone-400">Pricing</p>
                                          <button
                                            onClick={() => syncToMarket(item)}
                                            className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3"
                                          >
                                            <span className="text-stone-400 w-5 text-center">🔄</span>
                                            Sync to market
                                          </button>
                                          <button
                                            onClick={() => {
                                              setRecalcItem(item);
                                              setRecalcItemFormulaMode('keep');
                                              setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
                                              setOpenMenuId(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3"
                                          >
                                            <span className="text-stone-400 w-5 text-center">🧮</span>
                                            Recalculate prices
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingItem(item);
                                              setManualRetail(roundForDisplay(Number(item.retail)).toFixed(2));
                                              setManualWholesale(roundForDisplay(Number(item.wholesale)).toFixed(2));
                                              setOpenMenuId(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3"
                                          >
                                            <span className="text-stone-400 w-5 text-center">⚙️</span>
                                            Manual price edit
                                          </button>
                                        </div>
                                        <div className="border-t border-stone-100 py-0.5">
                                          <button
                                            onClick={() => updateStatus(item.id, item.status === 'archived' ? 'active' : 'archived')}
                                            className={`w-full px-4 py-2 text-left text-sm font-semibold hover:bg-stone-50 transition-colors flex items-center gap-3 ${item.status === 'archived' ? 'text-[#2d4a22]' : 'text-slate-700'}`}
                                          >
                                            <span className="w-5 text-center">{item.status === 'archived' ? '↩' : '📦'}</span>
                                            {item.status === 'archived' ? 'Restore to active' : 'Mark sold / Archive'}
                                          </button>
                                        </div>
                                        <div className="border-t border-stone-100 py-0.5">
                                          <button
                                            onClick={() => {
                                              deleteInventoryItem(item.id, (item.name || 'Untitled').toUpperCase());
                                              setOpenMenuId(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
                                          >
                                            <span className="w-5 text-center">🗑</span>
                                            Remove from vault
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                {item.status === 'draft' && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 uppercase">Draft</span>}
                                {(isSold || isArchived) && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-stone-200 text-stone-600 uppercase">SOLD / ARCHIVED</span>}

                                {/* Tag Badge & Dropdown (optional - vault only) */}
                                <div className="relative tag-menu-container">
                                  <button
                                    onClick={() => setShowTagMenuId(showTagMenuId === item.id ? null : item.id)}
                                    className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border uppercase transition-colors leading-none flex items-center h-[18px] ${item.tag ? 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100' : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200'}`}
                                  >
                                    {item.tag || '+ Tag'}
                                  </button>
                                  {showTagMenuId === item.id && (
                                    <div className="tag-menu-dropdown absolute top-full left-0 mt-1 w-36 bg-white border border-stone-200 rounded-xl shadow-lg z-[60] overflow-hidden animate-in fade-in">
                                      {uniqueTags.length > 0 && (
                                        <>
                                          {uniqueTags.map(t => (
                                            <div key={t} className="flex items-center justify-between border-b border-stone-50 last:border-0 hover:bg-stone-50 pr-2 group">
                                              <button
                                                onClick={() => updateTag(item.id, t)}
                                                className="flex-1 px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-600"
                                              >
                                                {t}
                                              </button>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); deleteTagFromLibrary(t); }}
                                                className="text-red-400 text-[10px] font-bold px-1.5 py-1 hover:text-red-600 hover:bg-red-50 rounded shrink-0"
                                                title={`Remove "${t}" from tag list`}
                                                aria-label={`Remove ${t} from tag list`}
                                              >
                                                ×
                                              </button>
                                            </div>
                                          ))}
                                        </>
                                      )}
                                      {item.tag && (
                                        <button
                                          onClick={() => clearTag(item.id)}
                                          className="w-full px-3 py-2 text-left text-[9px] font-bold text-red-600 hover:bg-red-50 border-b border-stone-50"
                                        >
                                          Remove tag
                                        </button>
                                      )}
                                      <div className="p-2 border-t border-stone-100 bg-stone-50">
                                        <input
                                          type="text"
                                          placeholder="New tag..."
                                          className="w-full p-1.5 text-[9px] border rounded bg-white mb-1.5"
                                          value={newTagInput}
                                          onChange={(e) => setNewTagInput(e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <button
                                          onClick={() => addCustomTag(item.id)}
                                          className="w-full py-1 bg-brand text-white rounded text-[9px] font-bold uppercase hover:bg-forest"
                                        >
                                          Add +
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Location Badge & Dropdown */}
                                <div className="relative location-menu-container">
                                  <button
                                    onClick={() => setShowLocationMenuId(showLocationMenuId === item.id ? null : item.id)}
                                    className="text-[8px] font-black px-1.5 py-0.5 rounded-md border bg-blue-50 text-blue-600 border-blue-100 uppercase hover:bg-blue-100 transition-colors leading-none flex items-center h-[18px]"
                                  >
                                    📍 {item.location || 'Main Vault'}
                                  </button>

                                  {showLocationMenuId === item.id && (
                                    <div className="location-menu-dropdown absolute top-full left-0 mt-1 w-32 bg-white border border-stone-200 rounded-xl shadow-lg z-[60] overflow-hidden animate-in fade-in">
                                      {locations.map(loc => (
                                        <div key={loc} className="flex items-center justify-between border-b border-stone-50 last:border-0 hover:bg-stone-50 pr-2">
                                          <button
                                            onClick={() => updateLocation(item.id, loc)}
                                            className="flex-1 px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-600"
                                          >
                                            {loc}
                                          </button>
                                          {loc !== 'Main Vault' && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); deleteLocation(loc); }}
                                              className="text-red-400 text-[10px] font-bold px-1 hover:text-red-600"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                      <div className="p-2 border-t border-stone-100 bg-stone-50">
                                        <input
                                          type="text"
                                          placeholder="New Location..."
                                          className="w-full p-1 text-[9px] border rounded bg-white mb-1"
                                          value={newLocationInput}
                                          onChange={(e) => setNewLocationInput(e.target.value)}
                                        />
                                        <button
                                          onClick={() => addCustomLocation(item.id)}
                                          className="w-full py-1 bg-brand text-white rounded text-[9px] font-bold uppercase hover:bg-forest"
                                        >
                                          Add +
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border leading-none flex items-center h-[18px] ${isUp ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                  {isUp ? '▲' : '▼'} ${formatCurrency(Math.abs(priceDiff))}
                                </span>
                                <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest text-left leading-none flex items-center h-[18px]">
                                  {new Date(item.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 border border-stone-100 rounded-2xl overflow-hidden mt-1 relative z-0">
                          <div className="p-3 border-b sm:border-b-0 border-r border-stone-100 bg-stone-50/30 text-left">
                            <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest mb-1">Saved Wholesale</p>
                            <p className="text-xs font-bold text-stone-500 whitespace-nowrap">${formatCurrency(Number(item.wholesale))}</p>
                          </div>
                          <div className="p-3 border-b sm:border-b-0 sm:border-r border-stone-100 bg-stone-50/30 text-left">
                            <p className="text-[7px] font-black text-stone-400 uppercase tracking-widest mb-1">Saved Retail</p>
                            <p className="text-xs font-bold text-stone-500 whitespace-nowrap">${formatCurrency(Number(item.retail))}</p>
                          </div>
                          <div className="p-3 border-r border-stone-100 bg-white text-left">
                            <p className="text-[7px] font-black text-foreground uppercase tracking-widest mb-1">Live Wholesale</p>
                            <p className="text-sm font-black text-foreground whitespace-nowrap">
                              ${pricesLoaded ? formatCurrency(liveWholesale) : "--.--"}
                            </p>
                          </div>
                          <div className="p-3 bg-white text-left">
                            <p className="text-[7px] font-black text-brand uppercase tracking-widest italic mb-1">Live Retail</p>
                            <p className="text-base sm:text-lg font-black text-foreground leading-none whitespace-nowrap">
                              ${pricesLoaded ? formatCurrency(liveRetail) : "--.--"}
                            </p>
                          </div>
                        </div>

                        {(() => {
                          const sq = vaultItemStockQty(item);
                          const busy = updatingStockId === item.id;
                          return (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 mt-1 border-t border-stone-100">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[9px] font-black uppercase text-stone-400 tracking-wider">In stock</span>
                                <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50 overflow-hidden">
                                  <button
                                    type="button"
                                    disabled={busy || sq <= 1}
                                    onClick={() => updateStockQty(item.id, sq - 1)}
                                    className="w-9 h-8 text-sm font-black text-slate-700 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    aria-label="Decrease stock"
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[2.25rem] text-center text-xs font-black tabular-nums px-1">{sq}</span>
                                  <button
                                    type="button"
                                    disabled={busy || sq >= 999999}
                                    onClick={() => updateStockQty(item.id, sq + 1)}
                                    className="w-9 h-8 text-sm font-black text-slate-700 hover:bg-stone-200 disabled:opacity-40 transition-colors"
                                    aria-label="Increase stock"
                                  >
                                    +
                                  </button>
                                </div>
                                {busy && <span className="text-[8px] font-bold text-stone-400 uppercase">Saving…</span>}
                              </div>
                              {sq > 1 && (
                                <p className="text-[9px] text-stone-600">
                                  <span className="font-black uppercase text-stone-400 tracking-wider mr-1">Line total (live retail × qty)</span>
                                  <span className="font-black text-foreground tabular-nums">
                                    ${pricesLoaded ? formatCurrency(liveRetail * sq) : '—'}
                                  </span>
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <details className="group border-t border-stone-50 text-left">
                        <summary className="list-none cursor-pointer py-2 text-center text-[8px] font-black uppercase tracking-[0.3em] text-stone-300 hover:text-brand transition-colors">View Breakdown & Notes</summary>
                        <div className="p-5 md:p-6 bg-stone-50/50 space-y-6">

                          {/* Compact Formula, Materials, Labor, and Rounding Boxes */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
                            {/* Formula Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1">Formula</p>
                              <p className="text-sm md:text-xs font-black text-slate-700 uppercase">{item.strategy === 'custom' ? (item.custom_formula?.formula_name || 'Custom') : item.strategy}</p>
                            </div>
                            {/* Materials Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1">Materials</p>
                              <p className="text-sm md:text-xs font-black text-slate-700">${(savedMetalCost + Number(item.other_costs_at_making || 0) + savedStoneCost).toFixed(2)}</p>
                            </div>
                            {/* Labor Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1 leading-tight">Labor ({Number(item.hours || 0)}h @ ${((Number(item.labor_at_making) || 0) / (Number(item.hours) || 1)).toFixed(2)}/hr)</p>
                              <p className="text-sm md:text-xs font-black text-slate-700">${Number(item.labor_at_making || 0).toFixed(2)}</p>
                              {(trackedTimeByItem[item.id] || 0) > 0 && (
                                <p className="text-[8px] font-bold text-amber-600 mt-1">Tracked: {(trackedTimeByItem[item.id] / 60).toFixed(1)}h</p>
                              )}
                              <button
                                type="button"
                                onClick={() => { setEditingTimeEntryId(null); setLogTimeItemId(item.id); setLogTimeAllowItemSelect(false); setLogTimeHours(''); setLogTimeDate(localTodayYYYYMMDD()); setLogTimeNote(''); setShowLogTimeModal(true); }}
                                className="mt-1.5 py-1 px-2 rounded-lg text-[8px] font-black uppercase bg-brand/20 text-brand hover:bg-brand/30 transition"
                              >
                                Log time
                              </button>
                            </div>
                            {/* Rounding Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1">Price Rounding</p>
                              <p className="text-sm md:text-xs font-black text-slate-700">
                                {priceRounding === 'none' ? 'None' : `$${priceRounding}`}
                              </p>
                            </div>
                          </div>

                          {item.strategy === 'custom' && item.custom_formula && (
                            <div className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm text-left">
                              <h4 className="text-[9px] font-black text-stone-400 uppercase mb-2">
                                {item.custom_formula.formula_name ? `Custom: ${item.custom_formula.formula_name}` : 'Custom Formula'}
                              </h4>
                              <div className="space-y-1.5 text-[9px] text-slate-700">
                                <p><span className="font-bold text-stone-500">Base:</span> {formulaToReadableString(item.custom_formula.formula_base)}</p>
                                <p><span className="font-bold text-stone-500">Wholesale:</span> {formulaToReadableString(item.custom_formula.formula_wholesale)}</p>
                                <p><span className="font-bold text-stone-500">Retail:</span> {formulaToReadableString(item.custom_formula.formula_retail)}</p>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-8 text-left">
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase text-stone-400">Saved Breakdown</h4>
                              {item.metals?.map((m: any, idx: number) => {
                                const spotOz = resolveSpotOzForMetal(m, prices);
                                const liveLineVal = metalRowLiveDollarValue(m, prices);
                                const customSpotOzt = Number(m.manualPrice) || 0;
                                const isManualLine = !!(m.isManual && customSpotOzt > 0);
                                const manualLineVal = isManualLine ? metalRowDollarValueFromSpotOzt(m, customSpotOzt) : 0;
                                const displayVal = isManualLine ? manualLineVal : liveLineVal;

                                return (
                                  <div key={idx} className="flex justify-between items-center text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                    <div>
                                      <span>{m.weight}{m.unit} {m.type}</span>
                                    </div>
                                    <div className="text-right">
                                      <span>${(displayVal > 0 ? displayVal : 0).toFixed(2)}</span>
                                      {isManualLine ? (
                                        <span className="block text-[8px] text-stone-500 font-medium normal-case tracking-wide">
                                          Custom spot: ${customSpotOzt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ozt
                                        </span>
                                      ) : (
                                        spotOz > 0 && <span className="block text-[8px] text-stone-400 font-medium normal-case tracking-wide">Spot: ${spotOz.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ozt</span>
                                      )}
                                      {isManualLine && <span className="block text-[8px] text-amber-700/90 font-medium normal-case tracking-wide">First save used this spot; live column uses market spot</span>}
                                    </div>
                                  </div>
                                );
                              })}
                              {item.other_costs_at_making > 0 && (
                                <div className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                  <span>Findings/Other</span>
                                  <div className="text-right">
                                    <span>${Number(item.other_costs_at_making).toFixed(2)}</span>
                                    {item.strategy !== 'custom' && (() => {
                                      const om = findingsMultFromItem(item) ?? (item.strategy === 'B' ? 2 * Number(item.markup_b || 0) : Number(item.multiplier || 0));
                                      const retailPortion = Number(item.other_costs_at_making) * om;
                                      return (
                                        <span className="block text-[8px] text-stone-400 font-medium normal-case tracking-wide">
                                          ×{om.toFixed(2)} retail → ${retailPortion.toFixed(2)}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}
                              {(() => {
                                const stonesArray = convertStonesToArray(item);
                                const totalStoneCost = stonesArray.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
                                const totalStoneRetail = stonesArray.reduce((sum, s) => sum + ((Number(s.cost) || 0) * (Number(s.markup) || 1.5)), 0);
                                return totalStoneCost > 0 && (
                                  <div className="flex justify-between items-center text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                    <div className="flex-1">
                                      <span>Stones{stonesArray.length > 1 ? ` (${stonesArray.length})` : ''}</span>
                                      {stonesArray.length > 1 && (
                                        <div className="text-[8px] text-stone-400 font-medium normal-case mt-0.5 space-y-0.5">
                                          {stonesArray.map((s: any, idx: number) => (
                                            <div key={idx}>{s.name}: ${(Number(s.cost) * Number(s.markup || 1.5)).toFixed(2)} ({s.markup.toFixed(1)}x)</div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <span>${totalStoneRetail.toFixed(2)}</span>
                                      <span className="block text-[8px] text-stone-400 font-medium normal-case tracking-wide">Cost: ${totalStoneCost.toFixed(2)}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                              {(item.overhead_cost > 0 || current.overhead > 0) && (
                                <div className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                  <span>Overhead {item.overhead_type === 'percent' ? `(${Number(item.overhead_cost).toFixed(0)}%)` : ''}</span>
                                  <span>${Number(current.overhead).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="bg-white p-4 rounded-2xl border border-stone-200 text-left">
                            <h4 className="text-[9px] font-black uppercase text-stone-400 mb-2">Vault Notes</h4>
                            <textarea className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-xs italic text-slate-600 resize-none h-24 outline-none focus:border-brand transition-all" placeholder="Click to add notes..." defaultValue={item.notes || ''} onBlur={(e) => saveNote(item.id, (e.target as HTMLTextAreaElement).value)} />
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })}
                </div>
              )}
              </div>
            </div>
            </div>
          </div>
  );
}
