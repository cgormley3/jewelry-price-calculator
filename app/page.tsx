"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { jsPDF } from 'jspdf';
import dynamic from 'next/dynamic';
import NextImage from 'next/image';
import { supabase, hasValidSupabaseCredentials } from '../lib/supabase';
import type { CredentialResponse } from '@react-oauth/google';
import { GoogleOAuthProvider } from '@react-oauth/google';
import InstallPrompt from './InstallPrompt';
import { evaluateCustomModel, formulaReferencesBase, formulaToReadableString, formulaToTokens, parseTokensStrict, PRESET_A, type FormulaNode } from '../lib/formula-engine';
import type { FormulaTokens } from '../components/FormulaBuilder';
import { VAULT_PLUS_PRICE_PHRASE } from '@/lib/vault-plus-copy';
import { buildShopifyProductCsv } from '@/lib/shopifyProductCsv';
import { buildSquarespaceProductCsv } from '@/lib/squarespaceProductCsv';
import { vaultExportItemTitle } from '@/lib/shopifyProductExport';
import {
  roundPriceForDisplay,
  type PriceRoundingOption,
} from '@/lib/priceRounding';
import { findingsMultFromItem } from '@/lib/findings-mult';
import { GOOGLE_WEB_CLIENT_ID } from '@/lib/google-oauth';
import type { LogicTabPanelProps } from '@/components/tab-panels/LogicTabPanel';
import type { TimeTabPanelProps } from '@/components/tab-panels/TimeTabPanel';
import type { CompareTabPanelProps } from '@/components/tab-panels/CompareTabPanel';
import type { FormulasTabPanelProps } from '@/components/tab-panels/FormulasTabPanel';
import type { VaultTabPanelProps } from '@/components/tab-panels/VaultTabPanel';
import {
  BOMA_HEADER_LOGO_PATH,
  CREATOR_ATTRIBUTION_LABEL,
  CREATOR_SITE_URL,
  ORG_NAME,
  ORG_SHORT_NAME,
  authRedirectOrigin,
  orgSiteUrl,
  privacyPolicyUrl,
} from '@/lib/branding';
import { vaultHeaderFont } from '@/lib/vault-header-font';
import { appIconHeaderPath } from '@/lib/app-icon';
import { formatLocalDateYYYYMMDD, localTodayYYYYMMDD } from '@/lib/local-date';
import { FALLBACK_SPOT, METAL_PURITIES, UNIT_TO_GRAMS } from '@/lib/vault-metal-display';

/** Original file size limit before crop; saved image is 256×256 PNG (small). iPhone Pro / 48MP HEIC can be large. */
const MAX_VAULT_PHOTO_UPLOAD_BYTES = 45 * 1024 * 1024;

/** File picker: include HEIC/HEIF so iOS Photos offers all pictures (not only JPEG). */
const VAULT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/*';

/** Work day for filters & summaries: explicit logged_on or fall back to created_at. */
function entryWorkLocalDay(e: { logged_on?: string | null; created_at: string }): Date {
  if (e.logged_on && /^\d{4}-\d{2}-\d{2}$/.test(e.logged_on)) {
    const [y, mo, d] = e.logged_on.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date(e.created_at);
}

type MainNavTabId = 'calculator' | 'vault' | 'compare' | 'logic' | 'formulas' | 'time';

const MAIN_NAV_TABS: { id: MainNavTabId; label: string }[] = [
  { id: 'calculator', label: 'Calculator' },
  { id: 'time', label: 'Timer' },
  { id: 'vault', label: 'The Vault' },
  { id: 'compare', label: 'Compare' },
  { id: 'formulas', label: 'Formulas' },
  { id: 'logic', label: 'Logic' },
];

/** Cap automatic background metal price fetches (focus/visibility/mount) to once per minute. */
const PRICE_NETWORK_MIN_INTERVAL_MS = 60_000;
/** sessionStorage cache max age for hydrating spot UI without a network call */
const PRICE_SESSION_MAX_AGE_MS = 60_000;

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const GoogleLoginButton = dynamic(
  () => import('@react-oauth/google').then((m) => m.GoogleLogin),
  { ssr: false }
);

const LogicTabPanel = dynamic<LogicTabPanelProps>(
  () => import('@/components/tab-panels/LogicTabPanel'),
  {
    ssr: false,
    loading: () => <div className="min-h-[24rem] rounded-[2rem] bg-stone-100 animate-pulse border-2 border-stone-200/80" aria-hidden />,
  }
);

const TimeTabPanel = dynamic<TimeTabPanelProps>(
  () => import('@/components/tab-panels/TimeTabPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[50vh] rounded-[2.5rem] bg-stone-100 animate-pulse border-2 border-brand/40" aria-hidden />
    ),
  }
);

const CompareTabPanel = dynamic<CompareTabPanelProps>(
  () => import('@/components/tab-panels/CompareTabPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[50vh] rounded-2xl sm:rounded-[2.5rem] bg-stone-100 animate-pulse border-2 border-brand/40" aria-hidden />
    ),
  }
);

const FormulasTabPanel = dynamic<FormulasTabPanelProps>(
  () => import('@/components/tab-panels/FormulasTabPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[50vh] rounded-[2.5rem] bg-stone-100 animate-pulse border-2 border-brand/40" aria-hidden />
    ),
  }
);

const VaultTabPanel = dynamic<VaultTabPanelProps>(
  () => import('@/components/tab-panels/VaultTabPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[50vh] rounded-[2.5rem] bg-stone-100 animate-pulse border-2 border-brand/40" aria-hidden />
    ),
  }
);

/** Only wraps with GoogleOAuthProvider when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set (avoids fake client IDs). */
function GoogleAuthShell({ clientId, children }: { clientId: string; children: React.ReactNode }) {
  if (!clientId) return <>{children}</>;
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}

export default function Home() {
  const privacyFooterUrl = privacyPolicyUrl();
  // Check if Turnstile is configured (for human verification)
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const hasTurnstile = !!turnstileSiteKey;

  const [prices, setPrices] = useState<any>({
    gold: 0,
    silver: 0,
    platinum: 0,
    palladium: 0,
    gold_pct: null,
    silver_pct: null,
    platinum_pct: null,
    palladium_pct: null,
    updated_at: null,
  });
  const [itemName, setItemName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Menus
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  // Filter States
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterTag, setFilterTag] = useState('All');
  const [filterStrategy, setFilterStrategy] = useState('All');
  const [filterMetal, setFilterMetal] = useState('All');
  const [filterStatus, setFilterStatus] = useState('Active');
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Compare tab filters (independent from Vault)
  const [compareFilterLocation, setCompareFilterLocation] = useState('All');
  const [compareFilterTag, setCompareFilterTag] = useState('All');
  const [compareFilterStrategy, setCompareFilterStrategy] = useState('All');
  const [compareFilterMetal, setCompareFilterMetal] = useState('All');
  const [compareFilterStatus, setCompareFilterStatus] = useState('Active');
  const [compareSearchTerm, setCompareSearchTerm] = useState('');
  const [showCompareFilterMenu, setShowCompareFilterMenu] = useState(false);

  // Modals
  const [showGlobalRecalc, setShowGlobalRecalc] = useState(false);
  const [openEditId, setOpenEditId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [recalcItem, setRecalcItem] = useState<any>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // PDF Export Options Modal
  const [showPDFOptions, setShowPDFOptions] = useState(false);
  const [includeLiveInPDF, setIncludeLiveInPDF] = useState(true);
  const [includeBreakdownInPDF, setIncludeBreakdownInPDF] = useState(true);
  const [includeNotesInPDF, setIncludeNotesInPDF] = useState(true);
  const [pdfWholesalePercentOfRetail, setPdfWholesalePercentOfRetail] = useState<number | null>(null);

  // Profile (display name, company, logo for PDF/CSV/account)
  const [profile, setProfile] = useState<{ display_name: string | null; company_name: string | null; logo_url: string | null } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileLogoUploading, setProfileLogoUploading] = useState(false);
  const [profileDraft, setProfileDraft] = useState<{ display_name: string; company_name: string; logo_url: string | null }>({ display_name: '', company_name: '', logo_url: null });
  const [profileLogoPreviewUrl, setProfileLogoPreviewUrl] = useState<string | null>(null);
  const [profileLogoCacheBuster, setProfileLogoCacheBuster] = useState(() => Date.now());
  const profileLogoInputRef = useRef<HTMLInputElement>(null);

  // Vault+ subscription
  const [subscriptionStatus, setSubscriptionStatus] = useState<{ subscribed: boolean } | null>(null);
  const [showVaultPlusModal, setShowVaultPlusModal] = useState(false);
  const [pendingVaultPlusAfterAuth, setPendingVaultPlusAfterAuth] = useState(false);
  const [vaultPaywallHasItems, setVaultPaywallHasItems] = useState(false);
  const [vaultDiagnostic, setVaultDiagnostic] = useState<string | null>(null);
  const [syncingVaultPlus, setSyncingVaultPlus] = useState(false);
  /** Bumped when the PWA returns from hidden (fixes broken vault photos on iOS after PDF / multitask). */
  const [vaultImageVisibilityEpoch, setVaultImageVisibilityEpoch] = useState(0);
  /** Per-item retries when `<img>` fires onError (transient cache / WebKit). */
  const [vaultImageErrorRetries, setVaultImageErrorRetries] = useState<Record<string, number>>({});

  // Vault empty-state “Diagnose” (calls /api/vault-diagnostic) — off for production UX; set true for support/debug
  const VAULT_DIAGNOSTICS_UI_ENABLED = false;
  // Vault / Compare paywall “Refresh” + “Sync from Stripe” — off for production UX; set true for support/debug
  const VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED = false;

  // Shopify – set SHOPIFY_FEATURE_ENABLED = true when app is published
  const SHOPIFY_FEATURE_ENABLED = false;
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyShop, setShopifyShop] = useState<string | null>(null);
  const [showShopifyConnectModal, setShowShopifyConnectModal] = useState(false);
  const [shopifyConnectInput, setShopifyConnectInput] = useState('');
  const [shopifyExporting, setShopifyExporting] = useState(false);
  const [showShopifyExportOptions, setShowShopifyExportOptions] = useState(false);
  const [shopifyExportProgress, setShopifyExportProgress] = useState<null | 'exporting' | { created: number; updated: number; errors: string[] }>(null);
  const [shopifyIncludeDescription, setShopifyIncludeDescription] = useState(true);
  const [shopifyIncludeImage, setShopifyIncludeImage] = useState(true);
  const [shopifyIncludeRetail, setShopifyIncludeRetail] = useState(true);
  const [shopifyIncludeWholesale, setShopifyIncludeWholesale] = useState(true);
  const [shopifyIncludeWholesalePctOfRetail, setShopifyIncludeWholesalePctOfRetail] = useState(true);
  const [shopifyPriceSource, setShopifyPriceSource] = useState<'saved' | 'live'>('saved');
  const [showSiteProductCsvModal, setShowSiteProductCsvModal] = useState(false);
  const [siteCsvPlatform, setSiteCsvPlatform] = useState<'shopify' | 'squarespace'>('shopify');

  // Form States
  const [manualRetail, setManualRetail] = useState('');
  const [manualWholesale, setManualWholesale] = useState('');
  const [recalcParams, setRecalcParams] = useState({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
  const [globalRecalcFormulaMode, setGlobalRecalcFormulaMode] = useState<'keep' | 'A' | 'B' | string>('keep');
  const [recalcItemFormulaMode, setRecalcItemFormulaMode] = useState<'keep' | 'A' | 'B' | string>('keep');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [newNameValue, setNewNameValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Calculator State
  const [metalList, setMetalList] = useState<{ type: string, weight: number, unit: string, isManual?: boolean, manualPrice?: number, spotSaved?: number }[]>([]);
  /** New piece only: calculator preview matches first-time save (manual metal $). Editing existing: always live spot math. */
  const applyManualMetalInCalculator = useMemo(
    () => !editingItemId && metalList.some((m) => m.isManual && m.manualPrice),
    [editingItemId, metalList]
  );
  const [tempMetal, setTempMetal] = useState('Sterling Silver');
  const [tempWeight, setTempWeight] = useState('');
  const [tempUnit, setTempUnit] = useState('Ounces (std)');
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [manualPriceInput, setManualPriceInput] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [hours, setHours] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');

  // Inputs for Stones and Overhead
  const [stoneList, setStoneList] = useState<{ name: string, cost: number, markup: number }[]>([]);
  const [tempStoneName, setTempStoneName] = useState('');
  const [tempStoneCost, setTempStoneCost] = useState<number | ''>('');
  const [tempStoneMarkup, setTempStoneMarkup] = useState<number>(2);
  const [overheadCost, setOverheadCost] = useState<number | ''>('');
  const [overheadType, setOverheadType] = useState<'flat' | 'percent'>('percent');
  const [otherCosts, setOtherCosts] = useState<number | ''>('');
  /** Findings retail × for Formula A/B; empty = use strategy default (same totals as before optional multiplier). */
  const [findingsRetailMultInput, setFindingsRetailMultInput] = useState('');

  const [strategy, setStrategy] = useState<'A' | 'B' | 'custom'>('A');
  const [retailMultA, setRetailMultA] = useState(2.5);
  const [markupB, setMarkupB] = useState(1.8);
  const [customFormulaModel, setCustomFormulaModel] = useState<{
    formula_base: FormulaNode;
    formula_wholesale: FormulaNode;
    formula_retail: FormulaNode;
  }>({
    formula_base: PRESET_A.base,
    formula_wholesale: PRESET_A.wholesale,
    formula_retail: PRESET_A.retail,
  });

  // Which calculator sections to show (build from bottom up: only show what you include)
  const [includeStonesSection, setIncludeStonesSection] = useState(false);
  const [includeLaborSection, setIncludeLaborSection] = useState(false);
  // Tab for calculator: which section's form is visible (Metal | Stones | Labor)
  const [activeCalculatorTab, setActiveCalculatorTab] = useState<'metal' | 'stones' | 'labor'>('metal');
  // Cost breakdown section: collapsible, default collapsed
  const [costBreakdownOpen, setCostBreakdownOpen] = useState(false);
  // Formula dropdowns in retail formula cards: closed by default
  const [formulaAOpen, setFormulaAOpen] = useState(false);
  const [formulaBOpen, setFormulaBOpen] = useState(false);
  const [customStrategyExpanded, setCustomStrategyExpanded] = useState(false);

  // When Labor section is off, use 0 for labor/overhead/other in display (save still uses real values)
  const calcHours = includeLaborSection ? hours : 0;
  const calcRate = includeLaborSection ? rate : 0;
  const calcOtherCosts = includeLaborSection ? otherCosts : 0;
  const calcOverheadCost = includeLaborSection ? overheadCost : 0;
  // When Stones section is off, price ignores stones until user turns it on
  const calcStoneList = includeStonesSection ? stoneList : [];

  const calculatorFindingsMult = useMemo((): number | undefined => {
    if (strategy === 'custom') return undefined;
    const t = findingsRetailMultInput.trim();
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }, [strategy, findingsRetailMultInput]);

  // App State
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Full-screen banner for exports / bulk updates so we don’t reuse “Opening Vault…” (`loading`). */
  const [blockingWorkBanner, setBlockingWorkBanner] = useState<null | { title: string; subtitle: string }>(null);
  /** Lets React paint the work banner before heavy synchronous work (CSV rows, PDF layout). */
  const yieldForWorkBannerPaint = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
    []
  );
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const pricesLoadedRef = useRef(false);
  const [user, setUser] = useState<any>(null);
  /** Same as Compare tab’s “Upgrade to Vault+”: signed in + subscription known + not subscribed. */
  const showVaultPlusUpgradeLikeCompare = Boolean(user && subscriptionStatus && !subscriptionStatus.subscribed);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpAwaitingConfirmation, setSignUpAwaitingConfirmation] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<MainNavTabId>('calculator');
  /** Lazy-load heavy tab chunks after first visit (keeps shell mounted with `hidden`). */
  const [logicTabVisited, setLogicTabVisited] = useState(false);
  const [timeTabVisited, setTimeTabVisited] = useState(false);
  const [compareTabVisited, setCompareTabVisited] = useState(false);
  const [formulasTabVisited, setFormulasTabVisited] = useState(false);
  const [vaultTabVisited, setVaultTabVisited] = useState(false);
  /** Mobile Vault: pull-to-refresh spot prices (touch; max ~md breakpoint). */
  const [vaultPullPx, setVaultPullPx] = useState(0);
  const [vaultPullRefreshing, setVaultPullRefreshing] = useState(false);

  useEffect(() => {
    if (activeTab === 'vault') setVaultTabVisited(true);
    if (activeTab === 'logic') setLogicTabVisited(true);
    if (activeTab === 'time') setTimeTabVisited(true);
    if (activeTab === 'compare') setCompareTabVisited(true);
    if (activeTab === 'formulas') setFormulasTabVisited(true);
  }, [activeTab]);
  const [compareFormulas, setCompareFormulas] = useState<{ a: boolean; b: boolean; customIds: string[] }>({ a: false, b: false, customIds: [] });
  const [compareShowLive, setCompareShowLive] = useState(true);
  const [compareSpotEnabled, setCompareSpotEnabled] = useState(false);
  const [compareCustomSpots, setCompareCustomSpots] = useState({ gold: 0, silver: 0, platinum: 0, palladium: 0 });

  // Saved formulas (fetched when logged in)
  const [formulas, setFormulas] = useState<any[]>([]);
  const [formulasLoading, setFormulasLoading] = useState(false);
  const [formulaEditorOpen, setFormulaEditorOpen] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [formulaDraftTokens, setFormulaDraftTokens] = useState<FormulaTokens>(() => ({
    base: formulaToTokens(PRESET_A.base),
    wholesale: formulaToTokens(PRESET_A.wholesale),
    retail: formulaToTokens(PRESET_A.retail),
  }));
  const [formulaDraftName, setFormulaDraftName] = useState('');
  const [formulaValid, setFormulaValid] = useState(true);
  const [savingFormula, setSavingFormula] = useState(false);
  const [deletingFormulaId, setDeletingFormulaId] = useState<string | null>(null);
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [savedUserTags, setSavedUserTags] = useState<string[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [showLogTimeModal, setShowLogTimeModal] = useState(false);
  const [logTimeItemId, setLogTimeItemId] = useState<string | null>(null);
  const [logTimeItemSearch, setLogTimeItemSearch] = useState('');
  const [logTimeItemDropdownOpen, setLogTimeItemDropdownOpen] = useState(false);
  const [logTimeHours, setLogTimeHours] = useState<string>('');
  const [logTimeDate, setLogTimeDate] = useState<string>('');
  const [logTimeNote, setLogTimeNote] = useState('');
  const [logTimeAllowItemSelect, setLogTimeAllowItemSelect] = useState(false);
  const logTimeItemDropdownRef = useRef<HTMLDivElement>(null);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState<string | null>(null);
  const [deletingTimeEntryId, setDeletingTimeEntryId] = useState<string | null>(null);
  const [timeFilterDateFrom, setTimeFilterDateFrom] = useState('');
  const [timeFilterDateTo, setTimeFilterDateTo] = useState('');
  const [timeFilterItemId, setTimeFilterItemId] = useState<string>('');
  const [timeFilterItemSearch, setTimeFilterItemSearch] = useState('');
  const [timeFilterItemDropdownOpen, setTimeFilterItemDropdownOpen] = useState(false);
  const timeFilterItemDropdownRef = useRef<HTMLDivElement>(null);
  // Timer persisted to localStorage so it survives refresh/background (PWA, mobile home screen)
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem('vault_timer_started_at');
    const n = v ? parseFloat(v) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [timerPausedElapsed, setTimerPausedElapsed] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    if (localStorage.getItem('vault_timer_started_at')) return 0; // If running, ignore paused
    const v = localStorage.getItem('vault_timer_paused_elapsed');
    const n = v ? parseFloat(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const [timerTick, setTimerTick] = useState(0);

  // Image Upload & Crop State
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [savingToVault, setSavingToVault] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [showQuickAddPiece, setShowQuickAddPiece] = useState(false);
  const [quickAddPieceName, setQuickAddPieceName] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropItemId, setCropItemId] = useState<string | null>(null);
  /** True when cropper was opened from the item's saved URL (re-crop) vs a new file pick */
  const [cropIsExistingPhoto, setCropIsExistingPhoto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(0.1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropBlobUrlRef = useRef<string | null>(null);
  const cropSourceFileRef = useRef<File | null>(null);

  // Selection & Location State
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<string[]>(['Main Vault']);
  const [showLocationMenuId, setShowLocationMenuId] = useState<string | null>(null);
  const [showTagMenuId, setShowTagMenuId] = useState<string | null>(null);
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);
  const [newLocationInput, setNewLocationInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  const [priceRounding, setPriceRounding] = useState<PriceRoundingOption>(1);

  const prevShowProfileModalRef = useRef(false);
  useEffect(() => {
    const justOpened = showProfileModal && !prevShowProfileModalRef.current;
    prevShowProfileModalRef.current = showProfileModal;
    if (justOpened) {
      setProfileDraft({
        display_name: profile?.display_name ?? '',
        company_name: profile?.company_name ?? '',
        logo_url: profile?.logo_url ?? null,
      });
      setProfileLogoPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [showProfileModal, profile?.display_name, profile?.company_name, profile?.logo_url]);

  useEffect(() => {
    if (!showProfileModal) {
      setProfileLogoPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [showProfileModal]);

  useEffect(() => {
    const stored = localStorage.getItem('price_rounding');
    if (stored === '1' || stored === '5' || stored === '10' || stored === '25') setPriceRounding(Number(stored) as 1 | 5 | 10 | 25);
    else if (stored === 'none') setPriceRounding('none');
  }, []);

  // Fetch profile when we have a logged-in user but profile wasn't loaded (e.g. 402 paywall, timing)
  useEffect(() => {
    if (!user?.id || user.is_anonymous || profile !== null || !hasValidSupabaseCredentials) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = (session as any)?.access_token;
      if (!token) return;
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile({ display_name: data.display_name ?? null, company_name: data.company_name ?? null, logo_url: data.logo_url ?? null });
        if (data.logo_url) setProfileLogoCacheBuster(Date.now());
      }
    })();
  }, [user?.id, user?.is_anonymous, profile, hasValidSupabaseCredentials]);

  // Refetch when returning from Stripe (vaultplus=1) — sync from Stripe API + retries (webhook can be delayed or miss client_reference_id)
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('vaultplus') !== '1') return;
    window.history.replaceState({}, '', window.location.pathname);
    setActiveTab('vault');
    const runSyncAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = (session as any)?.access_token;
      if (accessToken && session?.user?.id) {
        await fetch('/api/stripe/sync-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: session.user.id }),
        });
      }
      setLoading(true);
      await fetchInventory();
    };
    const t1 = setTimeout(() => { void runSyncAndFetch(); }, 1500);
    const t2 = setTimeout(() => { void runSyncAndFetch(); }, 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [user?.id]);

  // Handle Shopify OAuth callback URL params
  useEffect(() => {
    if (typeof window === 'undefined' || !SHOPIFY_FEATURE_ENABLED) return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('shopify_connected');
    const error = params.get('shopify_error');
    if (connected === '1') {
      setShopifyConnected(true);
      setNotification({ title: 'Shopify Connected', message: 'Your store is now connected. You can export items to Shopify.', type: 'success' });
      window.history.replaceState({}, '', window.location.pathname);
      setActiveTab('vault');
      fetchInventory();
    } else if (error) {
      const msg = error === 'invalid_state' ? 'Connection expired. Try again.' : error === 'token_exchange_failed' ? 'Could not complete connection.' : `Connection failed: ${error}`;
      setNotification({ title: 'Shopify Connection Failed', message: msg, type: 'info' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Persist timer to localStorage so it survives refresh, tab close, PWA background
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (timerStartedAt != null) {
      localStorage.setItem('vault_timer_started_at', String(timerStartedAt));
      localStorage.removeItem('vault_timer_paused_elapsed');
    } else if (timerPausedElapsed > 0) {
      localStorage.setItem('vault_timer_paused_elapsed', String(timerPausedElapsed));
      localStorage.removeItem('vault_timer_started_at');
    } else {
      localStorage.removeItem('vault_timer_started_at');
      localStorage.removeItem('vault_timer_paused_elapsed');
    }
  }, [timerStartedAt, timerPausedElapsed]);

  // Timer tick for live elapsed display when running
  useEffect(() => {
    if (!timerStartedAt) return;
    const id = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [timerStartedAt]);

  const timerElapsedSeconds = timerStartedAt
    ? Math.floor((Date.now() - timerStartedAt) / 1000)
    : timerPausedElapsed;
  const timerElapsedDisplay = (() => {
    const h = Math.floor(timerElapsedSeconds / 3600);
    const m = Math.floor((timerElapsedSeconds % 3600) / 60);
    const s = timerElapsedSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  })();

  const roundForDisplay = useCallback(
    (num: number): number => roundPriceForDisplay(num, priceRounding),
    [priceRounding]
  );

  /** Compare table: stack W/R on two lines on phones; compact single line from sm+ (narrow columns). */
  const formatCompareWholesaleRetail = useCallback((wh: number, ret: number, alignEnd?: boolean) => {
    const ws = roundForDisplay(Number(wh)).toFixed(2);
    const rs = roundForDisplay(Number(ret)).toFixed(2);
    const align = alignEnd ? 'items-end text-right' : 'items-start text-left';
    return (
      <>
        <span className={`sm:hidden flex flex-col leading-[1.05] tabular-nums gap-0 ${align} text-[8px]`}>
          <span className="font-semibold">{`$${ws}`}</span>
          <span className="text-stone-500 text-[7px]">{`$${rs}`}</span>
        </span>
        <span className="hidden sm:inline tabular-nums whitespace-nowrap text-[10px] leading-none tracking-tight">{`$${ws}/$${rs}`}</span>
      </>
    );
  }, [roundForDisplay]);

  /**
   * Compare table % change: use rounded $ values (matches displayed W/R).
   * If wholesale is unchanged after rounding but retail moves (common with manual original saves), show retail %.
   */
  const renderComparePriceDelta = useCallback((baseW: number, baseR: number, scenW: number, scenR: number) => {
    const rw = roundForDisplay(Number(baseW));
    const rr = roundForDisplay(Number(baseR));
    const swd = roundForDisplay(Number(scenW));
    const srd = roundForDisplay(Number(scenR));
    let base: number;
    let next: number;
    let kind: 'wholesale' | 'retail';
    if (rw !== swd) {
      base = rw;
      next = swd;
      kind = 'wholesale';
    } else if (rr !== srd) {
      base = rr;
      next = srd;
      kind = 'retail';
    } else {
      return null;
    }
    if (base === 0 && next === 0) return null;
    const diff = next - base;
    const pct = base !== 0 ? (diff / base) * 100 : (next !== 0 ? 100 : 0);
    if (Math.abs(pct) < 0.01) return null;
    return (
      <span
        title={kind === 'retail' ? '% change on retail (wholesale matches after rounding)' : '% change on wholesale'}
        className={`block text-[8px] max-sm:text-[7px] font-bold leading-tight max-sm:leading-none mt-0.5 max-sm:mt-0 ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}
      >
        {diff > 0 ? '+' : ''}{pct.toFixed(1)}%
        {kind === 'retail' ? <span className="font-normal text-stone-500"> R</span> : null}
      </span>
    );
  }, [roundForDisplay]);

  const setPriceRoundingWithPersist = useCallback((val: PriceRoundingOption) => {
    setPriceRounding(val);
    if (typeof window !== 'undefined') localStorage.setItem('price_rounding', val === 'none' ? 'none' : String(val));
  }, []);

  const fetchInProgressRef = useRef(false);
  /** Last time we started a network metal-prices fetch (throttle auto refreshes). */
  const lastPriceNetworkFetchAtRef = useRef(0);
  /** Coalesces overlapping vault loads (dev Strict Mode, auth burst, preview). */
  const fetchInventoryInFlightRef = useRef<Promise<void> | null>(null);
  const fetchVersionRef = useRef(0);
  const wakeUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vaultAppWasHiddenRef = useRef(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [filterDropdownRect, setFilterDropdownRect] = useState<{ top: number; left: number } | null>(null);
  const compareFilterButtonRef = useRef<HTMLButtonElement>(null);
  const [compareFilterDropdownRect, setCompareFilterDropdownRect] = useState<{ top: number; left: number } | null>(null);
  const vaultPullScrollRef = useRef<HTMLDivElement>(null);
  const vaultPullPxRef = useRef(0);
  const activeTabForPullRef = useRef(activeTab);
  const loadingForPullRef = useRef(loading);
  const vaultPullRefreshingForRef = useRef(false);

  const [notification, setNotification] = useState<{
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info' | 'confirm';
    onConfirm?: () => void
  } | null>(null);

  const isGuest = !user || user.is_anonymous;

  // Global Click Outside Handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showFilterMenu && !target.closest('.filter-menu-container') && !target.closest('.filter-menu-dropdown')) setShowFilterMenu(false);
      if (showVaultMenu && !target.closest('.vault-menu-container')) setShowVaultMenu(false);
      if (showAccountMenu && !target.closest('.account-menu-container')) setShowAccountMenu(false);
      if (openMenuId && !target.closest('.item-menu-container')) setOpenMenuId(null);
      if (showLocationMenuId && !target.closest('.location-menu-container')) setShowLocationMenuId(null);
      if (showTagMenuId && !target.closest('.tag-menu-container')) { setShowTagMenuId(null); setNewTagInput(''); }
      if (showAuth && !target.closest('.auth-menu-container')) {
        setShowAuth(false);
        setPendingVaultPlusAfterAuth(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu, showVaultMenu, showAccountMenu, openMenuId, showLocationMenuId, showTagMenuId, showAuth]);

  // Compute filter dropdown position for portal (avoids overflow clipping when vault has no items)
  useEffect(() => {
    const clampLeft = (rawLeft: number) => {
      if (typeof window === 'undefined') return rawLeft;
      const panelW = Math.min(288, window.innerWidth - 16);
      const margin = 8;
      const maxLeft = window.innerWidth - panelW - margin;
      return Math.max(margin, Math.min(rawLeft, maxLeft));
    };
    if (showFilterMenu && filterButtonRef.current) {
      const rect = filterButtonRef.current.getBoundingClientRect();
      setFilterDropdownRect({ top: rect.bottom + 8, left: clampLeft(rect.left) });
    } else {
      setFilterDropdownRect(null);
    }
    if (showCompareFilterMenu && compareFilterButtonRef.current) {
      const rect = compareFilterButtonRef.current.getBoundingClientRect();
      setCompareFilterDropdownRect({ top: rect.bottom + 8, left: clampLeft(rect.left) });
    } else {
      setCompareFilterDropdownRect(null);
    }
  }, [showFilterMenu, showCompareFilterMenu]);

  useEffect(() => {
    if (activeTab !== 'compare') setShowCompareFilterMenu(false);
  }, [activeTab]);

  useEffect(() => {
    pricesLoadedRef.current = pricesLoaded;
  }, [pricesLoaded]);

  const fetchPrices = useCallback(async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force);
    const cachedData = sessionStorage.getItem('vault_prices');
    const now = Date.now();

    const cachedTime = typeof window !== 'undefined' ? sessionStorage.getItem('vault_prices_time') : null;
    const isFresh = cachedTime && (Date.now() - parseInt(cachedTime, 10)) < PRICE_SESSION_MAX_AGE_MS;
    if (cachedData && isFresh) {
      try {
        const parsed = JSON.parse(cachedData);
        if (parsed.gold > 0 || parsed.silver > 0 || parsed.platinum > 0 || parsed.palladium > 0) {
          setPrices(parsed);
          setPricesLoaded(true);
        }
      } catch (_) { /* ignore */ }
    }

    if (!force) {
      const lastNet = lastPriceNetworkFetchAtRef.current;
      if (lastNet > 0 && now - lastNet < PRICE_NETWORK_MIN_INTERVAL_MS) {
        return;
      }
    }

    // Fetch prices from API (Supabase metal_prices)
    if (fetchInProgressRef.current) return;
    lastPriceNetworkFetchAtRef.current = now;
    fetchInProgressRef.current = true;
    const myVersion = ++fetchVersionRef.current;

    try {
      const res = await fetch(`/api/gold-price?cb=${now}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
      });
      if (myVersion !== fetchVersionRef.current) return;

      if (!res.ok) {
        throw new Error(`API returned ${res.status}: ${res.statusText}`);
      }

      const priceData = await res.json();
      if (myVersion !== fetchVersionRef.current) return;

      if (priceData.error) {
        throw new Error(priceData.error);
      }

      if (priceData.gold || priceData.silver || priceData.platinum || priceData.palladium) {
        const nPct = (v: unknown) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
        const freshPrices = {
          gold: priceData.gold || 0,
          silver: priceData.silver || 0,
          platinum: priceData.platinum || 0,
          palladium: priceData.palladium || 0,
          gold_pct: nPct(priceData.gold_pct),
          silver_pct: nPct(priceData.silver_pct),
          platinum_pct: nPct(priceData.platinum_pct),
          palladium_pct: nPct(priceData.palladium_pct),
          updated_at: priceData.updated_at
        };
        setPrices(freshPrices);
        sessionStorage.setItem('vault_prices', JSON.stringify(freshPrices));
        sessionStorage.setItem('vault_prices_time', now.toString());
        setPricesLoaded(true);
      } else {
        console.warn('No price data received from API' + (priceData._error ? ' (server error)' : ''));
        tryUseCacheOnlyWhenEmpty();
      }
    } catch (e) {
      console.error("Price fetch failed", e);
      tryUseCacheOnlyWhenEmpty();
    } finally {
      if (myVersion === fetchVersionRef.current) {
        fetchInProgressRef.current = false;
      }
    }

    function tryUseCacheOnlyWhenEmpty() {
      if (!pricesLoadedRef.current && cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed.gold > 0 || parsed.silver > 0) {
            setPrices(parsed);
            setPricesLoaded(true);
          }
        } catch (_) { /* ignore */ }
      }
    }
  }, []);

  useEffect(() => {
    vaultPullPxRef.current = vaultPullPx;
  }, [vaultPullPx]);

  useEffect(() => {
    activeTabForPullRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    loadingForPullRef.current = loading;
  }, [loading]);

  useEffect(() => {
    vaultPullRefreshingForRef.current = vaultPullRefreshing;
  }, [vaultPullRefreshing]);

  const fetchPricesRef = useRef(fetchPrices);
  useEffect(() => {
    fetchPricesRef.current = fetchPrices;
  }, [fetchPrices]);

  useEffect(() => {
    const el = vaultPullScrollRef.current;
    if (!el) return;

    const THRESHOLD = 64;
    const MAX_PULL = 100;
    const dampen = (d: number) => Math.min(MAX_PULL, d * 0.45);

    let tracking = false;
    let startY = 0;

    const allowPull = () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767.98px)').matches;

    const onStart = (e: TouchEvent) => {
      if (!allowPull()) return;
      if (activeTabForPullRef.current !== 'vault' || loadingForPullRef.current || vaultPullRefreshingForRef.current) return;
      if (el.scrollTop > 2) return;
      tracking = true;
      startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || !allowPull()) return;
      if (activeTabForPullRef.current !== 'vault') {
        tracking = false;
        vaultPullPxRef.current = 0;
        setVaultPullPx(0);
        return;
      }
      if (el.scrollTop > 2) {
        tracking = false;
        vaultPullPxRef.current = 0;
        setVaultPullPx(0);
        return;
      }
      const y = e.touches[0].clientY;
      const delta = y - startY;
      if (delta <= 0) {
        vaultPullPxRef.current = 0;
        setVaultPullPx(0);
        return;
      }
      e.preventDefault();
      const px = dampen(delta);
      vaultPullPxRef.current = px;
      setVaultPullPx(px);
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      const px = vaultPullPxRef.current;
      if (
        px >= THRESHOLD &&
        allowPull() &&
        activeTabForPullRef.current === 'vault' &&
        !loadingForPullRef.current &&
        !vaultPullRefreshingForRef.current
      ) {
        vaultPullPxRef.current = THRESHOLD;
        setVaultPullPx(THRESHOLD);
        vaultPullRefreshingForRef.current = true;
        setVaultPullRefreshing(true);
        try {
          sessionStorage.removeItem('vault_prices_time');
        } catch {
          /* ignore */
        }
        void (async () => {
          try {
            await fetchPricesRef.current({ force: true });
          } finally {
            vaultPullRefreshingForRef.current = false;
            setVaultPullRefreshing(false);
            vaultPullPxRef.current = 0;
            setVaultPullPx(0);
          }
        })();
      } else {
        vaultPullPxRef.current = 0;
        setVaultPullPx(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const calculateFullBreakdown = useCallback((metals: any[], h: any, r: any, o: any, stones: any[], ovCost: any, ovType: 'flat' | 'percent', customMult?: number, customMarkup?: number, priceOverride?: any, useManualMetalForInitialSaveOnly?: boolean, skipSpotSavedFallback?: boolean, findingsRetailMult?: number | null) => {
    let rawMaterialCost = 0;
    /** Compare-tab scenario: revalue from scenario/live spots only */
    const useScenarioSpotPath = priceOverride !== undefined && priceOverride !== null;
    /** First-time vault save only: honor custom spot ($/ozt) for metal cost so saved wholesale/retail match what the user entered */
    const useManualBranch = !useScenarioSpotPath && !!useManualMetalForInitialSaveOnly && metals.some((x: any) => x?.isManual && x?.manualPrice);
    metals.forEach(m => {
      let pricePerGram = 0;
      if (useManualBranch && m.isManual && m.manualPrice != null && Number(m.manualPrice) > 0) {
        const spotOzt = Number(m.manualPrice);
        pricePerGram = (spotOzt / 31.1035) * (METAL_PURITIES[m.type] || 1.0);
      } else {
        let spot = 0;
        const type = (m.type || '').toLowerCase();

        if (type.includes('gold')) spot = (priceOverride && priceOverride.gold) ? Number(priceOverride.gold) : prices.gold;
        else if (type.includes('silver')) spot = (priceOverride && priceOverride.silver) ? Number(priceOverride.silver) : prices.silver;
        else if (type.includes('platinum')) spot = (priceOverride && priceOverride.platinum) ? Number(priceOverride.platinum) : prices.platinum;
        else if (type.includes('palladium')) spot = (priceOverride && priceOverride.palladium) ? Number(priceOverride.palladium) : prices.palladium;

        /** Compare / live recalc: price metals like spot rows only — do not substitute spotSaved (manual vault rows otherwise skew metal cost). */
        if (!spot && !skipSpotSavedFallback && m.spotSaved != null && Number(m.spotSaved) > 0) spot = Number(m.spotSaved);
        else if (!spot) {
          if (type.includes('gold')) spot = FALLBACK_SPOT.gold;
          else if (type.includes('silver')) spot = FALLBACK_SPOT.silver;
          else if (type.includes('platinum')) spot = FALLBACK_SPOT.platinum;
          else if (type.includes('palladium')) spot = FALLBACK_SPOT.palladium;
        }

        pricePerGram = (spot / 31.1035) * (METAL_PURITIES[m.type] || 1.0);
      }
      rawMaterialCost += pricePerGram * (m.weight * UNIT_TO_GRAMS[m.unit]);
    });

    const labor = (Number(h) || 0) * (Number(r) || 0);
    const other = Number(o) || 0;
    
    // Calculate total stone cost and retail
    const totalStoneCost = Array.isArray(stones) 
      ? stones.reduce((sum, stone) => sum + (Number(stone.cost) || 0), 0)
      : 0;
    const totalStoneRetail = Array.isArray(stones)
      ? stones.reduce((sum, stone) => sum + ((Number(stone.cost) || 0) * (Number(stone.markup) || 1.5)), 0)
      : 0;

    // OVERHEAD CALCULATION
    let overhead = 0;
    const ovInput = Number(ovCost) || 0;

    if (ovType === 'percent') {
      // Percent: (Metal + Labor + Other + Stone cost) × Percentage — stones included in burden
      overhead = (rawMaterialCost + labor + other + totalStoneCost) * (ovInput / 100);
    } else {
      // Flat: Simple dollar addition
      overhead = ovInput;
    }

    const metalCost = rawMaterialCost;
    const totalMaterials = rawMaterialCost + other + totalStoneCost;

    const mult = customMult ?? retailMultA;
    const mark = customMarkup ?? markupB;
    const omResolved = findingsRetailMult != null && Number.isFinite(Number(findingsRetailMult))
      ? Number(findingsRetailMult)
      : null;
    const omA = omResolved ?? mult;
    const omB = omResolved ?? (2 * mark);

    // --- FORMULA A (STANDARD MULTIPLIER) ---
    // Base cost (wholesale path): Metal + Labor + Other + Overhead (stones excluded from this sum)
    const baseCostA = metalCost + labor + other + overhead;
    // Retail: findings/other priced separately (like stones) so optional × can differ from main multiplier
    const baseForRetailMultA = metalCost + labor + overhead;
    const retailA = (baseForRetailMultA * mult) + (other * omA) + totalStoneRetail;
    const wholesaleA = baseCostA + totalStoneCost;

    // --- FORMULA B (MATERIALS MARKUP) ---
    const baseCostB = ((metalCost + other) * mark) + labor + overhead;
    const innerBForRetail = (metalCost * mark) + labor + overhead;
    const retailB = (innerBForRetail * 2) + (other * omB) + totalStoneRetail;
    const wholesaleB = baseCostB + totalStoneCost;

    return { wholesaleA, retailA, wholesaleB, retailB, totalMaterials, labor, metalCost, stones: totalStoneCost, stoneRetail: totalStoneRetail, overhead, other };
  }, [prices, retailMultA, markupB]);

  // Compute wholesale/retail for current formula (including custom)
  const getStrategyPrices = useCallback((breakdown: { wholesaleA: number; retailA: number; wholesaleB: number; retailB: number; metalCost: number; labor: number; other: number; stones: number; stoneRetail: number; overhead: number }) => {
    if (strategy === 'A') return { wholesale: breakdown.wholesaleA, retail: breakdown.retailA };
    if (strategy === 'B') return { wholesale: breakdown.wholesaleB, retail: breakdown.retailB };
    if (strategy === 'custom') {
      if (!selectedFormulaId) return { wholesale: 0, retail: 0 };
      const ctx = {
        metalCost: breakdown.metalCost,
        labor: breakdown.labor,
        other: breakdown.other,
        stoneCost: breakdown.stones,
        stoneRetail: breakdown.stoneRetail,
        overhead: breakdown.overhead,
        totalMaterials: breakdown.metalCost + breakdown.other + breakdown.stones,
      };
      const r = evaluateCustomModel(customFormulaModel, ctx);
      return { wholesale: r.wholesale, retail: r.retail };
    }
    return { wholesale: 0, retail: 0 };
  }, [strategy, customFormulaModel, selectedFormulaId]);

  // Compute wholesale/retail for a vault ITEM (may have custom formula)
  const getItemPrices = useCallback((item: any, breakdown: { wholesaleA: number; retailA: number; wholesaleB: number; retailB: number; metalCost: number; labor: number; other: number; stones: number; stoneRetail: number; overhead: number }) => {
    if (item.strategy === 'A') return { wholesale: breakdown.wholesaleA, retail: breakdown.retailA };
    if (item.strategy === 'B') return { wholesale: breakdown.wholesaleB, retail: breakdown.retailB };
    if (item.strategy === 'custom' && item.custom_formula) {
      const ctx = {
        metalCost: breakdown.metalCost,
        labor: breakdown.labor,
        other: breakdown.other,
        stoneCost: breakdown.stones,
        stoneRetail: breakdown.stoneRetail,
        overhead: breakdown.overhead,
        totalMaterials: breakdown.metalCost + breakdown.other + breakdown.stones,
      };
      const r = evaluateCustomModel(item.custom_formula, ctx);
      return { wholesale: r.wholesale, retail: r.retail };
    }
    return { wholesale: breakdown.wholesaleA, retail: breakdown.retailA };
  }, []);

  // Get prices for an item across multiple formulas (for Compare tab)
  const getPricesForFormulas = useCallback((item: any, selected: { a: boolean; b: boolean; customIds: string[] }, priceOverride?: { gold: number; silver: number; platinum: number; palladium: number }) => {
    const stonesArray = convertStonesToArray(item);
    const breakdown = calculateFullBreakdown(
      item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0,
      stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat',
      item.multiplier, item.markup_b, priceOverride, false, true, findingsMultFromItem(item)
    );
    const result: Record<string, { wholesale: number; retail: number }> = {};
    if (selected.a) result['A'] = { wholesale: breakdown.wholesaleA, retail: breakdown.retailA };
    if (selected.b) result['B'] = { wholesale: breakdown.wholesaleB, retail: breakdown.retailB };
    for (const id of selected.customIds) {
      const formula = formulas.find((f: any) => f.id === id);
      if (formula?.formula_base && formula?.formula_wholesale && formula?.formula_retail) {
        const ctx = {
          metalCost: breakdown.metalCost,
          labor: breakdown.labor,
          other: breakdown.other,
          stoneCost: breakdown.stones,
          stoneRetail: breakdown.stoneRetail,
          overhead: breakdown.overhead,
          totalMaterials: breakdown.metalCost + breakdown.other + breakdown.stones,
        };
        try {
          const r = evaluateCustomModel(formula, ctx);
          result[formula.name] = { wholesale: r.wholesale, retail: r.retail };
        } catch { /* fallback: skip */ }
      }
    }
    return result;
  }, [calculateFullBreakdown, formulas]);

  // Auto-expand custom formula section and load first formula when user has saved formulas (so it shows first as default)
  const hasAutoExpandedForFormulasRef = useRef(false);
  useEffect(() => {
    if (formulas.length > 0 && !hasAutoExpandedForFormulasRef.current) {
      hasAutoExpandedForFormulasRef.current = true;
      setCustomStrategyExpanded(true);
      setStrategy('custom');
      const first = formulas[0];
      if (first?.formula_base && first?.formula_wholesale && first?.formula_retail) {
        setSelectedFormulaId(first.id);
        setCustomFormulaModel({
          formula_base: first.formula_base,
          formula_wholesale: first.formula_wholesale,
          formula_retail: first.formula_retail,
        });
      }
    }
    if (formulas.length === 0) hasAutoExpandedForFormulasRef.current = false;
  }, [formulas.length]);

  // Helper function to convert old stone format (stone_cost, stone_markup) to new format (stones array)
  const convertStonesToArray = (item: any): { name: string, cost: number, markup: number }[] => {
    // If stones array exists, use it
    if (item.stones && Array.isArray(item.stones) && item.stones.length > 0) {
      return item.stones;
    }
    // Otherwise, convert from old format
    const stoneCost = Number(item.stone_cost) || 0;
    const stoneMarkup = Number(item.stone_markup) || 1.5;
    if (stoneCost > 0) {
      return [{ name: 'Stones', cost: stoneCost, markup: stoneMarkup }];
    }
    return [];
  };

  useEffect(() => {
    let mounted = true;
    const fallbackTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 10000);

    // Apply cached prices only if fresh so we don't flash stale numbers before fetch
    try {
      const cached = typeof window !== 'undefined' ? sessionStorage.getItem('vault_prices') : null;
      const cachedTime = typeof window !== 'undefined' ? sessionStorage.getItem('vault_prices_time') : null;
      const isFresh = cachedTime && (Date.now() - parseInt(cachedTime, 10)) < PRICE_SESSION_MAX_AGE_MS;
      if (cached && isFresh) {
        const parsed = JSON.parse(cached);
        if (parsed.gold > 0 || parsed.silver > 0 || parsed.platinum > 0 || parsed.palladium > 0) {
          setPrices(parsed);
          setPricesLoaded(true);
        }
      }
    } catch (_) { /* ignore */ }

    // Fetch prices from spreadsheet on every page load/refresh (runs immediately, not blocked by auth)
    fetchPrices();

    let subscription: { unsubscribe: () => void } | null = null;
    async function initSession() {
      try {
        let authReadyResolve: (session: any) => void;
        const authReady = new Promise<any>(r => { authReadyResolve = r; });

        if (hasValidSupabaseCredentials) {
          let firstEvent = true;
          const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
            if (firstEvent) {
              firstEvent = false;
              authReadyResolve(session);
            }
            setUser(session?.user ?? null);
            // Don’t refetch vault on TOKEN_REFRESHED: refreshSession() (e.g. before Stripe checkout) would
            // trigger a parallel fetch-inventory → 402 → “Vault Load Failed” toast while redirecting to pay.
            const shouldRefreshVault =
              !!session &&
              event !== 'TOKEN_REFRESHED' &&
              (event === 'INITIAL_SESSION' ||
                event === 'SIGNED_IN' ||
                event === 'USER_UPDATED' ||
                event === 'MFA_CHALLENGE_VERIFIED');
            if (shouldRefreshVault) void fetchInventory();
            if (event === "PASSWORD_RECOVERY") setShowResetModal(true);
          });
          subscription = authSub;
          const initialSession = await Promise.race([
            authReady,
            new Promise<any>(r => setTimeout(() => r(null), 4000))
          ]);
          if (!initialSession) {
            // Double-check localStorage: onAuthStateChange can be delayed; avoid overwriting existing session
            let storedSession = (await supabase.auth.getSession()).data.session;
            if (!storedSession?.user) {
              // Try refresh – often fixes "auth session missing" when refresh token exists but access token expired
              const { data: { session: refreshed } } = await supabase.auth.refreshSession();
              storedSession = refreshed;
            }
            if (storedSession?.user) {
              setUser(storedSession.user);
              fetchInventory();
            } else {
              try {
                const { data } = await supabase.auth.signInAnonymously();
                setUser(data.user);
                await fetchInventory();
              } catch (error: any) {
                console.warn('Supabase auth error:', error);
                if (error?.message?.includes('Cannot reach') || error?.message?.includes('timed out') || error?.message === 'Failed to fetch') {
                  setNotification({ title: 'Connection Issue', message: 'Unable to reach the vault service. The calculator works offline—try again when you\'re back online.', type: 'info' });
                } else if (error?.message?.toLowerCase().includes('session') || error?.message?.toLowerCase().includes('auth')) {
                  setNotification({ title: 'Session Error', message: 'Auth session expired or missing. Try refreshing the page or sign in again.', type: 'info' });
                }
              }
            }
          }
        } else {
          console.log('Skipping Supabase auth - credentials not configured');
        }
      } catch (e) {
        console.warn('initSession error:', e);
      } finally {
        if (mounted) {
          clearTimeout(fallbackTimer);
          setLoading(false);
        }
      }
    }
    initSession();

    const handleWakeUp = () => {
      if (document.visibilityState === 'hidden') {
        vaultAppWasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === 'visible' && vaultAppWasHiddenRef.current) {
        vaultAppWasHiddenRef.current = false;
        setVaultImageVisibilityEpoch((e) => e + 1);
        setVaultImageErrorRetries({});
      }
      if (document.visibilityState !== 'visible') return;
      if (wakeUpTimeoutRef.current) clearTimeout(wakeUpTimeoutRef.current);
      wakeUpTimeoutRef.current = setTimeout(() => {
        wakeUpTimeoutRef.current = null;
        fetchPrices();
      }, 100);
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setVaultImageVisibilityEpoch((x) => x + 1);
        setVaultImageErrorRetries({});
      }
    };

    window.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
      if (wakeUpTimeoutRef.current) clearTimeout(wakeUpTimeoutRef.current);
      window.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [fetchPrices]);

  async function fetchInventory() {
    if (!hasValidSupabaseCredentials) {
      setLoading(false);
      return;
    }
    if (fetchInventoryInFlightRef.current) {
      return fetchInventoryInFlightRef.current;
    }
    const run = (async () => {
    try {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session?.user?.id) {
        await new Promise(r => setTimeout(r, 400));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!session?.user?.id) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session?.user?.id) {
        return;
      }
      let accessToken = (session as any).access_token;
      if (!accessToken) {
        setNotification({ title: 'Session Error', message: 'Could not get access token. Try signing in again.', type: 'info' });
        return;
      }
      const fetchInvOnce = () => {
        const c = new AbortController();
        const tid = setTimeout(() => c.abort(), 25000);
        return fetch('/api/fetch-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: session.user.id }),
          signal: c.signal,
        }).finally(() => clearTimeout(tid));
      };

      let res = await fetchInvOnce();
      let inventory402Body: Record<string, unknown> | null = null;
      let retriedInventoryAfter402 = false;

      if (res.status === 402) {
        inventory402Body = await res.json().catch(() => ({}));
        const resSubCheck = await fetch('/api/subscription/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: session.user.id }),
        });
        const subCheck = resSubCheck.ok ? await resSubCheck.json().catch(() => ({})) : {};
        if (subCheck.subscribed) {
          setSubscriptionStatus({ subscribed: true });
          await new Promise((r) => setTimeout(r, 450));
          retriedInventoryAfter402 = true;
          res = await fetchInvOnce();
        }
      }

      if (res.ok) {
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : []);
        setVaultPaywallHasItems(false);
        const items = Array.isArray(data) ? data : [];
        const uniqueLocs = Array.from(new Set(items.map((i: any) => i.location).filter(Boolean)));
        setLocations(prev => Array.from(new Set([...prev, ...uniqueLocs])));
        const jsonBody = { accessToken, userId: session.user.id };
        const resFormulasP = fetch('/api/fetch-formulas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody),
        });
        const resTagsP = fetch('/api/fetch-user-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody),
        });
        const resTimeP = fetch('/api/fetch-time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody),
        });
        const resShopifyP = SHOPIFY_FEATURE_ENABLED
          ? fetch('/api/shopify/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(jsonBody),
            })
          : Promise.resolve(null as Response | null);
        const resProfileP = fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        });
        const [resFormulas, resTags, resTime, resShopify, resProfile] = await Promise.all([
          resFormulasP,
          resTagsP,
          resTimeP,
          resShopifyP,
          resProfileP,
        ]);
        if (resFormulas.ok) {
          const formulasData = await resFormulas.json();
          setFormulas(Array.isArray(formulasData) ? formulasData : []);
        }
        if (resTags.ok) {
          const tagsData = await resTags.json();
          setSavedUserTags(Array.isArray(tagsData) ? tagsData : []);
        }
        if (resTime.ok) {
          const timeData = await resTime.json();
          setTimeEntries(Array.isArray(timeData) ? timeData : []);
        }
        if (resShopify?.ok) {
          const shopifyData = await resShopify.json();
          setShopifyConnected(!!shopifyData.connected);
          setShopifyShop(shopifyData.shop || null);
        }
        // fetch-inventory only returns 200 when the server already verified Vault+ — do not let a
        // separate /subscription/status failure or mismatch clear the UI back to "Upgrade".
        setSubscriptionStatus({ subscribed: true });
        void fetch('/api/subscription/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: session.user.id }),
        })
          .then((r) => r.json().catch(() => ({})))
          .then((subData: { subscribed?: boolean }) => {
            if (subData && subData.subscribed === false) {
              console.warn('[vault] subscription/status said false after inventory 200 — ignoring for UI');
            }
          })
          .catch(() => {});
        if (resProfile.ok) {
          const profileData = await resProfile.json();
          setProfile({
            display_name: profileData.display_name ?? null,
            company_name: profileData.company_name ?? null,
            logo_url: profileData.logo_url ?? null,
          });
          if (profileData.logo_url) setProfileLogoCacheBuster(Date.now());
        }
      } else if (res.status === 401) {
        const err = await res.json().catch(() => ({}));
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (refreshed?.user && (refreshed as any).access_token) {
          setUser(refreshed.user);
          fetchInventoryInFlightRef.current = null;
          setLoading(true);
          await fetchInventory();
          return;
        }
        setNotification({ title: 'Session expired', message: err?.error || 'Please sign in again.', type: 'info', onConfirm: () => { setLoading(true); fetchInventory(); } });
      } else if (res.status === 402) {
        const err = retriedInventoryAfter402
          ? await res.json().catch(() => ({}))
          : (inventory402Body ?? {});
        const resSubFinal = await fetch('/api/subscription/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: session.user.id }),
        });
        const subFinal = resSubFinal.ok ? await resSubFinal.json().catch(() => ({})) : null;
        const paidKnown = resSubFinal.ok && subFinal != null;
        const paid = paidKnown ? !!subFinal.subscribed : null;
        if (paid !== null) {
          setSubscriptionStatus({ subscribed: paid });
        } else {
          // Don’t flip UI to “Upgrade” because /subscription/status failed (network / 5xx)
          setSubscriptionStatus((prev) => prev ?? { subscribed: false });
        }
        setVaultPaywallHasItems(!!(err as { hasItems?: boolean })?.hasItems);
        if (paid === false) {
          setInventory([]);
          setLocations(['Main Vault']);
          if ((err as { code?: string })?.code !== 'PAYWALL_VAULT') {
            setNotification({ title: 'Vault Load Failed', message: (err as { error?: string })?.error || `Upgrade to Vault+ (${VAULT_PLUS_PRICE_PHRASE}) to access your vault.`, type: 'info' });
          }
        } else if (paid === true) {
          setNotification({
            title: 'Vault',
            message: 'Your subscription is active but the vault request failed once. Tap Refresh again, or open Vault → Sync from Stripe if this keeps happening.',
            type: 'info',
          });
        } else {
          setNotification({
            title: 'Vault',
            message: 'Could not verify subscription status. Tap Refresh. If you just used Sync from Stripe, your account may still be linked.',
            type: 'info',
          });
        }
        const resProfile = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        });
        if (resProfile.ok) {
          const profileData = await resProfile.json();
          setProfile({ display_name: profileData.display_name ?? null, company_name: profileData.company_name ?? null, logo_url: profileData.logo_url ?? null });
          if (profileData.logo_url) setProfileLogoCacheBuster(Date.now());
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setNotification({ title: 'Vault Load Failed', message: err?.error || 'Could not load vault.', type: 'info', onConfirm: () => { setLoading(true); fetchInventory(); } });
      }
    } catch (error: any) {
      console.warn('Error fetching inventory:', error);
      const retry = () => { setLoading(true); void fetchInventory(); };
      if (error?.name === 'AbortError') {
        setNotification({ title: 'Vault Load Timeout', message: 'Connection is slow. Tap Retry to try again.', type: 'info', onConfirm: retry });
      } else {
        setNotification({ title: 'Vault Load Failed', message: error?.message || 'Could not load vault.', type: 'info', onConfirm: retry });
      }
    } finally {
      setLoading(false);
      fetchInventoryInFlightRef.current = null;
    }
    })();
    fetchInventoryInFlightRef.current = run;
    return run;
  }

  /** If Stripe shows paid but Supabase `subscriptions` is empty, link by matching account email to Stripe customer. */
  const syncVaultPlusFromStripe = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = (session as any)?.access_token;
    if (!accessToken || !session?.user?.id) {
      setNotification({ title: 'Sign in', message: 'Sign in to sync Vault+ from Stripe.', type: 'info' });
      return;
    }
    setSyncingVaultPlus(true);
    try {
      const res = await fetch('/api/stripe/sync-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, userId: session.user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.synced) {
        setSubscriptionStatus({ subscribed: true });
        setNotification({ title: 'Vault+ linked', message: data.message || 'Subscription synced.', type: 'success' });
      } else if (data.message) {
        setNotification({ title: 'Vault+ sync', message: data.message, type: 'info' });
      } else {
        setNotification({ title: 'Sync failed', message: data.error || `Could not sync (${res.status})`, type: 'error' });
      }
    } catch (e: any) {
      setNotification({ title: 'Sync failed', message: e?.message || 'Try again.', type: 'error' });
    } finally {
      setSyncingVaultPlus(false);
      setLoading(true);
      try {
        await supabase.auth.refreshSession();
      } catch {
        /* ignore */
      }
      await fetchInventory();
    }
  };

  // --- SELECTION & LOCATION HANDLERS ---
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredInventory.length && filteredInventory.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredInventory.map(i => i.id)));
    }
  };

  const updateLocation = async (id: string, newLoc: string) => {
    const { error } = await supabase.from('inventory').update({ location: newLoc }).eq('id', id);
    if (!error) {
      setInventory(inventory.map(i => i.id === id ? { ...i, location: newLoc } : i));
      setShowLocationMenuId(null);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('inventory').update({ status: status }).eq('id', id);
    if (!error) {
      setInventory(inventory.map(i => i.id === id ? { ...i, status: status } : i));
      setOpenMenuId(null);
      setNotification({ title: "Status Updated", message: `Item marked as ${status === 'active' ? 'Active' : 'Archived/Sold'}.`, type: 'success' });
    }
  };

  const addCustomTag = async (id: string) => {
    const tag = newTagInput.trim();
    if (!tag) return;
    const { error } = await supabase.from('inventory').update({ tag }).eq('id', id);
    if (error) {
      setNotification({ title: "Failed to add tag", message: error.message, type: 'error' });
    } else {
      setInventory(inventory.map(i => i.id === id ? { ...i, tag } : i));
      setShowTagMenuId(null);
      setNewTagInput('');
      // Persist tag to user's library for reuse on other items
      const session = (await supabase.auth.getSession()).data.session;
      const accessToken = (session as any)?.access_token;
      if (accessToken && user?.id) {
        try {
          await fetch('/api/add-user-tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, userId: user.id, tag }),
          });
          setSavedUserTags(prev => prev.includes(tag) ? prev : [...prev, tag].sort());
        } catch (_) { /* ignore - tag still works on item */ }
      }
    }
  };

  const updateTag = async (id: string, newTag: string) => {
    const { error } = await supabase.from('inventory').update({ tag: newTag }).eq('id', id);
    if (error) {
      setNotification({ title: "Failed to update tag", message: error.message, type: 'error' });
    } else {
      setInventory(inventory.map(i => i.id === id ? { ...i, tag: newTag } : i));
      setShowTagMenuId(null);
      setSavedUserTags(prev => prev.includes(newTag) ? prev : [...prev, newTag].sort());
      // Persist to user's tag library
      const session = (await supabase.auth.getSession()).data.session;
      const accessToken = (session as any)?.access_token;
      if (accessToken && user?.id) {
        fetch('/api/add-user-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: user.id, tag: newTag }),
        }).catch(() => {});
      }
    }
  };

  const clearTag = async (id: string) => {
    const { error } = await supabase.from('inventory').update({ tag: null }).eq('id', id);
    if (error) {
      setNotification({ title: "Failed to remove tag", message: error.message, type: 'error' });
    } else {
      setInventory(inventory.map(i => i.id === id ? { ...i, tag: null } : i));
      setShowTagMenuId(null);
    }
  };

  /** In-stock count per vault row (defaults to 1 if column missing). */
  const vaultItemStockQty = useCallback((item: { stock_qty?: unknown }) =>
    Math.min(999999, Math.max(1, Math.floor(Number(item.stock_qty)) || 1)), []);

  const updateStockQty = async (id: string, nextRaw: number) => {
    const next = vaultItemStockQty({ stock_qty: nextRaw });
    if (updatingStockId === id) return;
    setUpdatingStockId(id);
    try {
      const { error } = await supabase.from('inventory').update({ stock_qty: next }).eq('id', id);
      if (error) {
        setNotification({ title: 'Could not update stock', message: error.message, type: 'error' });
      } else {
        setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, stock_qty: next } : i)));
      }
    } finally {
      setUpdatingStockId(null);
    }
  };

  const deleteTagFromLibrary = async (tagToDelete: string) => {
    try {
      if (savedUserTags.includes(tagToDelete)) {
        const session = (await supabase.auth.getSession()).data.session;
        const accessToken = (session as any)?.access_token;
        if (!accessToken || !user?.id) {
          setNotification({ title: "Sign in required", message: "Please sign in to manage your tag library.", type: 'info' });
          return;
        }
        const res = await fetch('/api/delete-user-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, userId: user.id, tag: tagToDelete }),
        });
        if (!res.ok) {
          const err = await res.json();
          setNotification({ title: "Failed to remove tag", message: err?.error || 'Could not remove tag from library.', type: 'error' });
          return;
        }
        setSavedUserTags(prev => prev.filter(t => t !== tagToDelete));
      }
      // Clear this tag from any items that have it
      const itemsWithTag = inventory.filter(i => i.tag === tagToDelete);
      if (itemsWithTag.length > 0) {
        const { error } = await supabase.from('inventory').update({ tag: null }).eq('tag', tagToDelete);
        if (error) {
          setNotification({ title: "Tag removed from library", message: "Could not clear tag from some items.", type: 'info' });
        } else {
          setInventory(inventory.map(i => i.tag === tagToDelete ? { ...i, tag: null } : i));
        }
      }
      setShowTagMenuId(null);
    } catch (_) {
      setNotification({ title: "Error", message: "Could not remove tag from library.", type: 'error' });
    }
  };

  const addCustomLocation = async (id: string) => {
    if (!newLocationInput.trim()) return;
    setLocations(prev => Array.from(new Set([...prev, newLocationInput])));
    await updateLocation(id, newLocationInput);
    setNewLocationInput('');
  };

  const deleteLocation = (locToDelete: string) => {
    setLocations(locations.filter(l => l !== locToDelete));
  };

  // --- Image Crop Handlers ---
  const revokeCropBlobUrl = () => {
    if (cropBlobUrlRef.current) {
      URL.revokeObjectURL(cropBlobUrlRef.current);
      cropBlobUrlRef.current = null;
    }
  };

  const onFileSelect = (event: any, itemId: string) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_VAULT_PHOTO_UPLOAD_BYTES) {
      const mb = Math.round(MAX_VAULT_PHOTO_UPLOAD_BYTES / (1024 * 1024));
      setNotification({ title: "File Too Large", message: `Please select an image under ${mb} MB (or pick a smaller export from Photos).`, type: 'error' });
      return;
    }
    revokeCropBlobUrl();
    cropSourceFileRef.current = file;
    setCropIsExistingPhoto(false);
    try {
      const url = URL.createObjectURL(file);
      cropBlobUrlRef.current = url;
      setCropImage(url);
      setCropItemId(itemId);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setOpenMenuId(null);
    } catch {
      setNotification({ title: "Could not open photo", message: "Try choosing the same picture again, or use a JPEG/PNG from Photos.", type: 'error' });
    }
    event.target.value = '';
  };

  /** Load the item's current image into the cropper (re-zoom / rotate / re-frame without picking a new file). */
  const openExistingImageInCropper = async (itemId: string, imageUrl: string) => {
    const raw = imageUrl?.trim();
    if (!raw) return;
    setOpenMenuId(null);
    cropSourceFileRef.current = null;
    setCropIsExistingPhoto(true);
    try {
      const busted = raw.includes('?') ? `${raw}&vaultRecrop=${Date.now()}` : `${raw}?vaultRecrop=${Date.now()}`;
      const res = await fetch(busted, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('not image');
      revokeCropBlobUrl();
      const objectUrl = URL.createObjectURL(blob);
      cropBlobUrlRef.current = objectUrl;
      setCropImage(objectUrl);
      setCropItemId(itemId);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    } catch {
      setCropIsExistingPhoto(false);
      setNotification({
        title: 'Could not open current photo',
        message: 'Try “Change image” to pick the picture again from your device, or check your connection.',
        type: 'error',
      });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => setIsDragging(false);

  const performCropAndUpload = async () => {
    if (!canvasRef.current || !imageRef.current || !cropItemId) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const img = imageRef.current;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setUploadingId(cropItemId);
      const sourceFile = cropSourceFileRef.current;
      cropSourceFileRef.current = null;
      revokeCropBlobUrl();
      setCropImage(null);
      setCropIsExistingPhoto(false);
      const fileName = `${user.id}/${cropItemId}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, blob);
      if (uploadError) {
        setNotification({ title: "Upload Failed", message: "Could not upload cropped image.", type: 'error' });
        setUploadingId(null);
        setCropItemId(null);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);

      let imageOriginalUrl: string | undefined;
      const existingRow = inventory.find((it: any) => it.id === cropItemId);
      if (sourceFile) {
        const rawExt = (sourceFile.name.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(rawExt) ? rawExt : 'jpg';
        const origPath = `${user.id}/${cropItemId}-orig-${Date.now()}.${safeExt}`;
        const { error: origErr } = await supabase.storage.from('product-images').upload(origPath, sourceFile, {
          contentType: sourceFile.type || undefined,
          upsert: false,
        });
        if (!origErr) {
          const { data: { publicUrl: origPublic } } = supabase.storage.from('product-images').getPublicUrl(origPath);
          imageOriginalUrl = origPublic;
        }
      } else if (existingRow?.image_original_url) {
        imageOriginalUrl = existingRow.image_original_url;
      }

      const dbPayload: Record<string, string> = { image_url: publicUrl };
      if (imageOriginalUrl) dbPayload.image_original_url = imageOriginalUrl;

      const { error: dbError } = await supabase.from('inventory').update(dbPayload).eq('id', cropItemId);
      if (!dbError) {
        setInventory(inventory.map(item => item.id === cropItemId ? { ...item, ...dbPayload } : item));
        setNotification({ title: "Image Updated", message: "New photo saved successfully.", type: 'success' });
      }
      setUploadingId(null);
      setCropItemId(null);
    }, 'image/png');
  };

  const addMetalToPiece = () => {
    const w = Number(tempWeight);
    if (!Number.isFinite(w) || w <= 0) return;
    let currentSpot = 0;
    const type = tempMetal.toLowerCase();
    if (type.includes('gold')) currentSpot = prices.gold;
    else if (type.includes('silver')) currentSpot = prices.silver;
    else if (type.includes('platinum')) currentSpot = prices.platinum;
    else if (type.includes('palladium')) currentSpot = prices.palladium;

    const customSpotOzt = useManualPrice && manualPriceInput !== '' ? Number(manualPriceInput) : null;
    setMetalList(prev => [...prev, {
      type: tempMetal,
      weight: w,
      unit: tempUnit,
      isManual: useManualPrice,
      manualPrice: customSpotOzt != null && Number.isFinite(customSpotOzt) && customSpotOzt > 0 ? customSpotOzt : undefined,
      spotSaved: customSpotOzt != null && Number.isFinite(customSpotOzt) && customSpotOzt > 0 ? customSpotOzt : currentSpot
    }]);
    setTempWeight(''); setManualPriceInput(''); setUseManualPrice(false);
  };

  const addStoneToPiece = () => {
    const cost = Number(tempStoneCost);
    if (!Number.isFinite(cost) || cost <= 0) return;
    const stoneName = tempStoneName.trim() || `Stone ${stoneList.length + 1}`;
    setStoneList(prev => [...prev, {
      name: stoneName,
      cost,
      markup: Number(tempStoneMarkup) || 2
    }]);
    setIncludeStonesSection(true); // auto-include when user adds a stone
    setTempStoneName('');
    setTempStoneCost('');
    setTempStoneMarkup(2);
  };

  const deleteInventoryItem = async (id: string, name: string) => {
    setNotification({
      title: "Confirm Deletion",
      message: `Are you sure you want to permanently remove "${name}" from your Vault?`,
      type: 'confirm',
      onConfirm: async () => {
        const { error } = await supabase.from('inventory').delete().eq('id', id);
        if (!error) {
          setInventory(inventory.filter(item => item.id !== id));
          if (selectedItems.has(id)) {
            const newSet = new Set(selectedItems);
            newSet.delete(id);
            setSelectedItems(newSet);
          }
          setNotification({ title: "Deleted", message: `"${name}" has been removed.`, type: 'success' });
        } else {
          setNotification({ title: "Error", message: "Could not delete item.", type: 'error' });
        }
      }
    });
  };

  const renameItem = async (id: string) => {
    if (!newNameValue.trim()) return setEditingNameId(null);
    const { error } = await supabase.from('inventory').update({ name: newNameValue }).eq('id', id);
    if (!error) {
      setInventory(inventory.map(item => item.id === id ? { ...item, name: newNameValue } : item));
      setEditingNameId(null);
    } else {
      setNotification({ title: "Error", message: "Could not rename item.", type: 'error' });
    }
  };

  const saveNote = async (id: string, newNote: string) => {
    await supabase.from('inventory').update({ notes: newNote }).eq('id', id);
    fetchInventory();
  };

  const loadItemIntoCalculator = (item: any) => {
    setEditingItemId(item.id);
    setItemName(item.name || '');
    setMetalList(Array.isArray(item.metals) ? [...item.metals] : []);
    setStoneList(convertStonesToArray(item));
    setHours(item.hours ?? '');
    const h = Number(item.hours) || 0;
    const laborTotal = Number(item.labor_at_making) || 0;
    setRate(h > 0 ? laborTotal / h : laborTotal);
    setOtherCosts(item.other_costs_at_making ?? '');
    setOverheadCost(item.overhead_cost ?? '');
    setOverheadType((item.overhead_type as 'flat' | 'percent') || 'flat');
    setStrategy((item.strategy as 'A' | 'B' | 'custom') || 'A');
    setRetailMultA(Number(item.multiplier) || 2.5);
    setMarkupB(Number(item.markup_b) || 1.8);
    if (item.strategy === 'custom' && item.custom_formula) {
      setCustomFormulaModel({
        formula_base: item.custom_formula.formula_base || PRESET_A.base,
        formula_wholesale: item.custom_formula.formula_wholesale || PRESET_A.wholesale,
        formula_retail: item.custom_formula.formula_retail || PRESET_A.retail,
      });
      const formulaName = item.custom_formula.formula_name;
      const match = formulas.find(f => f.name === formulaName);
      setSelectedFormulaId(match?.id ?? null);
    } else {
      setSelectedFormulaId(null);
      setCustomFormulaModel({ formula_base: PRESET_A.base, formula_wholesale: PRESET_A.wholesale, formula_retail: PRESET_A.retail });
    }
    setIncludeStonesSection((item.stones && item.stones.length > 0) || (Number(item.stone_cost) || 0) > 0);
    setIncludeLaborSection((Number(item.hours) || 0) > 0 || (Number(item.labor_at_making) || 0) > 0);
    if (item.findings_retail_multiplier != null && item.findings_retail_multiplier !== '') {
      setFindingsRetailMultInput(String(item.findings_retail_multiplier));
    } else {
      setFindingsRetailMultInput('');
    }
    setActiveTab('calculator');
    setOpenMenuId(null);
  };

  const syncToMarket = async (item: any) => {
    setNotification({
      title: "Sync Prices",
      message: `Update "${(item.name || '').toUpperCase()}" to reflect current market spot prices?`,
      type: 'confirm',
      onConfirm: async () => {
        const stonesArray = convertStonesToArray(item);
        const current = calculateFullBreakdown(
          item.metals || [],
          1,
          item.labor_at_making || 0, // Using total labor cost as rate, with 1 hour
          item.other_costs_at_making || 0,
          stonesArray,
          item.overhead_cost || 0,
          (item.overhead_type as 'flat' | 'percent') || 'flat',
          item.multiplier,
          item.markup_b,
          undefined,
          undefined,
          undefined,
          findingsMultFromItem(item)
        );

        const itemPrices = getItemPrices(item, current);
        const liveRetail = roundForDisplay(itemPrices.retail);
        const liveWholesaleFinal = roundForDisplay(itemPrices.wholesale);

        const updatedMetals = item.metals.map((m: any) => {
          let currentSpot = 0;
          const type = m.type.toLowerCase();
          if (type.includes('gold')) currentSpot = prices.gold;
          else if (type.includes('silver')) currentSpot = prices.silver;
          else if (type.includes('platinum')) currentSpot = prices.platinum;
          else if (type.includes('palladium')) currentSpot = prices.palladium;

          return { ...m, spotSaved: currentSpot };
        });

        const { error } = await supabase.from('inventory').update({
          wholesale: liveWholesaleFinal,
          retail: liveRetail,
          metals: updatedMetals
        }).eq('id', item.id);

        if (!error) {
          fetchInventory();
          setOpenMenuId(null);
          setNotification({ title: "Vault Updated", message: `"${(item.name || '').toUpperCase()}" has been synced to live market prices.`, type: 'success' });
        }
      }
    });
  };

  const handleGlobalRecalcSync = async () => {
    const targetItems = selectedItems.size > 0
      ? inventory.filter(i => selectedItems.has(i.id))
      : inventory;

    const count = targetItems.length;
    const applyFormula = globalRecalcFormulaMode !== 'keep';
    const msg = applyFormula
      ? `Recalculate ${count} item(s) with these new parameters and apply ${globalRecalcFormulaMode === 'A' ? 'Formula A' : globalRecalcFormulaMode === 'B' ? 'Formula B' : `"${formulas.find(f => f.id === globalRecalcFormulaMode)?.name || 'custom'}"`} to all? This will overwrite saved labor costs, spot prices, and each item's formula.`
      : `Recalculate ${count} item(s) with these new parameters? This will overwrite saved labor costs and spot prices. Each item keeps its current formula.`;

    setNotification({
      title: `Recalculate ${selectedItems.size > 0 ? `Selected (${count})` : 'All'}`,
      message: msg,
      type: 'confirm',
      onConfirm: async () => {
        setBlockingWorkBanner({
          title: 'Updating vault',
          subtitle: `Saving recalculated prices for ${count} item(s)…`,
        });
        await yieldForWorkBannerPaint();
        setShowVaultMenu(false);

        try {
        const selectedCustomFormula = globalRecalcFormulaMode !== 'keep' && globalRecalcFormulaMode !== 'A' && globalRecalcFormulaMode !== 'B'
          ? formulas.find(f => f.id === globalRecalcFormulaMode)
          : null;

        const updates = targetItems.map(async (item) => {
          const laborHours = item.hours || 1;
          const newLaborCost = recalcParams.laborRate
            ? Number(recalcParams.laborRate) * laborHours
            : Number(item.labor_at_making || 0);

          const stonesArray = convertStonesToArray(item);
          const mult = globalRecalcFormulaMode === 'A' ? retailMultA : item.multiplier;
          const mark = globalRecalcFormulaMode === 'B' ? markupB : item.markup_b;
          const calc = calculateFullBreakdown(
            item.metals || [],
            1,
            newLaborCost,
            item.other_costs_at_making || 0,
            stonesArray,
            item.overhead_cost || 0,
            (item.overhead_type as 'flat' | 'percent') || 'flat',
            mult,
            mark,
            recalcParams,
            false,
            undefined,
            findingsMultFromItem(item)
          );

          const itemForPricing = applyFormula
            ? (globalRecalcFormulaMode === 'A'
              ? { ...item, strategy: 'A', custom_formula: null }
              : globalRecalcFormulaMode === 'B'
                ? { ...item, strategy: 'B', custom_formula: null }
                : selectedCustomFormula
                  ? { ...item, strategy: 'custom', custom_formula: { formula_base: selectedCustomFormula.formula_base, formula_wholesale: selectedCustomFormula.formula_wholesale, formula_retail: selectedCustomFormula.formula_retail, formula_name: selectedCustomFormula.name } }
                  : item) // fallback: keep current if custom formula not found
            : item;

          const itemPrices = getItemPrices(itemForPricing, calc);
          const newWholesale = roundForDisplay(itemPrices.wholesale);
          const newRetail = roundForDisplay(itemPrices.retail);

          const updatedMetals = (item.metals || []).map((m: any) => {
            const type = m.type.toLowerCase();
            let newSpot = m.spotSaved;

            if (type.includes('gold') && recalcParams.gold) newSpot = Number(recalcParams.gold);
            else if (type.includes('silver') && recalcParams.silver) newSpot = Number(recalcParams.silver);
            else if (type.includes('platinum') && recalcParams.platinum) newSpot = Number(recalcParams.platinum);
            else if (type.includes('palladium') && recalcParams.palladium) newSpot = Number(recalcParams.palladium);

            return { ...m, spotSaved: newSpot };
          });

          const updatePayload: Record<string, unknown> = {
            wholesale: newWholesale,
            retail: newRetail,
            labor_at_making: newLaborCost,
            metals: updatedMetals
          };

          if (applyFormula) {
            if (globalRecalcFormulaMode === 'A') {
              updatePayload.strategy = 'A';
              updatePayload.multiplier = retailMultA;
              updatePayload.markup_b = item.markup_b;
              updatePayload.custom_formula = null;
            } else if (globalRecalcFormulaMode === 'B') {
              updatePayload.strategy = 'B';
              updatePayload.multiplier = item.multiplier;
              updatePayload.markup_b = markupB;
              updatePayload.custom_formula = null;
            } else if (selectedCustomFormula) {
              updatePayload.strategy = 'custom';
              updatePayload.multiplier = item.multiplier;
              updatePayload.markup_b = item.markup_b;
              updatePayload.custom_formula = {
                formula_base: selectedCustomFormula.formula_base,
                formula_wholesale: selectedCustomFormula.formula_wholesale,
                formula_retail: selectedCustomFormula.formula_retail,
                formula_name: selectedCustomFormula.name
              };
            }
          }

          return supabase.from('inventory').update(updatePayload).eq('id', item.id);
        });

        await Promise.all(updates);
        await fetchInventory();
        setShowGlobalRecalc(false);
        setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
        setGlobalRecalcFormulaMode('keep');
        setNotification({ title: "Update Complete", message: `${count} items have been recalculated.`, type: 'success' });
        } catch (e: any) {
          setNotification({
            title: 'Recalculate failed',
            message: e?.message || 'Could not save all items. Try again or use a smaller selection.',
            type: 'error',
          });
        } finally {
          setBlockingWorkBanner(null);
        }
      }
    });
  };

  const handleManualPriceSave = async () => {
    if (!editingItem) return;
    const { error } = await supabase.from('inventory').update({ wholesale: Number(manualWholesale), retail: Number(manualRetail) }).eq('id', editingItem.id);
    if (!error) {
      fetchInventory();
      setEditingItem(null);
      setOpenEditId(null);
      setNotification({ title: "Vault Secured", message: "Manual price updates saved successfully.", type: 'success' });
    }
  };

  const handleRecalcSync = () => {
    if (!recalcItem) return;

    setNotification({
      title: "Confirm Update",
      message: `Overwrite "${(recalcItem.name || '').toUpperCase()}" with these new prices and costs? This cannot be undone.`,
      type: 'confirm',
      onConfirm: async () => {
      const laborHours = recalcItem.hours || 1;
      const newLaborCost = recalcParams.laborRate
        ? Number(recalcParams.laborRate) * laborHours
        : Number(recalcItem.labor_at_making || 0);

      const stonesArray = convertStonesToArray(recalcItem);
      const applyFormula = recalcItemFormulaMode !== 'keep';
      const selectedCustomFormula = recalcItemFormulaMode !== 'keep' && recalcItemFormulaMode !== 'A' && recalcItemFormulaMode !== 'B'
        ? formulas.find(f => f.id === recalcItemFormulaMode)
        : null;

      let mult = recalcItem.multiplier;
      let mark = recalcItem.markup_b;
      if (applyFormula) {
        if (recalcItemFormulaMode === 'A') mult = retailMultA;
        else if (recalcItemFormulaMode === 'B') mark = markupB;
      }

      const calc = calculateFullBreakdown(
        recalcItem.metals,
        1,
        newLaborCost,
        recalcItem.other_costs_at_making ?? 0,
        stonesArray,
        recalcItem.overhead_cost || 0,
        (recalcItem.overhead_type as 'flat' | 'percent') || 'flat',
        mult,
        mark,
        recalcParams,
        false,
        undefined,
        findingsMultFromItem(recalcItem)
      );

      const itemForPricing = applyFormula
        ? (recalcItemFormulaMode === 'A'
          ? { ...recalcItem, strategy: 'A', custom_formula: null }
          : recalcItemFormulaMode === 'B'
            ? { ...recalcItem, strategy: 'B', custom_formula: null }
            : selectedCustomFormula
              ? { ...recalcItem, strategy: 'custom', custom_formula: { formula_base: selectedCustomFormula.formula_base, formula_wholesale: selectedCustomFormula.formula_wholesale, formula_retail: selectedCustomFormula.formula_retail, formula_name: selectedCustomFormula.name } }
              : recalcItem)
        : recalcItem;

      const itemPrices = getItemPrices(itemForPricing, calc);
      const newWholesale = roundForDisplay(itemPrices.wholesale);
      const newRetail = roundForDisplay(itemPrices.retail);

      const updatedMetals = recalcItem.metals.map((m: any) => {
        const type = m.type.toLowerCase();
        let newSpot = m.spotSaved;

        if (type.includes('gold') && recalcParams.gold) newSpot = Number(recalcParams.gold);
        else if (type.includes('silver') && recalcParams.silver) newSpot = Number(recalcParams.silver);
        else if (type.includes('platinum') && recalcParams.platinum) newSpot = Number(recalcParams.platinum);
        else if (type.includes('palladium') && recalcParams.palladium) newSpot = Number(recalcParams.palladium);

        return { ...m, spotSaved: newSpot };
      });

      const updatePayload: Record<string, unknown> = {
        wholesale: newWholesale,
        retail: newRetail,
        labor_at_making: newLaborCost,
        metals: updatedMetals
      };

      if (applyFormula) {
        if (recalcItemFormulaMode === 'A') {
          updatePayload.strategy = 'A';
          updatePayload.multiplier = retailMultA;
          updatePayload.markup_b = recalcItem.markup_b;
          updatePayload.custom_formula = null;
        } else if (recalcItemFormulaMode === 'B') {
          updatePayload.strategy = 'B';
          updatePayload.multiplier = recalcItem.multiplier;
          updatePayload.markup_b = markupB;
          updatePayload.custom_formula = null;
        } else if (selectedCustomFormula) {
          updatePayload.strategy = 'custom';
          updatePayload.multiplier = recalcItem.multiplier;
          updatePayload.markup_b = recalcItem.markup_b;
          updatePayload.custom_formula = {
            formula_base: selectedCustomFormula.formula_base,
            formula_wholesale: selectedCustomFormula.formula_wholesale,
            formula_retail: selectedCustomFormula.formula_retail,
            formula_name: selectedCustomFormula.name
          };
        }
      }

      const { error } = await supabase.from('inventory').update(updatePayload).eq('id', recalcItem.id);

      if (!error) {
        fetchInventory();
        setRecalcItem(null);
        setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
        setRecalcItemFormulaMode('keep');
        setNotification({ title: "Vault Updated", message: "Item prices and costs have been updated successfully.", type: 'success' });
      } else {
        setNotification({ title: "Update Failed", message: "Could not sync new prices to Vault.", type: 'error' });
      }
      }
    });
  };

  const addToInventory = async () => {
    if (savingToVault) return;

    // Check if Supabase is configured
    if (!hasValidSupabaseCredentials) {
      setNotification({ 
        title: "Database Not Configured", 
        message: "Please configure Supabase credentials in .env.local to save items to the vault. The calculator still works for pricing!", 
        type: 'error' 
      });
      return;
    }

    let currentUser = user;
    if (!currentUser) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user;
        if (!currentUser) {
          const { data: anonData } = await supabase.auth.signInAnonymously();
          currentUser = anonData?.user;
        }
      } catch (error) {
        console.error('Supabase auth error:', error);
        setNotification({ 
          title: "Authentication Error", 
          message: "Could not authenticate. Please check your Supabase configuration.", 
          type: 'error' 
        });
        return;
      }
    }
    if (!currentUser) { setShowAuth(true); return; }
    if (subscriptionStatus && !subscriptionStatus.subscribed) {
      setShowVaultPlusModal(true);
      return;
    }
    // Only require Turnstile verification if site key is configured (production)
    if (isGuest && !token && hasTurnstile) {
      setNotification({ title: "Verification Required", message: "Please complete the human verification to save items as a guest.", type: 'info' });
      return;
    }
    if (!itemName) {
      setNotification({ title: "Name Required", message: "Please provide a name for this piece to save it to your Vault.", type: 'info' });
      return;
    }
    const isUpdating = !!editingItemId;
    const isDraft = saveAsDraft && !isUpdating;
    if (!isDraft && metalList.length === 0) {
      setNotification({ title: "Add Metal", message: "Add at least one metal component to save this piece.", type: 'info' });
      return;
    }

    let newItem: any;
    if (isDraft) {
      newItem = {
        name: itemName,
        metals: [],
        stones: [],
        wholesale: 0,
        retail: 0,
        materials_at_making: 0,
        labor_at_making: 0,
        other_costs_at_making: 0,
        stone_cost: 0,
        stone_markup: 1.5,
        overhead_cost: 0,
        overhead_type: 'flat',
        strategy: 'A',
        multiplier: 2.5,
        markup_b: 1.8,
        custom_formula: null,
        user_id: currentUser.id,
        notes: '',
        hours: 0,
        location: 'Main Vault',
        tag: null,
        status: 'draft',
        stock_qty: 1,
      };
    } else if (isUpdating) {
      const preserveStock = vaultItemStockQty(
        inventory.find((i) => i.id === editingItemId) ?? { stock_qty: 1 }
      );
      const a = calculateFullBreakdown(metalList, hours, rate, otherCosts, stoneList, overheadCost, overheadType, undefined, undefined, undefined, false, undefined, calculatorFindingsMult);
      const { wholesale, retail } = getStrategyPrices(a);
      newItem = {
        id: editingItemId,
        name: itemName,
        metals: metalList,
        stones: stoneList,
        wholesale,
        retail,
        materials_at_making: a.metalCost,
        labor_at_making: a.labor,
        other_costs_at_making: Number(otherCosts) || 0,
        stone_cost: a.stones,
        stone_markup: (stoneList.length > 0 && a.stones > 0) ? stoneList.reduce((sum, s) => sum + (s.cost * s.markup), 0) / a.stones : 1.5,
        overhead_cost: overheadType === 'percent' ? (Number(overheadCost) || 0) : a.overhead,
        overhead_type: overheadType,
        strategy: strategy,
        multiplier: retailMultA,
        markup_b: markupB,
        custom_formula: strategy === 'custom' ? (selectedFormulaId ? { ...customFormulaModel, formula_name: formulas.find(f => f.id === selectedFormulaId)?.name || null } : customFormulaModel) : null,
        findings_retail_multiplier: strategy === 'custom' ? null : (findingsRetailMultInput.trim() === '' ? null : Number(findingsRetailMultInput)),
        hours: Number(hours) || 0,
        status: 'active',
        stock_qty: preserveStock,
      };
    } else {
      const useManualForInitialSave = metalList.some((m: any) => m.isManual && m.manualPrice);
      const a = calculateFullBreakdown(metalList, hours, rate, otherCosts, stoneList, overheadCost, overheadType, undefined, undefined, undefined, useManualForInitialSave, undefined, calculatorFindingsMult);
      const { wholesale, retail } = getStrategyPrices(a);
      newItem = {
        name: itemName,
        metals: metalList,
        stones: stoneList,
        wholesale,
        retail,
        materials_at_making: a.metalCost,
        labor_at_making: a.labor,
        other_costs_at_making: Number(otherCosts) || 0,
        stone_cost: a.stones,
        stone_markup: (stoneList.length > 0 && a.stones > 0) ? stoneList.reduce((sum, s) => sum + (s.cost * s.markup), 0) / a.stones : 1.5,
        overhead_cost: overheadType === 'percent' ? (Number(overheadCost) || 0) : a.overhead,
        overhead_type: overheadType,
        strategy: strategy,
        multiplier: retailMultA,
        markup_b: markupB,
        custom_formula: strategy === 'custom' ? (selectedFormulaId ? { ...customFormulaModel, formula_name: formulas.find(f => f.id === selectedFormulaId)?.name || null } : customFormulaModel) : null,
        findings_retail_multiplier: strategy === 'custom' ? null : (findingsRetailMultInput.trim() === '' ? null : Number(findingsRetailMultInput)),
        user_id: currentUser.id,
        notes: '',
        hours: Number(hours) || 0,
        location: 'Main Vault',
        tag: null,
        status: 'active',
        stock_qty: 1,
      };
    }

    setSavingToVault(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = (session as any)?.access_token;
      if (!accessToken) {
        setNotification({ title: 'Session Error', message: 'Could not get access token. Try signing in again.', type: 'error' });
        setSavingToVault(false);
        return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/save-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newItem, itemId: editingItemId || undefined, accessToken }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      let data = null;
      let errBody: { error?: string; code?: string } = {};
      if (res.ok) {
        data = await res.json();
      } else {
        errBody = await res.json().catch(() => ({}));
      }
      if (res.status === 402 && errBody?.code === 'PAYWALL_VAULT') {
        setShowVaultPlusModal(true);
      } else if (res.ok && data) {
        if (editingItemId) {
          setInventory(prev => prev.map(i => i.id === editingItemId ? { ...i, ...data } : i));
          setNotification({ title: "Item Updated", message: `"${(newItem.name || '').toUpperCase()}" now has metals and pricing.`, type: 'success' });
        } else {
          setInventory(prev => [data, ...prev]);
          setNotification({ title: "Item Saved", message: `"${(newItem.name || '').toUpperCase()}" is now stored in your Vault.`, type: 'success' });
        }
        setEditingItemId(null);
        // Reset calculator to original state
        setItemName('');
        setMetalList([]);
        setStoneList([]);
        setHours('');
        setRate('');
        setOtherCosts('');
        setOverheadCost('');
        setTempStoneName('');
        setTempStoneCost('');
        setTempStoneMarkup(2);
        setTempMetal('Sterling Silver');
        setTempWeight('');
        setTempUnit('Ounces (std)');
        setUseManualPrice(false);
        setManualPriceInput('');
        setIncludeStonesSection(false);
        setIncludeLaborSection(false);
        setActiveCalculatorTab('metal');
        setStrategy('A');
        setRetailMultA(2.5);
        setMarkupB(1.8);
        setFindingsRetailMultInput('');
        setCostBreakdownOpen(false);
        setFormulaAOpen(false);
        setFormulaBOpen(false);
        setToken(null);
        setSaveAsDraft(false);
        if (!user) setUser(currentUser);
      } else {
        const msg = errBody?.error || `Save failed (${res.status})`;
        const hint = errBody?.code === '42501' || msg?.includes('policy') ? ' Check that the inventory table exists and has correct columns.' : '';
        setNotification({ title: "Save Failed", message: msg + hint, type: 'error' });
      }
    } catch (error: any) {
      console.error('Save error:', error);
      const msg = error?.name === 'AbortError' ? 'Request timed out. Check your internet connection.' : (error?.message || 'Could not save.');
      setNotification({ title: "Save Failed", message: msg, type: 'error' });
    } finally {
      setSavingToVault(false);
    }
  };

  const addQuickAddPiece = async () => {
    const name = quickAddPieceName.trim();
    if (!name) {
      setNotification({ title: "Name Required", message: "Please enter a name for this piece.", type: 'info' });
      return;
    }
    if (!hasValidSupabaseCredentials) {
      setNotification({ title: "Database Not Configured", message: "Please configure Supabase to save pieces.", type: 'error' });
      return;
    }
    let currentUser = user;
    if (!currentUser) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user;
        if (!currentUser) {
          const { data: anonData } = await supabase.auth.signInAnonymously();
          currentUser = anonData?.user;
        }
      } catch (_) {}
      if (!currentUser) { setShowAuth(true); setShowQuickAddPiece(false); return; }
    }
    if (subscriptionStatus && !subscriptionStatus.subscribed) {
      setShowVaultPlusModal(true);
      setShowQuickAddPiece(false);
      return;
    }
    if (isGuest && !token && hasTurnstile) {
      setNotification({ title: "Verification Required", message: "Please complete verification to save.", type: 'info' });
      return;
    }
    const newItem = {
      name,
      metals: [],
      stones: [],
      wholesale: 0,
      retail: 0,
      materials_at_making: 0,
      labor_at_making: 0,
      other_costs_at_making: 0,
      stone_cost: 0,
      stone_markup: 1.5,
      overhead_cost: 0,
      overhead_type: 'flat',
      strategy: 'A',
      multiplier: 2.5,
      markup_b: 1.8,
      custom_formula: null,
      user_id: currentUser.id,
      notes: '',
      hours: 0,
      location: 'Main Vault',
      tag: null,
      status: 'draft'
    };
    setSavingToVault(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = (session as any)?.access_token;
      if (!accessToken) {
        setNotification({ title: "Session Error", message: "Please sign in again.", type: 'error' });
        setSavingToVault(false);
        return;
      }
      const res = await fetch('/api/save-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newItem, accessToken }),
      });
      const data = res.ok ? await res.json() : null;
      const errBody = !res.ok ? await res.json().catch(() => ({})) : {};
      if (res.status === 402 && errBody?.code === 'PAYWALL_VAULT') {
        setShowVaultPlusModal(true);
        setShowQuickAddPiece(false);
      } else if (res.ok && data) {
        setInventory(prev => [data, ...prev]);
        setQuickAddPieceName('');
        setShowQuickAddPiece(false);
        setNotification({ title: "Piece Added", message: `"${name}" has been added. Add metal and time as you work.`, type: 'success' });
      } else {
        setNotification({ title: "Save Failed", message: errBody?.error || `Save failed (${res.status})`, type: 'error' });
      }
    } catch (e: any) {
      setNotification({ title: "Save Failed", message: e?.message || 'Could not save.', type: 'error' });
    } finally {
      setSavingToVault(false);
    }
  };

  const saveTimeEntry = async () => {
    const hrs = parseFloat(logTimeHours);
    if (!Number.isFinite(hrs) || hrs <= 0) {
      setNotification({ title: "Invalid Time", message: "Enter a valid number of hours (e.g. 2.5).", type: 'info' });
      return;
    }
    const currentUser = user || (await supabase.auth.getUser()).data?.user;
    if (!currentUser) { setShowAuth(true); return; }
    if (subscriptionStatus && !subscriptionStatus.subscribed) {
      setShowVaultPlusModal(true);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setNotification({ title: "Session Error", message: "Please sign in again.", type: 'info' });
      return;
    }
    const duration_minutes = Math.round(hrs * 60);
    try {
      const res = await fetch('/api/save-time-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          userId: currentUser.id,
          inventory_id: logTimeItemId || null,
          duration_minutes,
          note: logTimeNote.trim() || null,
          logged_on: logTimeDate.trim() || localTodayYYYYMMDD(),
        }),
      });
      const data = res.ok ? await res.json() : null;
      const errBody = !res.ok ? await res.json().catch(() => ({})) : {};
      if (res.status === 402 && errBody?.code === 'PAYWALL_TIME') {
        setShowVaultPlusModal(true);
      } else if (res.ok && data) {
        setTimeEntries(prev => [data, ...prev]);
        setShowLogTimeModal(false);
        setLogTimeItemId(null);
        setLogTimeHours('');
        setLogTimeDate('');
        setLogTimeNote('');
        setLogTimeAllowItemSelect(false);
        setTimerStartedAt(null);
        setTimerPausedElapsed(0);
        setNotification({ title: "Time Logged", message: `${hrs}h added successfully.`, type: 'success' });
      } else {
        setNotification({ title: "Failed", message: errBody?.error || 'Could not save time.', type: 'error' });
      }
    } catch (e: any) {
      setNotification({ title: "Failed", message: e?.message || 'Could not save time.', type: 'error' });
    }
  };

  const updateTimeEntry = async () => {
    if (!editingTimeEntryId) return;
    const hrs = parseFloat(logTimeHours);
    if (!Number.isFinite(hrs) || hrs <= 0) {
      setNotification({ title: "Invalid Time", message: "Enter a valid number of hours (e.g. 2.5).", type: 'info' });
      return;
    }
    const currentUser = user || (await supabase.auth.getUser()).data?.user;
    if (!currentUser) { setShowAuth(true); return; }
    if (subscriptionStatus && !subscriptionStatus.subscribed) {
      setShowVaultPlusModal(true);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setNotification({ title: "Session Error", message: "Please sign in again.", type: 'info' });
      return;
    }
    const duration_minutes = Math.round(hrs * 60);
    try {
      const res = await fetch('/api/update-time-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          userId: currentUser.id,
          entryId: editingTimeEntryId,
          inventory_id: logTimeItemId || null,
          duration_minutes,
          note: logTimeNote.trim() || null,
          logged_on: logTimeDate.trim() || localTodayYYYYMMDD(),
        }),
      });
      const data = res.ok ? await res.json() : null;
      const errBody = !res.ok ? await res.json().catch(() => ({})) : {};
      if (res.status === 402 && errBody?.code === 'PAYWALL_TIME') {
        setShowVaultPlusModal(true);
      } else if (res.ok && data) {
        setTimeEntries(prev => prev.map(t => t.id === data.id ? data : t));
        setShowLogTimeModal(false);
        setEditingTimeEntryId(null);
        setLogTimeItemId(null);
        setLogTimeHours('');
        setLogTimeDate('');
        setLogTimeNote('');
        setLogTimeAllowItemSelect(false);
        setNotification({ title: "Time Updated", message: `${hrs}h updated successfully.`, type: 'success' });
      } else {
        setNotification({ title: "Update Failed", message: errBody?.error || 'Could not update time.', type: 'error' });
      }
    } catch (e: any) {
      setNotification({ title: "Failed", message: e?.message || 'Could not update time.', type: 'error' });
    }
  };

  const deleteTimeEntry = async (entryId: string) => {
    if (!confirm('Delete this time entry?')) return;
    const currentUser = user || (await supabase.auth.getUser()).data?.user;
    if (!currentUser) { setShowAuth(true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setNotification({ title: "Session Error", message: "Please sign in again.", type: 'info' });
      return;
    }
    setDeletingTimeEntryId(entryId);
    try {
      const res = await fetch('/api/delete-time-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, entryId }),
      });
      const errBody = !res.ok ? await res.json().catch(() => ({})) : {};
      if (res.ok) {
        setTimeEntries(prev => prev.filter(t => t.id !== entryId));
        setNotification({ title: "Entry Deleted", message: "Time entry removed.", type: 'success' });
      } else {
        setNotification({ title: "Delete Failed", message: errBody?.error || 'Could not delete entry.', type: 'error' });
      }
    } catch (e: any) {
      setNotification({ title: "Failed", message: e?.message || 'Could not delete entry.', type: 'error' });
    } finally {
      setDeletingTimeEntryId(null);
    }
  };

  const openEditTimeModal = (e: any) => {
    setEditingTimeEntryId(e.id);
    setLogTimeItemId(e.inventory_id || null);
    setLogTimeHours((Number(e.duration_minutes) / 60).toFixed(2));
    setLogTimeDate(
      e.logged_on && /^\d{4}-\d{2}-\d{2}$/.test(e.logged_on)
        ? e.logged_on
        : formatLocalDateYYYYMMDD(new Date(e.created_at))
    );
    setLogTimeNote(e.note || '');
    setLogTimeAllowItemSelect(true);
    setShowLogTimeModal(true);
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const lowerTerm = searchTerm.toLowerCase();
      if (searchTerm) {
        const matchName = item.name.toLowerCase().includes(lowerTerm);
        const matchMetal = (item.metals || []).some((m: any) => m?.type?.toLowerCase().includes(lowerTerm));
        const matchNotes = item.notes && item.notes.toLowerCase().includes(lowerTerm);
        const matchLocation = item.location && item.location.toLowerCase().includes(lowerTerm);
        const matchTag = item.tag && item.tag.toLowerCase().includes(lowerTerm);
        const matchDate = new Date(item.created_at).toLocaleDateString().includes(searchTerm);
        if (!matchName && !matchMetal && !matchNotes && !matchLocation && !matchTag && !matchDate) return false;
      }

      if (filterLocation !== 'All' && (item.location || 'Main Vault') !== filterLocation) return false;
      if (filterTag !== 'All' && item.tag !== filterTag) return false;
      if (filterStrategy !== 'All' && item.strategy !== filterStrategy) return false;
      if (filterMetal !== 'All') {
        if (!(item.metals || []).some((m: any) => m?.type?.toLowerCase().includes(filterMetal.toLowerCase()))) return false;
      }

      const itemStatus = item.status || 'active';
      if (filterStatus === 'Active' && itemStatus !== 'active') return false;
      if (filterStatus === 'Archived' && (itemStatus === 'active' || itemStatus === 'draft')) return false;
      if (filterStatus === 'Draft' && itemStatus !== 'draft') return false;

      if (filterStartDate || filterEndDate) {
        const itemDate = new Date(item.created_at).getTime();
        if (filterStartDate && itemDate < new Date(filterStartDate).getTime()) return false;
        if (filterEndDate) {
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end.getTime()) return false;
        }
      }

      if (filterMinPrice || filterMaxPrice) {
        const stonesArray = convertStonesToArray(item);
        const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat', item.multiplier, item.markup_b, undefined, undefined, undefined, findingsMultFromItem(item));
        const itemPrices = getItemPrices(item, current);
        const liveRetail = itemPrices.retail;

        if (filterMinPrice && liveRetail < Number(filterMinPrice)) return false;
        if (filterMaxPrice && liveRetail > Number(filterMaxPrice)) return false;
      }

      return true;
    });
  }, [inventory, searchTerm, filterLocation, filterTag, filterStrategy, filterMetal, filterStatus, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate, prices]);

  const compareFilteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const lowerTerm = compareSearchTerm.toLowerCase();
      if (compareSearchTerm) {
        const matchName = item.name.toLowerCase().includes(lowerTerm);
        const matchMetal = (item.metals || []).some((m: any) => m?.type?.toLowerCase().includes(lowerTerm));
        const matchNotes = item.notes && item.notes.toLowerCase().includes(lowerTerm);
        const matchLocation = item.location && item.location.toLowerCase().includes(lowerTerm);
        const matchTag = item.tag && item.tag.toLowerCase().includes(lowerTerm);
        const matchDate = new Date(item.created_at).toLocaleDateString().includes(compareSearchTerm);
        if (!matchName && !matchMetal && !matchNotes && !matchLocation && !matchTag && !matchDate) return false;
      }
      if (compareFilterLocation !== 'All' && (item.location || 'Main Vault') !== compareFilterLocation) return false;
      if (compareFilterTag !== 'All' && item.tag !== compareFilterTag) return false;
      if (compareFilterStrategy !== 'All' && item.strategy !== compareFilterStrategy) return false;
      if (compareFilterMetal !== 'All') {
        if (!(item.metals || []).some((m: any) => m?.type?.toLowerCase().includes(compareFilterMetal.toLowerCase()))) return false;
      }
      const itemStatus = item.status || 'active';
      if (compareFilterStatus === 'Active' && itemStatus !== 'active') return false;
      if (compareFilterStatus === 'Archived' && (itemStatus === 'active' || itemStatus === 'draft')) return false;
      if (compareFilterStatus === 'Draft' && itemStatus !== 'draft') return false;
      return true;
    });
  }, [inventory, compareSearchTerm, compareFilterLocation, compareFilterTag, compareFilterStrategy, compareFilterMetal, compareFilterStatus]);

  const uniqueTags = useMemo(() => {
    const fromItems = inventory.map((i: any) => i.tag).filter(Boolean);
    const merged = [...new Set([...savedUserTags, ...fromItems])];
    return merged.sort() as string[];
  }, [inventory, savedUserTags]);

  const trackedTimeByItem = useMemo(() => {
    const byItem: Record<string, number> = {};
    for (const e of timeEntries) {
      const key = e.inventory_id || '_unassigned';
      byItem[key] = (byItem[key] || 0) + Number(e.duration_minutes || 0);
    }
    return byItem;
  }, [timeEntries]);

  const filteredTimeEntries = useMemo(() => {
    let list = [...timeEntries];
    if (timeFilterDateFrom) {
      const from = new Date(timeFilterDateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter(e => entryWorkLocalDay(e) >= from);
    }
    if (timeFilterDateTo) {
      const to = new Date(timeFilterDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(e => entryWorkLocalDay(e) <= to);
    }
    if (timeFilterItemId) {
      if (timeFilterItemId === '_unassigned') {
        list = list.filter(e => !e.inventory_id);
      } else {
        list = list.filter(e => e.inventory_id === timeFilterItemId);
      }
    }
    return list;
  }, [timeEntries, timeFilterDateFrom, timeFilterDateTo, timeFilterItemId]);

  const timeSummaryToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return timeEntries
      .filter(e => {
        const d = entryWorkLocalDay(e);
        return d >= today && d <= end;
      })
      .reduce((sum, e) => sum + Number(e.duration_minutes || 0), 0);
  }, [timeEntries]);

  const timeSummaryThisWeek = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return timeEntries
      .filter(e => entryWorkLocalDay(e) >= weekStart)
      .reduce((sum, e) => sum + Number(e.duration_minutes || 0), 0);
  }, [timeEntries]);

  const totalVaultValue = useMemo(() => {
    return inventory.reduce((acc, item) => {
      if (item.status === 'archived' || item.status === 'sold' || item.status === 'draft') return acc;
      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat', item.multiplier, item.markup_b, undefined, undefined, undefined, findingsMultFromItem(item));
      const itemPrices = getItemPrices(item, current);
      const qty = vaultItemStockQty(item);
      return acc + itemPrices.retail * qty;
    }, 0);
  }, [inventory, prices, calculateFullBreakdown, vaultItemStockQty]);

  const exportToCSV = () => {
    void (async () => {
      setBlockingWorkBanner({
        title: 'Preparing CSV',
        subtitle:
          'Crunching numbers for your export. Your download should start in a moment — on iPhone, use the share sheet or Files.',
      });
      await yieldForWorkBannerPaint();
      try {
    const targetItems = selectedItems.size > 0
      ? filteredInventory.filter(i => selectedItems.has(i.id))
      : filteredInventory;

    const preparedFor = profile?.company_name || profile?.display_name;
    const headerRows: string[] = [];
    if (preparedFor) {
      headerRows.push(`"Prepared for: ${preparedFor}"`);
      headerRows.push(`"Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"`);
      headerRows.push('');
    }

    const headers = [
      "Item Name",
      "Stock qty",
      "Status",
      "Tag",
      "Location",
      "Live Retail (unit)",
      "Live Wholesale (unit)",
      "Saved Retail (unit)",
      "Saved Wholesale (unit)",
      "Live Retail (× qty)",
      "Live Wholesale (× qty)",
      "Saved Retail (× qty)",
      "Saved Wholesale (× qty)",
      "Labor Hours",
      "Labor Cost",
      "Materials Cost",
      "Other Costs",
      "Stone Retail",
      "Stone Cost",
      "Stone Markup",
      "Overhead Cost",
      "Overhead Type",
      "Notes",
      "Date Created",
      "Formula",
      "Metals",
      "Image URL",
    ];
    const rows = targetItems.map(item => {
      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat', item.multiplier, item.markup_b, undefined, undefined, undefined, findingsMultFromItem(item));
      const itemPrices = getItemPrices(item, current);
      const liveWholesale = itemPrices.wholesale;
      const liveRetail = itemPrices.retail;
      const metalsStr = item.metals.map((m: any) => `${m.weight}${m.unit} ${m.type}`).join('; ');
      const q = vaultItemStockQty(item);

      const stoneRetail = current.stoneRetail || 0;
      const stoneCost = current.stones || 0;
      const stoneMarkup = stoneCost > 0 ? stoneRetail / stoneCost : 1.5;

      return [
        `"${vaultExportItemTitle(item.name)}"`,
        q,
        `"${item.status || 'active'}"`,
        `"${item.tag || ''}"`,
        `"${item.location || 'Main Vault'}"`,
        roundForDisplay(liveRetail).toFixed(2),
        roundForDisplay(liveWholesale).toFixed(2),
        roundForDisplay(Number(item.retail)).toFixed(2),
        roundForDisplay(Number(item.wholesale)).toFixed(2),
        roundForDisplay(liveRetail * q).toFixed(2),
        roundForDisplay(liveWholesale * q).toFixed(2),
        roundForDisplay(Number(item.retail) * q).toFixed(2),
        roundForDisplay(Number(item.wholesale) * q).toFixed(2),
        item.hours || 0,
        Number(item.labor_at_making || 0).toFixed(2),
        (Number(current.metalCost)).toFixed(2),
        Number(item.other_costs_at_making).toFixed(2),
        stoneRetail.toFixed(2),
        stoneCost.toFixed(2),
        stoneMarkup.toFixed(2),
        Number(item.overhead_cost || 0).toFixed(2),
        `"${item.overhead_type || 'flat'}"`,
        `"${item.notes?.replace(/"/g, '""') || ''}"`,
        new Date(item.created_at).toLocaleDateString(),
        item.strategy,
        `"${metalsStr}"`,
        `"${item.image_url || ''}"`
      ];
    });
    const csvContent = "data:text/csv;charset=utf-8," + [...headerRows, headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri); link.setAttribute("download", "bear-vault-inventory.csv");
    document.body.appendChild(link); link.click();
    setShowVaultMenu(false);
      } catch (e: any) {
        setNotification({
          title: 'CSV export failed',
          message: e?.message || 'Could not build the spreadsheet.',
          type: 'error',
        });
      } finally {
        setBlockingWorkBanner(null);
      }
    })();
  };

  const exportSiteProductCsv = () => {
    void (async () => {
      setBlockingWorkBanner({
        title: 'Preparing site CSV',
        subtitle:
          'Building your product file. Your download should start in a moment — on iPhone, use the share sheet or Files.',
      });
      await yieldForWorkBannerPaint();
      try {
        const targetItems =
          selectedItems.size > 0
            ? filteredInventory.filter((i) => selectedItems.has(i.id))
            : filteredInventory;
        if (targetItems.length === 0) {
          setNotification({
            title: 'No items',
            message: 'Select items or add some to the vault first.',
            type: 'info',
          });
          return;
        }

        let itemPrices: Record<string, { retail: number; wholesale: number }> | undefined;
        const needsLivePrices =
          shopifyPriceSource === 'live' &&
          (siteCsvPlatform === 'shopify' ||
            (siteCsvPlatform === 'squarespace' && shopifyIncludeWholesalePctOfRetail));
        if (needsLivePrices) {
          itemPrices = {};
          for (const item of targetItems) {
            const stonesArray = convertStonesToArray(item);
            const h = item.hours || 0;
            const laborTotal = item.labor_at_making || 0;
            const r = h > 0 ? laborTotal / h : laborTotal;
            const breakdown = calculateFullBreakdown(
              item.metals || [],
              h || 1,
              r,
              item.other_costs_at_making || 0,
              stonesArray,
              item.overhead_cost || 0,
              (item.overhead_type as 'flat' | 'percent') || 'flat',
              item.multiplier,
              item.markup_b,
              undefined,
              undefined,
              undefined,
              findingsMultFromItem(item)
            );
            const prices = getItemPrices(item, breakdown);
            itemPrices[item.id] = { retail: prices.retail, wholesale: prices.wholesale };
          }
        }

        const isShopify = siteCsvPlatform === 'shopify';
        const csv = isShopify
          ? buildShopifyProductCsv(targetItems, {
              includeDescription: shopifyIncludeDescription,
              includeImage: shopifyIncludeImage,
              includeRetail: shopifyIncludeRetail,
              includeWholesale: shopifyIncludeWholesale,
              includeWholesalePctOfRetail: shopifyIncludeWholesalePctOfRetail,
              priceSource: shopifyPriceSource,
              priceRounding,
              itemLivePrices: itemPrices,
              getQuantity: (item) => vaultItemStockQty(item),
            })
          : buildSquarespaceProductCsv(targetItems, {
              includeDescription: shopifyIncludeDescription,
              includeWholesalePctOfRetail: shopifyIncludeWholesalePctOfRetail,
              priceSource: shopifyPriceSource,
              priceRounding,
              itemLivePrices: itemPrices,
            });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = isShopify
          ? 'bear-vault-shopify-products.csv'
          : 'bear-vault-squarespace-products.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setShowSiteProductCsvModal(false);
        setShowVaultMenu(false);
      } catch (e: any) {
        setNotification({
          title: 'CSV export failed',
          message: e?.message || 'Could not build the file.',
          type: 'error',
        });
      } finally {
        setBlockingWorkBanner(null);
      }
    })();
  };

  const exportToShopify = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = (session as any)?.access_token;
    if (!accessToken || !user?.id) {
      setNotification({ title: 'Sign in required', message: 'Please sign in to export to Shopify.', type: 'info' });
      return;
    }
    const targetItems = selectedItems.size > 0
      ? filteredInventory.filter(i => selectedItems.has(i.id))
      : filteredInventory;
    if (targetItems.length === 0) {
      setNotification({ title: 'No items', message: 'Select items or add some to the vault first.', type: 'info' });
      return;
    }
    setShopifyExporting(true);
    setShopifyExportProgress('exporting');
    try {
      let itemPrices: Record<string, { retail: number; wholesale: number }> | undefined;
      if (shopifyPriceSource === 'live') {
        itemPrices = {};
        for (const item of targetItems) {
          const stonesArray = convertStonesToArray(item);
          const h = item.hours || 0;
          const laborTotal = item.labor_at_making || 0;
          const r = h > 0 ? laborTotal / h : laborTotal;
          const breakdown = calculateFullBreakdown(
            item.metals || [],
            h || 1,
            r,
            item.other_costs_at_making || 0,
            stonesArray,
            item.overhead_cost || 0,
            (item.overhead_type as 'flat' | 'percent') || 'flat',
            item.multiplier,
            item.markup_b,
            undefined,
            undefined,
            undefined,
            findingsMultFromItem(item)
          );
          const prices = getItemPrices(item, breakdown);
          itemPrices[item.id] = { retail: prices.retail, wholesale: prices.wholesale };
        }
      }
      const exportOptions = {
        includeDescription: shopifyIncludeDescription,
        includeImage: shopifyIncludeImage,
        includeRetail: shopifyIncludeRetail,
        includeWholesale: shopifyIncludeWholesale,
        priceSource: shopifyPriceSource,
        priceRounding,
      };
      const res = await fetch('/api/shopify/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          itemIds: targetItems.map(i => i.id),
          exportOptions,
          itemPrices: itemPrices ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShopifyExportProgress({ created: 0, updated: 0, errors: [data?.error || 'Could not export to Shopify.'] });
        return;
      }
      const { created = 0, updated = 0, errors = [] } = data;
      setShopifyExportProgress({ created, updated, errors: Array.isArray(errors) ? errors : [String(errors)] });
    } catch (e: any) {
      setShopifyExportProgress({ created: 0, updated: 0, errors: [e?.message || 'Could not export.'] });
    } finally {
      setShopifyExporting(false);
    }
  };

  const initiateShopifyConnect = async () => {
    const shop = shopifyConnectInput.trim().replace(/\.myshopify\.com$/i, '') || '';
    if (!shop) {
      setNotification({ title: 'Enter shop name', message: 'Enter your Shopify store name (e.g. mystore).', type: 'info' });
      return;
    }
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = (session as any)?.access_token;
    if (!accessToken || !user?.id) {
      setNotification({ title: 'Sign in required', message: 'Please sign in to connect Shopify.', type: 'info' });
      return;
    }
    try {
      const res = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, shop }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.redirectUrl) {
        setNotification({ title: 'Connection Failed', message: data?.error || 'Could not start connection.', type: 'info' });
        return;
      }
      setShowShopifyConnectModal(false);
      setShowVaultMenu(false);
      setShopifyConnectInput('');
      window.location.href = data.redirectUrl;
    } catch (e: any) {
      setNotification({ title: 'Connection Failed', message: e?.message || 'Could not connect.', type: 'info' });
    }
  };

  const initiateVaultPlusCheckout = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let accessToken = (session as any)?.access_token;
    if (!accessToken) {
      setNotification({ title: 'Sign in required', message: `Please sign in to upgrade to Vault+ (${VAULT_PLUS_PRICE_PHRASE}).`, type: 'info' });
      setShowAuth(true);
      setShowVaultPlusModal(false);
      return;
    }
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    accessToken = (refreshed as any)?.access_token ?? accessToken;
    if (!accessToken || !user?.id) {
      setNotification({ title: 'Sign in required', message: `Please sign in to upgrade to Vault+ (${VAULT_PLUS_PRICE_PHRASE}).`, type: 'info' });
      setShowAuth(true);
      setShowVaultPlusModal(false);
      return;
    }
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const paymentLink = (process.env.NEXT_PUBLIC_STRIPE_VAULT_PLUS_PAYMENT_LINK || '').trim();
      if (paymentLink) {
        const url = new URL(paymentLink);
        url.searchParams.set('client_reference_id', user.id);
        const email = (user as { email?: string })?.email;
        if (email) url.searchParams.set('prefilled_email', email);
        window.location.href = url.toString();
        return;
      }
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          userId: user.id,
          successUrl: `${origin}?vaultplus=1`,
          cancelUrl: origin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else {
        const msg = data?.error || 'Could not start checkout.';
        const isAuthError = /auth|session|sign in/i.test(msg);
        setNotification({
          title: isAuthError ? 'Session expired' : 'Checkout error',
          message: isAuthError ? 'Please sign in again and try again.' : msg,
          type: 'error',
          onConfirm: isAuthError ? () => { setShowAuth(true); setShowVaultPlusModal(false); } : undefined,
        });
      }
    } catch (e: any) {
      setNotification({ title: 'Checkout error', message: e?.message || 'Could not start checkout.', type: 'error' });
    }
  };

  const initiateManageSubscription = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = (session as any)?.access_token;
    if (!accessToken) {
      setNotification({ title: 'Sign in required', message: 'Please sign in to manage your subscription.', type: 'info' });
      setShowAuth(true);
      return;
    }
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else {
        setNotification({ title: 'Manage subscription', message: data?.error || 'Could not open subscription settings.', type: 'error' });
      }
    } catch (e: any) {
      setNotification({ title: 'Manage subscription', message: e?.message || 'Could not open subscription settings.', type: 'error' });
    }
  };

  const disconnectShopify = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = (session as any)?.access_token;
    if (!accessToken || !user?.id) return;
    try {
      const res = await fetch('/api/shopify/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      if (res.ok) {
        setShopifyConnected(false);
        setShopifyShop(null);
        setShowVaultMenu(false);
        setNotification({ title: 'Shopify Disconnected', message: 'Your store has been disconnected.', type: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        setNotification({ title: 'Disconnect Failed', message: data?.error || 'Could not disconnect.', type: 'info' });
      }
    } catch (e: any) {
      setNotification({ title: 'Disconnect Failed', message: e?.message || 'Could not disconnect.', type: 'info' });
    }
  };

  const getImageData = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      return null;
    }
  };

  const getImageAsCircle = async (dataUrl: string, sizePx: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const r = sizePx / 2;
        ctx.beginPath();
        ctx.arc(r, r, r, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  const getImageWithRoundedCorners = async (dataUrl: string, sizePx: number, cornerRadiusPct = 0.15): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        const r = Math.max(2, sizePx * cornerRadiusPct);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(sizePx - r, 0);
        ctx.quadraticCurveTo(sizePx, 0, sizePx, r);
        ctx.lineTo(sizePx, sizePx - r);
        ctx.quadraticCurveTo(sizePx, sizePx, sizePx - r, sizePx);
        ctx.lineTo(r, sizePx);
        ctx.quadraticCurveTo(0, sizePx, 0, sizePx - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  const pdfPageHeight = 297;
  const pdfPageWidth = 210;
  const pdfMargin = 16;
  const pdfContentWidth = pdfPageWidth - pdfMargin * 2;
  const PDF_FOOTER_HEIGHT = 28;

  const drawPDFPageHeader = async (
    doc: jsPDF,
    currentUser?: { email?: string; user_metadata?: { full_name?: string }; is_anonymous?: boolean } | null,
    profileData?: { display_name: string | null; company_name: string | null; logo_url: string | null } | null,
    pageNum: number = 1
  ) => {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(0, 22, pdfPageWidth, 22);
    if (pageNum === 1) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(40, 40, 40);
      doc.text('Inventory Report', pdfMargin, 12);
    }
    if (profileData?.logo_url) {
      const imgData = await getImageData(profileData.logo_url);
      if (imgData) {
        const logoSize = 16;
        const logoY = 4;
        const roundedImg = await getImageWithRoundedCorners(imgData, 128, 0.15);
        const finalImg = roundedImg || imgData;
        try {
          doc.addImage(finalImg, 'PNG', pdfPageWidth - pdfMargin - logoSize, logoY, logoSize, logoSize);
        } catch { /* ignore */ }
      }
    }
    let y = 16;
    const companyName = profileData?.company_name?.trim() || null;
    const displayName = profileData?.display_name?.trim() || null;
    const userFallback = currentUser && !currentUser.is_anonymous ? (currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || currentUser.email) : null;
    const nameToShow = companyName || displayName || userFallback;
    if (nameToShow) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      doc.text(nameToShow, pdfMargin, y);
      y += 5;
    }
    if (pageNum === 1) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text(new Date().toLocaleDateString(), pdfMargin, y);
    }
  };

  const drawPDFPageFooter = (doc: jsPDF, iconData: string | null, pageNum?: number) => {
    const footerY = pdfPageHeight - 10;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(pdfMargin, footerY - 8, pdfPageWidth - pdfMargin, footerY - 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(130, 130, 130);
    doc.text('Powered by', pdfMargin, footerY - 2);
    const logoSize = 5;
    const orgLine = ORG_SHORT_NAME;
    if (iconData) {
      try {
        doc.addImage(iconData, 'PNG', pdfMargin + 20, footerY - 6, logoSize, logoSize);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(60, 60, 60);
        doc.text(orgLine, pdfMargin + 26, footerY - 2);
      } catch {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(80, 80, 80);
        doc.text(orgLine, pdfMargin + 20, footerY - 2);
      }
    } else {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(80, 80, 80);
      doc.text(orgLine, pdfMargin + 20, footerY - 2);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(5); doc.setTextColor(130, 130, 130);
    doc.text(CREATOR_ATTRIBUTION_LABEL, pdfMargin, footerY + 3);
    if (pageNum != null) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(130, 130, 130);
      doc.text(`Page ${pageNum}`, pdfPageWidth - pdfMargin - doc.getTextWidth(`Page ${pageNum}`), footerY - 2);
    }
  };

  /** Compute height of one item block (header + table + breakdown + notes + divider) without drawing. Used for smart page breaks. */
  const computeItemBlockHeight = (
    doc: jsPDF,
    item: any,
    opts: { includeBreakdownInPDF: boolean; includeLiveInPDF: boolean; includeNotesInPDF: boolean; pdfWholesalePercentOfRetail: number | null }
  ): number => {
    const { includeBreakdownInPDF, includeNotesInPDF, pdfWholesalePercentOfRetail } = opts;
    const pdfThumbSize = 18;
    const pdfThumbPaddingBelow = 4;
    const tableHeight = 22;
    const pdfTableEndX = pdfMargin + (opts.includeLiveInPDF ? 96 : 90);
    const pdfBreakdownX = pdfTableEndX + 10;
    const pdfBreakdownMaxWidth = pdfPageWidth - pdfMargin - pdfBreakdownX;
    const lineHeight = 3;
    const sectionGap = 2;

    let itemHeaderHeight = 14;
    if (item.image_url) itemHeaderHeight = pdfThumbSize + pdfThumbPaddingBelow;

    const tableStartY = 0;
    const notesAnchorY = tableStartY + tableHeight + 5;
    let breakdownBottomY = tableStartY + tableHeight + 3;

    if (includeBreakdownInPDF) {
      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat', item.multiplier, item.markup_b, undefined, undefined, undefined, findingsMultFromItem(item));

      const metalLines: string[] = item.metals?.map((m: any) => `${m.weight}${m.unit} ${m.type}`) || [];
      const savedSpotByMetal: Record<string, number> = {};
      (item.metals || []).forEach((m: any) => {
        const t = m.type?.toLowerCase() || '';
        if (m.spotSaved != null && Number(m.spotSaved) > 0) {
          if (t.includes('gold') && savedSpotByMetal.Gold == null) savedSpotByMetal.Gold = m.spotSaved;
          else if (t.includes('silver') && savedSpotByMetal.Silver == null) savedSpotByMetal.Silver = m.spotSaved;
          else if (t.includes('platinum') && savedSpotByMetal.Platinum == null) savedSpotByMetal.Platinum = m.spotSaved;
          else if (t.includes('palladium') && savedSpotByMetal.Palladium == null) savedSpotByMetal.Palladium = m.spotSaved;
        }
      });
      const savedSpotParts = Object.entries(savedSpotByMetal)
        .map(([name, val]) => `${name} $${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .filter(Boolean);
      if (savedSpotParts.length > 0) metalLines.push(`Saved spot ($/ozt): ${savedSpotParts.join(' | ')}`);

      const stoneLines: string[] = [];
      if (stonesArray.length > 0) {
        stonesArray.forEach((stone: any) => {
          const stoneRetail = Number(stone.cost) * Number(stone.markup || 1.5);
          stoneLines.push(`${stone.name}: $${stoneRetail.toFixed(2)} (${stone.markup.toFixed(1)}× | Cost: $${Number(stone.cost).toFixed(2)})`);
        });
      }

      const otherLines: string[] = [];
      if (item.other_costs_at_making > 0) otherLines.push(`Findings/Other: $${Number(item.other_costs_at_making).toFixed(2)}`);
      if (item.overhead_cost > 0) {
        const ovPct = item.overhead_type === 'percent' ? `${Number(item.overhead_cost).toFixed(0)}%` : null;
        otherLines.push(`Overhead: $${Number(current.overhead).toFixed(2)} ${ovPct ? `(${ovPct})` : ''}`);
      }
      if (current.labor > 0) otherLines.push(`Labor (${item.hours || 0}h): $${Number(current.labor).toFixed(2)}`);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);

      const countSectionLines = (lines: string[]): number => {
        if (lines.length === 0) return 0;
        let count = lineHeight;
        for (const line of lines) {
          const wrapped = doc.splitTextToSize(line, pdfBreakdownMaxWidth);
          count += wrapped.length * lineHeight + 0.4;
        }
        return count + sectionGap;
      };

      breakdownBottomY = 2 + countSectionLines(metalLines) + countSectionLines(stoneLines) + countSectionLines(otherLines) + 1;
    }

    let notesBottomY = notesAnchorY;
    if (includeNotesInPDF && item.notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      const noteWrapped = doc.splitTextToSize(item.notes, pdfContentWidth - 4);
      notesBottomY = notesAnchorY + 4.5 + noteWrapped.length * 3 + 3;
    }

    const nextY = Math.max(breakdownBottomY, notesBottomY);
    return itemHeaderHeight + nextY + 4;
  };

  const exportDetailedPDF = async () => {
    setShowPDFOptions(false);
    setBlockingWorkBanner({
      title: 'Generating PDF',
      subtitle:
        'Loading images and laying out pages. Please wait — on phones this may take a little while.',
    });
    await yieldForWorkBannerPaint();

    try {
    const [{ default: JSPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const targetItems = selectedItems.size > 0
      ? filteredInventory.filter(i => selectedItems.has(i.id))
      : filteredInventory;

    let profileForPDF = profile;
    if (user && !user.is_anonymous && !profileForPDF) {
      const session = (await supabase.auth.getSession()).data.session;
      const accessToken = (session as any)?.access_token;
      if (accessToken) {
        try {
          const resProfile = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken }),
          });
          if (resProfile.ok) {
            const data = await resProfile.json();
            profileForPDF = { display_name: data.display_name ?? null, company_name: data.company_name ?? null, logo_url: data.logo_url ?? null };
          }
        } catch { /* use null */ }
      }
    }

    const iconFetchUrl =
      typeof window !== 'undefined' ? `${window.location.origin}${appIconHeaderPath()}` : appIconHeaderPath();
    const iconRaw = await getImageData(iconFetchUrl);
    const iconData = iconRaw ? (await getImageWithRoundedCorners(iconRaw, 32, 0.15)) ?? iconRaw : null;

    const doc = new JSPDF();
    const neutralDark = [80, 80, 80] as [number, number, number];
    const muted = [100, 100, 100];
    const dark = [40, 40, 40];
    let pageNum = 1;

    await drawPDFPageHeader(doc, user, profileForPDF ?? null, 1);
    let currentY = 28;

    if (includeLiveInPDF) {
      if (prices.gold > 0 || prices.silver > 0 || prices.platinum > 0 || prices.palladium > 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(pdfMargin, currentY, pdfContentWidth, 14, 'F');
        doc.setDrawColor(220, 220, 220);
        doc.rect(pdfMargin, currentY, pdfContentWidth, 14, 'S');
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(neutralDark[0], neutralDark[1], neutralDark[2]);
        doc.text('Live spot prices ($/ozt)', pdfMargin + 5, currentY + 5.5);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(55, 55, 55);
        const liveParts: string[] = [];
        if (prices.gold > 0) liveParts.push(`Gold $${Number(prices.gold).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        if (prices.silver > 0) liveParts.push(`Silver $${Number(prices.silver).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        if (prices.platinum > 0) liveParts.push(`Platinum $${Number(prices.platinum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        if (prices.palladium > 0) liveParts.push(`Palladium $${Number(prices.palladium).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        doc.text(liveParts.join('  ·  '), pdfMargin + 5, currentY + 11);
        currentY += 17;
      }
    }
    currentY += 8;

    for (const item of targetItems) {
      const itemHeight = computeItemBlockHeight(doc, item, { includeBreakdownInPDF, includeLiveInPDF, includeNotesInPDF, pdfWholesalePercentOfRetail });
      if (currentY + itemHeight > pdfPageHeight - PDF_FOOTER_HEIGHT) {
        drawPDFPageFooter(doc, iconData, pageNum);
        doc.addPage();
        pageNum += 1;
        currentY = 28;
        await drawPDFPageHeader(doc, user, profileForPDF ?? null, pageNum);
      }

      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, (item.overhead_type as 'flat' | 'percent') || 'flat', item.multiplier, item.markup_b, undefined, undefined, undefined, findingsMultFromItem(item));
      const itemPrices = getItemPrices(item, current);
      const liveWholesale = itemPrices.wholesale;
      const liveRetail = itemPrices.retail;

      const pdfThumbSize = 18;
      const pdfThumbGap = 4;
      const pdfThumbPaddingBelow = 4;
      let titleX = pdfMargin;
      let itemHeaderHeight = 14;

      if (item.image_url) {
        const imgData = await getImageData(item.image_url);
        if (imgData) {
          const circularImg = await getImageAsCircle(imgData, 216);
          const finalImg = circularImg || imgData;
          doc.addImage(finalImg, 'PNG', pdfMargin, currentY, pdfThumbSize, pdfThumbSize);
          titleX = pdfMargin + pdfThumbSize + pdfThumbGap;
          itemHeaderHeight = pdfThumbSize + pdfThumbPaddingBelow;
        }
      }

      const titleMetaGap = 5;
      const titleY = currentY + (itemHeaderHeight > 14 ? 4 : 5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text(vaultExportItemTitle(item.name), titleX, titleY);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(muted[0], muted[1], muted[2]);
      const stockQ = vaultItemStockQty(item);
      const meta = `${item.status === 'archived' || item.status === 'sold' ? 'Archived' : 'Active'}  ·  ${item.location || 'Main Vault'}  ·  QTY: ${stockQ}  ·  Saved ${new Date(item.created_at).toLocaleDateString()}`;
      doc.text(meta, titleX, titleY + titleMetaGap);
      currentY += itemHeaderHeight;

      const tableStartY = currentY;
      const tableHead = includeLiveInPDF ? [['', 'Saved', 'Live (market)']] : [['', 'Saved']];
      const retailRow: any[] = ['Retail', `$${roundForDisplay(Number(item.retail)).toFixed(2)}`];
      if (includeLiveInPDF) retailRow.push(`$${roundForDisplay(liveRetail).toFixed(2)}`);
      const useWholesalePercent = pdfWholesalePercentOfRetail != null && pdfWholesalePercentOfRetail > 0 && pdfWholesalePercentOfRetail <= 100;
      const wholesaleRow: any[] = useWholesalePercent
        ? (() => {
            const pct = pdfWholesalePercentOfRetail! / 100;
            // Match the retail row above: % is of displayed (rounded) retail, not raw formula $.
            const displayedSavedRetail = roundForDisplay(Number(item.retail));
            const displayedLiveRetail = roundForDisplay(liveRetail);
            const wholesaleFromSavedRetail = displayedSavedRetail * pct;
            const wholesaleFromLiveRetail = displayedLiveRetail * pct;
            const row: any[] = [`Wholesale (${pdfWholesalePercentOfRetail}% of retail)`, `$${wholesaleFromSavedRetail.toFixed(2)}`];
            if (includeLiveInPDF) row.push(`$${wholesaleFromLiveRetail.toFixed(2)}`);
            return row;
          })()
        : (() => {
            const row: any[] = ['Wholesale', `$${roundForDisplay(Number(item.wholesale)).toFixed(2)}`];
            if (includeLiveInPDF) row.push(`$${roundForDisplay(liveWholesale).toFixed(2)}`);
            return row;
          })();

      autoTable(doc, {
        startY: tableStartY,
        head: tableHead,
        body: [retailRow, wholesaleRow],
        theme: 'grid',
        headStyles: { fillColor: [235, 235, 235] as any, textColor: [60, 60, 60], fontSize: 8, cellPadding: 1.5 },
        columnStyles: includeLiveInPDF ? { 0: { cellWidth: 32 }, 1: { cellWidth: 32 }, 2: { cellWidth: 32 } } : { 0: { cellWidth: 40 }, 1: { cellWidth: 50 } },
        styles: { fontSize: 8, cellPadding: 1.5 },
        margin: { left: pdfMargin },
        tableWidth: includeLiveInPDF ? 96 : 90
      });

      const pdfTableEndX = pdfMargin + (includeLiveInPDF ? 96 : 90);
      const pdfBreakdownGap = 10;
      const pdfBreakdownX = pdfTableEndX + pdfBreakdownGap;
      const pdfBreakdownMaxWidth = pdfPageWidth - pdfMargin - pdfBreakdownX;

      const tableFinalY = (doc as any).lastAutoTable.finalY;
      const notesAnchorY = tableFinalY + 5;
      let breakdownBottomY = tableFinalY + 3;

      if (includeBreakdownInPDF) {
        const metalLines: string[] = item.metals.map((m: any) => `${m.weight}${m.unit} ${m.type}`);
        const savedSpotByMetal: Record<string, number> = {};
        (item.metals || []).forEach((m: any) => {
          const t = m.type?.toLowerCase() || '';
          if (m.spotSaved != null && Number(m.spotSaved) > 0) {
            if (t.includes('gold') && savedSpotByMetal.Gold == null) savedSpotByMetal.Gold = m.spotSaved;
            else if (t.includes('silver') && savedSpotByMetal.Silver == null) savedSpotByMetal.Silver = m.spotSaved;
            else if (t.includes('platinum') && savedSpotByMetal.Platinum == null) savedSpotByMetal.Platinum = m.spotSaved;
            else if (t.includes('palladium') && savedSpotByMetal.Palladium == null) savedSpotByMetal.Palladium = m.spotSaved;
          }
        });
        const savedSpotParts = Object.entries(savedSpotByMetal)
          .map(([name, val]) => `${name} $${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
          .filter(Boolean);
        if (savedSpotParts.length > 0) metalLines.push(`Saved spot ($/ozt): ${savedSpotParts.join(' | ')}`);

        const stoneLines: string[] = [];
        if (stonesArray.length > 0) {
          stonesArray.forEach((stone: any) => {
            const stoneRetail = Number(stone.cost) * Number(stone.markup || 1.5);
            stoneLines.push(`${stone.name}: $${stoneRetail.toFixed(2)} (${stone.markup.toFixed(1)}× | Cost: $${Number(stone.cost).toFixed(2)})`);
          });
        }

        const otherLines: string[] = [];
        if (item.other_costs_at_making > 0) otherLines.push(`Findings/Other: $${Number(item.other_costs_at_making).toFixed(2)}`);
      if (item.overhead_cost > 0) {
        const ovPct = item.overhead_type === 'percent' ? `${Number(item.overhead_cost).toFixed(0)}%` : null;
        otherLines.push(`Overhead: $${Number(current.overhead).toFixed(2)} ${ovPct ? `(${ovPct})` : ''}`);
        }
        if (current.labor > 0) otherLines.push(`Labor (${item.hours || 0}h): $${Number(current.labor).toFixed(2)}`);

        const lineHeight = 3;
        const sectionGap = 2;
        let lineY = tableStartY + 2;

        const drawSection = (header: string, lines: string[]) => {
          if (lines.length === 0) return;
          doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(neutralDark[0], neutralDark[1], neutralDark[2]);
          doc.text(header, pdfBreakdownX, lineY);
          lineY += lineHeight;
          doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(70, 70, 70);
          for (const line of lines) {
            const wrapped = doc.splitTextToSize(line, pdfBreakdownMaxWidth);
            for (const part of wrapped) {
              doc.text(part, pdfBreakdownX, lineY);
              lineY += lineHeight;
            }
            lineY += 0.4;
          }
          lineY += sectionGap;
        };

        drawSection('Metals', metalLines);
        drawSection('Stones', stoneLines);
        drawSection('Other', otherLines);
        breakdownBottomY = lineY + 1;
      }

      let notesBottomY = notesAnchorY;
      if (includeNotesInPDF && item.notes) {
        let drawNotesY = notesAnchorY;
        if (notesAnchorY > pdfPageHeight - PDF_FOOTER_HEIGHT - 10) {
          drawPDFPageFooter(doc, iconData, pageNum);
          doc.addPage();
          pageNum += 1;
          await drawPDFPageHeader(doc, user, profileForPDF ?? null, pageNum);
          drawNotesY = 28;
        }
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.line(pdfMargin, drawNotesY - 0.5, pdfMargin + 80, drawNotesY - 0.5);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(muted[0], muted[1], muted[2]); doc.text('Notes', pdfMargin, drawNotesY + 2);
        doc.setFont("helvetica", "italic"); doc.setFontSize(6); doc.setTextColor(90, 90, 90);
        const noteWrapped = doc.splitTextToSize(item.notes, pdfContentWidth - 4);
        noteWrapped.forEach((part: string, i: number) => doc.text(part, pdfMargin, drawNotesY + 4.5 + i * 3));
        notesBottomY = drawNotesY + 4.5 + (noteWrapped.length * 3) + 3;
      }

      const nextY = Math.max(breakdownBottomY, notesBottomY);
      currentY = nextY + 4;
      doc.setDrawColor(232, 232, 232);
      doc.setLineWidth(0.3);
      doc.line(pdfMargin, currentY - 2, pdfPageWidth - pdfMargin, currentY - 2);
    }

    drawPDFPageFooter(doc, iconData, pageNum);
    doc.save(`Vault_Report.pdf`);
    } catch (e: any) {
      setNotification({
        title: 'PDF export failed',
        message: e?.message || 'Something went wrong while creating the PDF.',
        type: 'error',
      });
    } finally {
      setBlockingWorkBanner(null);
      setShowVaultMenu(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const authRedirectUrl = authRedirectOrigin();
    let result = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { is_converted_from_anonymous: true },
            emailRedirectTo: authRedirectUrl,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setNotification({ title: "Vault Access Error", message: result.error.message, type: 'error' });
    } else if (isSignUp) {
      // Detect existing account: Supabase returns empty identities when email already registered
      if (result.data?.user?.identities?.length === 0) {
        setNotification({ title: "Already Registered", message: "This email is already registered. Try logging in instead.", type: 'info' });
        setIsSignUp(false);
      } else {
        setSignUpAwaitingConfirmation(true);
      }
    } else {
      setShowAuth(false);
      setShowPassword(false);
      fetchInventory();
      if (pendingVaultPlusAfterAuth) {
        setPendingVaultPlusAfterAuth(false);
        setShowVaultPlusModal(true);
      }
    }
  };

  const handleResendConfirmation = async () => {
    if (!email) return;
    setResendingConfirmation(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResendingConfirmation(false);
    if (error) {
      setNotification({ title: "Resend Failed", message: error.message, type: 'error' });
    } else {
      setNotification({ title: "Email Sent", message: "A new verification link has been sent to your email.", type: 'success' });
    }
  };

  const handleGoogleHandshake = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;

    if (!idToken) {
      setNotification({ title: "Error", message: "No credential received from Google.", type: 'error' });
      return;
    }

    // Login tab: always sign in (don't try to link guest account)
    // Sign Up tab + anonymous: try to link to preserve guest vault items
    const shouldLink = user?.is_anonymous && isSignUp;
    if (shouldLink) {
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        token: idToken,
      });
      if (linkError) {
        if (linkError.message?.toLowerCase().includes('already linked') || linkError.message?.toLowerCase().includes('another user')) {
          await supabase.auth.signOut();
          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
          });
          if (signInError) {
            setNotification({ title: "Sign in failed", message: signInError.message, type: 'error' });
            return;
          }
          setShowAuth(false);
          fetchInventory();
          if (pendingVaultPlusAfterAuth) {
            setPendingVaultPlusAfterAuth(false);
            setShowVaultPlusModal(true);
          }
          setNotification({ title: "Welcome back", message: "Signed in with your existing Google account.", type: 'success' });
          return;
        }
        setNotification({ title: "Link Failed", message: linkError.message, type: 'error' });
        return;
      }
      setShowAuth(false);
      fetchInventory();
      if (pendingVaultPlusAfterAuth) {
        setPendingVaultPlusAfterAuth(false);
        setShowVaultPlusModal(true);
      }
      setNotification({ title: "Welcome to the Vault", message: "Your Google account is now linked. Your items are preserved.", type: 'success' });
      return;
    }

    // Sign in with Google (Login tab, or not anonymous, or link not applicable)
    if (user?.is_anonymous) {
      await supabase.auth.signOut();
    }
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      setNotification({ title: "Login Failed", message: error.message, type: 'error' });
    } else {
      setShowAuth(false);
      fetchInventory();
      if (pendingVaultPlusAfterAuth) {
        setPendingVaultPlusAfterAuth(false);
        setShowVaultPlusModal(true);
      }
      setNotification({ title: "Welcome to the Vault", message: "Successfully logged in via Google.", type: 'success' });
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setNotification({ title: "Email Required", message: "Please enter your email address first so we know where to send the recovery link.", type: 'info' });
      return;
    }
    const recoveryRedirect = authRedirectOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirect || undefined,
    });
    if (error) {
      setNotification({ title: "Recovery Error", message: error.message, type: 'error' });
    } else {
      setNotification({ title: "Link Sent", message: "Password reset link sent! Check your inbox to get back into The Vault.", type: 'success' });
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      setNotification({ title: "Security Alert", message: "Password must be at least 6 characters for Vault security.", type: 'error' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setNotification({ title: "Security Error", message: error.message, type: 'error' });
    } else {
      setShowResetModal(false);
      setShowPassword(false);
      setNewPassword('');
      window.location.hash = "";
      setNotification({ title: "Access Restored", message: "Your master password has been updated successfully. Vault Access Restored!", type: 'success' });
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-background px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:p-10 text-foreground font-sans text-left relative">

      {/* Image Adjuster Modal */}
      {cropImage && (
        <div className="fixed inset-0 bg-charcoal/80 backdrop-blur-md z-[500] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black uppercase text-center text-foreground">Adjust Photo</h3>
            <p className="text-[9px] text-stone-500 text-center font-medium">
              {cropIsExistingPhoto ? (
                <>Re-crop your current vault photo — drag to position, zoom, rotate. Saved as a small square PNG.</>
              ) : (
                <>iPhone: choose from Photos or camera — HEIC is OK in Safari. Up to {Math.round(MAX_VAULT_PHOTO_UPLOAD_BYTES / (1024 * 1024))} MB; saved vault image is a small square PNG.</>
              )}
            </p>

            {/* Cropper Container - circular preview matches vault display (square crop saved for Shopify) */}
            <div
              className="relative w-64 h-64 mx-auto rounded-full overflow-hidden border-4 border-brand shadow-inner bg-stone-100 touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <img
                ref={imageRef}
                src={cropImage}
                alt="Crop"
                className="absolute max-w-none"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  left: '50%',
                  top: '50%',
                  marginLeft: imageRef.current ? -imageRef.current.naturalWidth / 2 : 0,
                  marginTop: imageRef.current ? -imageRef.current.naturalHeight / 2 : 0,
                  opacity: imageRef.current ? 1 : 0
                }}
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.marginLeft = `-${img.naturalWidth / 2}px`;
                  img.style.marginTop = `-${img.naturalHeight / 2}px`;
                  img.style.opacity = '1';

                  const fitScale = 256 / Math.min(img.naturalWidth, img.naturalHeight);
                  setMinZoom(fitScale);
                  setZoom(fitScale);
                }}
                onError={() => {
                  setNotification({
                    title: 'Photo format not supported here',
                    message: 'On iPhone: Settings → Camera → Formats → choose “Most Compatible” for new shots, or export a JPEG from Photos (Duplicate → Share → Save Image).',
                    type: 'error',
                  });
                  revokeCropBlobUrl();
                  setCropImage(null);
                  setCropItemId(null);
                  setCropIsExistingPhoto(false);
                }}
                draggable={false}
              />
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-bold text-stone-400 uppercase">
                <span>Zoom</span>
                <button onClick={() => setRotation(r => (r + 90) % 360)} className="text-brand hover:text-foreground transition-colors">⟳ Rotate 90°</button>
              </div>
              <input
                type="range"
                min={minZoom}
                max={minZoom * 5}
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  revokeCropBlobUrl();
                  setCropImage(null);
                  setCropItemId(null);
                  setCropIsExistingPhoto(false);
                }}
                className="flex-1 py-3 bg-stone-100 rounded-xl font-bold text-xs uppercase hover:bg-stone-200 transition"
              >
                Cancel
              </button>
              <button onClick={performCropAndUpload} className="flex-1 py-3 bg-charcoal text-white rounded-xl font-bold text-xs uppercase hover:bg-brand transition shadow-md">
                {uploadingId ? 'Saving...' : 'Save Photo'}
              </button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

      {/* Profile Settings Modal */}
      {showProfileModal && user && !user.is_anonymous && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[260] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Profile</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-stone-300 hover:text-brand font-black text-lg">✕</button>
            </div>
            <p className="text-xs text-stone-500">Your display name, company, and logo appear in PDF reports and exports.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Display name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  className="w-full p-3 border border-stone-200 rounded-xl text-sm focus:border-brand outline-none"
                  value={profileDraft.display_name}
                  onChange={e => setProfileDraft(p => ({ ...p, display_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Company name</label>
                <input
                  type="text"
                  placeholder="Company or brand"
                  className="w-full p-3 border border-stone-200 rounded-xl text-sm focus:border-brand outline-none"
                  value={profileDraft.company_name}
                  onChange={e => setProfileDraft(p => ({ ...p, company_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Logo</label>
                <div className="flex items-center gap-4">
                  {(profileLogoPreviewUrl || profileDraft.logo_url) && (
                    <img src={profileLogoPreviewUrl || `${profileDraft.logo_url!}${profileDraft.logo_url!.includes('?') ? '&' : '?'}t=${profileLogoCacheBuster}`} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-stone-200" />
                  )}
                  <div className="flex flex-col gap-1">
                    <input
                      ref={profileLogoInputRef}
                      type="file"
                      accept={VAULT_PHOTO_ACCEPT}
                      className="hidden"
                      onChange={async e => {
                        const file = e.target?.files?.[0];
                        if (!file || !user?.id) return;
                        setProfileLogoPreviewUrl(prev => {
                          if (prev) URL.revokeObjectURL(prev);
                          return URL.createObjectURL(file);
                        });
                        setProfileLogoUploading(true);
                        try {
                          const img = new Image();
                          img.src = URL.createObjectURL(file);
                          await new Promise<void>((res, rej) => {
                            img.onload = () => res();
                            img.onerror = () => rej(new Error('Invalid image'));
                          });
                          const size = 256;
                          const canvas = document.createElement('canvas');
                          canvas.width = size;
                          canvas.height = size;
                          const ctx = canvas.getContext('2d');
                          if (!ctx) throw new Error('Canvas not supported');
                          ctx.drawImage(img, 0, 0, size, size);
                          URL.revokeObjectURL(img.src);
                          canvas.toBlob(async blob => {
                            if (!blob) {
                              setProfileLogoUploading(false);
                              return;
                            }
                            try {
                              const fileName = `${user.id}/logo.png`;
                              const { error } = await supabase.storage.from('product-images').upload(fileName, blob, { upsert: true });
                              if (error) {
                                setNotification({ title: 'Upload Failed', message: error.message, type: 'error' });
                                return;
                              }
                              const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
                              setProfileDraft(p => ({ ...p, logo_url: publicUrl }));
                              setProfileLogoPreviewUrl(prev => {
                                if (prev) URL.revokeObjectURL(prev);
                                return null;
                              });
                            } finally {
                              setProfileLogoUploading(false);
                            }
                            e.target.value = '';
                          }, 'image/png');
                        } catch (err: any) {
                          setNotification({ title: 'Upload Failed', message: err?.message || 'Could not process image.', type: 'error' });
                          setProfileLogoUploading(false);
                          setProfileLogoPreviewUrl(prev => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => profileLogoInputRef.current?.click()}
                      disabled={profileLogoUploading}
                      className="text-[10px] font-black uppercase px-4 py-2 rounded-xl border-2 border-stone-200 hover:border-brand transition disabled:opacity-50"
                    >
                      {profileLogoUploading ? 'Uploading…' : profileDraft.logo_url ? 'Change logo' : 'Upload logo'}
                    </button>
                    {(profileLogoPreviewUrl || profileDraft.logo_url) && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileLogoPreviewUrl(prev => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                          setProfileDraft(p => ({ ...p, logo_url: null }));
                        }}
                        className="text-[10px] font-black uppercase text-stone-400 hover:text-red-600 transition"
                      >
                        Remove logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (profileSaving || !user?.id) return;
                const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
                if (!accessToken) {
                  setNotification({ title: 'Session Error', message: 'Please sign in again.', type: 'info' });
                  return;
                }
                setProfileSaving(true);
                try {
                  const res = await fetch('/api/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      accessToken,
                      display_name: profileDraft.display_name || null,
                      company_name: profileDraft.company_name || null,
                      logo_url: profileDraft.logo_url,
                    }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const msg = err?.error || 'Could not save profile.';
                    setNotification({ title: 'Save Failed', message: msg + (err?.code ? ` (${err.code})` : ''), type: 'error' });
                    return;
                  }
                  setProfile({
                    display_name: profileDraft.display_name || null,
                    company_name: profileDraft.company_name || null,
                    logo_url: profileDraft.logo_url,
                  });
                  if (profileDraft.logo_url) setProfileLogoCacheBuster(Date.now());
                  setShowProfileModal(false);
                } finally {
                  setProfileSaving(false);
                }
              }}
              disabled={profileSaving}
              className="w-full py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition disabled:opacity-50"
            >
              {profileSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Vault+ Upgrade Modal */}
      {showVaultPlusModal && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[250] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Upgrade to Vault+</h3>
            {(!user || user.is_anonymous) ? (
              <>
                <p className="text-sm text-stone-600 font-medium">
                  Create your free Vault account first. Then upgrade for {VAULT_PLUS_PRICE_PHRASE} and unlock everything.
                </p>
                <ul className="text-[10px] font-bold text-stone-500 uppercase tracking-wider space-y-2">
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Unlimited vault items</li>
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Time tracking</li>
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Custom price formulas</li>
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Compare prices across formulas</li>
                </ul>
                <div className="flex gap-3">
                  <button onClick={() => setShowVaultPlusModal(false)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Maybe later</button>
                  <button
                    onClick={() => {
                      setPendingVaultPlusAfterAuth(true);
                      setShowVaultPlusModal(false);
                      setShowAuth(true);
                      setIsSignUp(true);
                      setShowPassword(false);
                    }}
                    className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg"
                  >
                    Sign Up to Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-stone-600 font-medium">
                  Save vault items, log time, and use custom formulas. Vault+ unlocks everything—{VAULT_PLUS_PRICE_PHRASE}.
                </p>
                <ul className="text-[10px] font-bold text-stone-500 uppercase tracking-wider space-y-2">
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Unlimited vault items</li>
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Time tracking</li>
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Custom price formulas</li>
                  <li className="flex items-center gap-2"><span className="text-brand">✓</span> Compare prices across formulas</li>
                </ul>
                <div className="flex gap-3">
                  <button onClick={() => setShowVaultPlusModal(false)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Maybe later</button>
                  <button onClick={initiateVaultPlusCheckout} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Get Vault+</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Exports & bulk saves — not the same as vault “Opening…” (`loading`). */}
      {blockingWorkBanner && (
        <div
          className="fixed inset-0 bg-charcoal/90 backdrop-blur-md z-[420] flex items-center justify-center pt-4 px-4 pb-modal-safe"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-brand p-10 space-y-6 shadow-2xl animate-in zoom-in-95 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-brand/20 animate-pulse">
              <span className="text-3xl" aria-hidden>
                ⟳
              </span>
            </div>
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">{blockingWorkBanner.title}</h3>
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wide leading-relaxed">{blockingWorkBanner.subtitle}</p>
          </div>
        </div>
      )}

      {/* PDF Options Modal */}
      {showPDFOptions && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">PDF Options</h3>

            <div className="space-y-3">
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setIncludeLiveInPDF(!includeLiveInPDF)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${includeLiveInPDF ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>
                  {includeLiveInPDF && '✓'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include Live Prices</p>
                  <p className="text-[10px] text-stone-400 font-bold">Show current market value calculations</p>
                </div>
              </div>

              {/* Breakdown Toggle */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setIncludeBreakdownInPDF(!includeBreakdownInPDF)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${includeBreakdownInPDF ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>
                  {includeBreakdownInPDF && '✓'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include Breakdown</p>
                  <p className="text-[10px] text-stone-400 font-bold">Show list of metals and labor costs</p>
                </div>
              </div>

              {/* Notes Toggle */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setIncludeNotesInPDF(!includeNotesInPDF)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${includeNotesInPDF ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>
                  {includeNotesInPDF && '✓'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include Notes</p>
                  <p className="text-[10px] text-stone-400 font-bold">Show item notes if present</p>
                </div>
              </div>

              {/* Wholesale as % of Retail */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                <p className="text-xs font-black uppercase text-foreground">Wholesale as % of Retail</p>
                <p className="text-[10px] text-stone-400 font-bold">For store consignment (e.g. 50% = store doubles your price)</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {[null, 50, 60, 40].map((pct) => (
                    <button
                      key={pct ?? 'off'}
                      type="button"
                      onClick={() => setPdfWholesalePercentOfRetail(pct)}
                      className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${pdfWholesalePercentOfRetail === pct ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                    >
                      {pct == null ? 'Off' : `${pct}%`}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="Custom %"
                      value={pdfWholesalePercentOfRetail != null && ![50, 60, 40].includes(pdfWholesalePercentOfRetail) ? pdfWholesalePercentOfRetail : ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : null;
                        setPdfWholesalePercentOfRetail(v != null && v >= 1 && v <= 100 ? v : null);
                      }}
                      className="w-16 p-2 rounded-lg border border-stone-200 text-xs font-bold text-center"
                    />
                    <span className="text-[10px] font-bold text-stone-400">%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPDFOptions(false)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={exportDetailedPDF} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Shopify Modal – hidden when SHOPIFY_FEATURE_ENABLED is false */}
      {SHOPIFY_FEATURE_ENABLED && showShopifyConnectModal && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Connect Shopify</h3>
            <p className="text-[10px] text-stone-500 font-bold">Enter your Shopify store name (e.g. mystore or mystore.myshopify.com)</p>
            <input
              type="text"
              placeholder="mystore"
              value={shopifyConnectInput}
              onChange={(e) => setShopifyConnectInput(e.target.value)}
              className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:border-brand font-bold placeholder:text-stone-300"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowShopifyConnectModal(false); setShopifyConnectInput(''); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={initiateShopifyConnect} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Export to Shopify Options Modal – hidden when SHOPIFY_FEATURE_ENABLED is false */}
      {SHOPIFY_FEATURE_ENABLED && showShopifyExportOptions && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Export to Shopify</h3>
            <p className="text-[10px] text-stone-500 font-bold">Choose what to sync. Existing Shopify products with matching SKU will be updated, not duplicated.</p>

            <div className="space-y-3">
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeDescription(!shopifyIncludeDescription)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeDescription ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeDescription && '✓'}</div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include description</p>
                  <p className="text-[10px] text-stone-400 font-bold">Notes, metals, stones</p>
                </div>
              </div>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeImage(!shopifyIncludeImage)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeImage ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeImage && '✓'}</div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include image</p>
                  <p className="text-[10px] text-stone-400 font-bold">Adds our image without removing existing</p>
                </div>
              </div>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeRetail(!shopifyIncludeRetail)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeRetail ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeRetail && '✓'}</div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include retail price</p>
                </div>
              </div>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeWholesale(!shopifyIncludeWholesale)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeWholesale ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeWholesale && '✓'}</div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include wholesale price</p>
                  <p className="text-[10px] text-stone-400 font-bold">Compare-at price in Shopify</p>
                </div>
              </div>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                <p className="text-xs font-black uppercase text-foreground">Price source</p>
                <div className="flex gap-2">
                  <button onClick={() => setShopifyPriceSource('saved')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${shopifyPriceSource === 'saved' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>Saved</button>
                  <button onClick={() => setShopifyPriceSource('live')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${shopifyPriceSource === 'live' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>Live</button>
                </div>
                <p className="text-[10px] text-stone-400 font-bold">Saved = vault values. Live = computed from current metals & formula.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowShopifyExportOptions(false)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={() => { setShowShopifyExportOptions(false); exportToShopify(); }} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Export</button>
            </div>
          </div>
        </div>
      )}

      {showSiteProductCsvModal && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Export CSV for your site</h3>
            <p className="text-[10px] text-stone-500 font-bold">Download a product file to import into Shopify or Squarespace (no store connection required).</p>

            <div className="space-y-2">
              <p className="text-xs font-black uppercase text-foreground">Platform</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSiteCsvPlatform('shopify')}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${siteCsvPlatform === 'shopify' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}
                >
                  Shopify
                </button>
                <button
                  type="button"
                  onClick={() => setSiteCsvPlatform('squarespace')}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${siteCsvPlatform === 'squarespace' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}
                >
                  Squarespace
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeDescription(!shopifyIncludeDescription)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeDescription ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeDescription && '✓'}</div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Include description</p>
                  <p className="text-[10px] text-stone-400 font-bold">Notes, metals, stones</p>
                </div>
              </div>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeWholesalePctOfRetail(!shopifyIncludeWholesalePctOfRetail)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeWholesalePctOfRetail ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeWholesalePctOfRetail && '✓'}</div>
                <div>
                  <p className="text-xs font-black uppercase text-foreground">Wholesale % of retail</p>
                  <p className="text-[10px] text-stone-400 font-bold">Extra column; % = wholesale ÷ retail using same rounded $ as Price / compare-at</p>
                </div>
              </div>

              {siteCsvPlatform === 'shopify' && (
                <>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeImage(!shopifyIncludeImage)}>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeImage ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeImage && '✓'}</div>
                    <div>
                      <p className="text-xs font-black uppercase text-foreground">Include image URL</p>
                      <p className="text-[10px] text-stone-400 font-bold">Shopify import column only</p>
                    </div>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeRetail(!shopifyIncludeRetail)}>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeRetail ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeRetail && '✓'}</div>
                    <div>
                      <p className="text-xs font-black uppercase text-foreground">Include retail price</p>
                      <p className="text-[10px] text-stone-400 font-bold">Shopify only</p>
                    </div>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setShopifyIncludeWholesale(!shopifyIncludeWholesale)}>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${shopifyIncludeWholesale ? 'bg-brand border-brand text-white' : 'bg-white border-stone-300'}`}>{shopifyIncludeWholesale && '✓'}</div>
                    <div>
                      <p className="text-xs font-black uppercase text-foreground">Include wholesale → compare-at</p>
                      <p className="text-[10px] text-stone-400 font-bold">Shopify only</p>
                    </div>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                    <p className="text-xs font-black uppercase text-foreground">Price source</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShopifyPriceSource('saved')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${shopifyPriceSource === 'saved' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>Saved</button>
                      <button type="button" onClick={() => setShopifyPriceSource('live')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${shopifyPriceSource === 'live' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>Live</button>
                    </div>
                    <p className="text-[10px] text-stone-400 font-bold">Saved = vault values. Live = computed from current metals and formula.</p>
                  </div>
                </>
              )}

              {siteCsvPlatform === 'squarespace' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-stone-500 font-bold px-1">
                    Template columns: title, URL slug, description, SKU (same <span className="font-mono">VAULT-</span> prefix as Shopify), and optional wholesale % column. Add dollar prices and images in Squarespace after import if needed.
                  </p>
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                    <p className="text-xs font-black uppercase text-foreground">Price source for %</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShopifyPriceSource('saved')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${shopifyPriceSource === 'saved' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>Saved</button>
                      <button type="button" onClick={() => setShopifyPriceSource('live')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${shopifyPriceSource === 'live' ? 'bg-brand text-white border-brand' : 'bg-white border-stone-200 text-stone-500'}`}>Live</button>
                    </div>
                    <p className="text-[10px] text-stone-400 font-bold">Used when “Wholesale % of retail” is checked. Matches your vault price rounding setting.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowSiteProductCsvModal(false)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button type="button" onClick={() => { exportSiteProductCsv(); }} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Download CSV</button>
            </div>
          </div>
        </div>
      )}

      {/* Shopify Export Progress Modal – hidden when SHOPIFY_FEATURE_ENABLED is false */}
      {SHOPIFY_FEATURE_ENABLED && shopifyExportProgress === 'exporting' && (
        <div className="fixed inset-0 bg-charcoal/90 backdrop-blur-md z-[400] flex items-center justify-center pt-4 px-4 pb-modal-safe">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-brand p-10 space-y-6 shadow-2xl animate-in zoom-in-95 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-brand/20 animate-pulse">
              <span className="text-3xl">⟳</span>
            </div>
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Exporting to Shopify</h3>
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">Syncing items... This may take a minute for many items.</p>
          </div>
        </div>
      )}

      {/* Shopify Export Confirmation Modal – hidden when SHOPIFY_FEATURE_ENABLED is false */}
      {SHOPIFY_FEATURE_ENABLED && shopifyExportProgress && shopifyExportProgress !== 'exporting' && (
        <div className="fixed inset-0 bg-charcoal/90 backdrop-blur-md z-[400] flex items-center justify-center pt-4 px-4 pb-modal-safe">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-brand p-10 space-y-6 shadow-2xl animate-in zoom-in-95 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-brand/10 text-brand">
              <span className="text-2xl">✓</span>
            </div>
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Export Complete</h3>
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">
              {shopifyExportProgress.created > 0 || shopifyExportProgress.updated > 0
                ? `${shopifyExportProgress.created} created, ${shopifyExportProgress.updated} updated.${shopifyExportProgress.errors.length > 0 ? ` ${shopifyExportProgress.errors.length} error(s).` : ''}`
                : shopifyExportProgress.errors.length > 0
                  ? `Export failed. ${shopifyExportProgress.errors.slice(0, 2).join(' ')}`
                  : 'No items were synced.'}
            </p>
            {shopifyExportProgress.errors.length > 0 && shopifyExportProgress.errors.length <= 3 && (
              <p className="text-[10px] text-stone-500 font-bold">{shopifyExportProgress.errors.join(' ')}</p>
            )}
            <button onClick={() => setShopifyExportProgress(null)} className="w-full py-5 bg-charcoal text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand transition-all shadow-lg">Done</button>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Manual Price Edit</h3>
            {/* Rounding options */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-bold text-stone-400 uppercase">Round display to</span>
              {(['none', 1, 5, 10, 25] as const).map(opt => (
                <button key={opt} type="button" onClick={() => {
                  setPriceRoundingWithPersist(opt);
                  const r = (n: number) => opt === 'none' || n === 0 ? n : Math.ceil(n / opt) * opt;
                  setManualRetail(r(Number(editingItem.retail)).toFixed(2));
                  setManualWholesale(r(Number(editingItem.wholesale)).toFixed(2));
                }}
                  className={`py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase border transition-all ${priceRounding === opt ? 'bg-brand text-white border-brand' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                  {opt === 'none' ? 'None' : `$${opt}`}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <div><label className="text-[10px] font-black uppercase text-stone-400 mb-1 block">New Retail Price ($)</label>
                <input type="number" className="w-full p-4 bg-stone-50 border rounded-2xl outline-none focus:border-brand font-bold" value={manualRetail} onChange={(e) => setManualRetail(e.target.value)} /></div>
              <div><label className="text-[10px] font-black uppercase text-stone-400 mb-1 block">New Wholesale Cost ($)</label>
                <input type="number" className="w-full p-4 bg-stone-50 border rounded-2xl outline-none focus:border-brand font-bold" value={manualWholesale} onChange={(e) => setManualWholesale(e.target.value)} /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditingItem(null)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={handleManualPriceSave} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Save Vault</button>
            </div>
          </div>
        </div>
      )}

      {/* RECALCULATE MODAL (Individual) */}
      {recalcItem && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand max-h-[95vh] overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1 min-h-0 p-8 space-y-5 custom-scrollbar">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Scenario Calculator</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase">Temporarily recalculate logic with custom inputs</p>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-bold text-stone-400 uppercase">Round prices to</span>
              {(['none', 1, 5, 10, 25] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setPriceRoundingWithPersist(opt)}
                  className={`py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase border transition-all ${priceRounding === opt ? 'bg-brand text-white border-brand' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                  {opt === 'none' ? 'None' : `$${opt}`}
                </button>
              ))}
            </div>

            <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
              <p className="text-[9px] text-stone-500 italic">Leave blank to keep the previously saved spot price for each metal.</p>
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('gold')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Gold spot ($/ozt)</label>
                  <input type="number" placeholder={`${prices.gold}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.gold} onChange={(e) => setRecalcParams({ ...recalcParams, gold: e.target.value })} /></div>
              )}
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('silver')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Silver spot ($/ozt)</label>
                  <input type="number" placeholder={`${prices.silver}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.silver} onChange={(e) => setRecalcParams({ ...recalcParams, silver: e.target.value })} /></div>
              )}
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('platinum')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Platinum spot ($/ozt)</label>
                  <input type="number" placeholder={`${prices.platinum}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.platinum} onChange={(e) => setRecalcParams({ ...recalcParams, platinum: e.target.value })} /></div>
              )}
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('palladium')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Palladium spot ($/ozt)</label>
                  <input type="number" placeholder={`${prices.palladium}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.palladium} onChange={(e) => setRecalcParams({ ...recalcParams, palladium: e.target.value })} /></div>
              )}

              <hr className="border-stone-200" />

              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">New Labor Rate ($/hr)</label>
                <input type="number" placeholder="Enter rate to recalculate..." className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.laborRate} onChange={(e) => setRecalcParams({ ...recalcParams, laborRate: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Formula to use</label>
              <select
                value={recalcItemFormulaMode}
                onChange={(e) => setRecalcItemFormulaMode(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-200 bg-white text-sm font-bold outline-none focus:border-brand"
              >
                <option value="keep">Keep this item&apos;s current formula</option>
                <option value="A">Apply Formula A</option>
                <option value="B">Apply Formula B</option>
                {formulas.map((f) => (
                  <option key={f.id} value={f.id}>Apply &quot;{f.name}&quot;</option>
                ))}
              </select>
            </div>

            {/* LIVE CALCULATION DISPLAY */}
            <div className="p-4 bg-charcoal rounded-2xl text-white space-y-2">
              {(() => {
                const laborHours = recalcItem.hours || 1;
                const effectiveRate = recalcParams.laborRate
                  ? Number(recalcParams.laborRate)
                  : (Number(recalcItem.labor_at_making || 0) / laborHours);
                const newLaborCost = effectiveRate * laborHours;

                const stonesArray = convertStonesToArray(recalcItem);
                const applyFormula = recalcItemFormulaMode !== 'keep';
                const selectedCustomFormula = recalcItemFormulaMode !== 'keep' && recalcItemFormulaMode !== 'A' && recalcItemFormulaMode !== 'B'
                  ? formulas.find(f => f.id === recalcItemFormulaMode)
                  : null;
                let mult = recalcItem.multiplier;
                let mark = recalcItem.markup_b;
                if (applyFormula) {
                  if (recalcItemFormulaMode === 'A') mult = retailMultA;
                  else if (recalcItemFormulaMode === 'B') mark = markupB;
                }
                const calc = calculateFullBreakdown(
                  recalcItem.metals,
                  laborHours,
                  effectiveRate,
                  recalcItem.other_costs_at_making ?? 0,
                  stonesArray,
                  recalcItem.overhead_cost ?? 0,
                  (recalcItem.overhead_type as 'flat' | 'percent') || 'flat',
                  mult,
                  mark,
                  recalcParams,
                  false,
                  undefined,
                  findingsMultFromItem(recalcItem)
                );

                const itemForPricing = applyFormula
                  ? (recalcItemFormulaMode === 'A'
                    ? { ...recalcItem, strategy: 'A', custom_formula: null }
                    : recalcItemFormulaMode === 'B'
                      ? { ...recalcItem, strategy: 'B', custom_formula: null }
                      : selectedCustomFormula
                        ? { ...recalcItem, strategy: 'custom', custom_formula: { formula_base: selectedCustomFormula.formula_base, formula_wholesale: selectedCustomFormula.formula_wholesale, formula_retail: selectedCustomFormula.formula_retail, formula_name: selectedCustomFormula.name } }
                        : recalcItem)
                  : recalcItem;

                const itemPrices = getItemPrices(itemForPricing, calc);
                const liveRetail = itemPrices.retail;
                const liveWholesale = itemPrices.wholesale;

                return (
                  <>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-stone-400 uppercase">Recalculated Retail</span><span className="text-xl font-black">${roundForDisplay(liveRetail).toFixed(2)}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-stone-400 uppercase">Recalculated Wholesale</span><span className="text-lg font-black">${roundForDisplay(liveWholesale).toFixed(2)}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-stone-400 uppercase">Material Cost</span><span className="text-sm font-bold text-stone-300">${calc.totalMaterials.toFixed(2)}</span></div>

                    <div className="pl-2 space-y-1 my-1 border-l-2 border-stone-600">
                      {recalcItem.metals.map((m: any, idx: number) => {
                        const type = m.type.toLowerCase();
                        let hasOverride = false;
                        let newSpotVal = 0;
                        if (type.includes('gold') && recalcParams.gold) { hasOverride = true; newSpotVal = Number(recalcParams.gold); }
                        if (type.includes('silver') && recalcParams.silver) { hasOverride = true; newSpotVal = Number(recalcParams.silver); }
                        if (type.includes('platinum') && recalcParams.platinum) { hasOverride = true; newSpotVal = Number(recalcParams.platinum); }
                        if (type.includes('palladium') && recalcParams.palladium) { hasOverride = true; newSpotVal = Number(recalcParams.palladium); }

                        if (!hasOverride) return null;

                        const purities: any = { '10K Gold': 0.417, '14K Gold': 0.583, '18K Gold': 0.75, '22K Gold': 0.916, '24K Gold': 0.999, 'Sterling Silver': 0.925, 'Platinum 950': 0.95, 'Palladium': 0.95 };
                        const purity = purities[m.type] || 1;
                        const gramWeight = m.weight * UNIT_TO_GRAMS[m.unit];
                        const oldSpot = m.spotSaved || 0;
                        const oldVal = (oldSpot / 31.1035) * purity * gramWeight;
                        const newVal = (newSpotVal / 31.1035) * purity * gramWeight;

                        return (
                          <div key={idx} className="flex justify-between text-[9px] text-stone-400">
                            <span>{m.type}</span>
                            <span>${oldVal.toFixed(2)} → ${newVal.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase">Labor Cost (at {laborHours}h)</span>
                      <span className="text-sm font-bold text-stone-300">
                        ${Number(recalcItem.labor_at_making || 0).toFixed(2)} {recalcParams.laborRate && `→ $${newLaborCost.toFixed(2)}`}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setRecalcItem(null); setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' }); setRecalcItemFormulaMode('keep'); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Close Calculator</button>
              <button onClick={handleRecalcSync} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Sync to Vault</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Time Modal */}
      {showLogTimeModal && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-5">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">{editingTimeEntryId ? 'Edit Time Entry' : 'Log Time'}</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase">
              {editingTimeEntryId ? (logTimeItemId ? `Assigned to: ${(inventory.find(i => i.id === logTimeItemId)?.name || 'Piece').toUpperCase()}` : 'General / unassigned') : (logTimeItemId ? `Add time to: ${(inventory.find(i => i.id === logTimeItemId)?.name || 'Piece').toUpperCase()}` : 'Log general shop time (unassigned)')}
            </p>
            {logTimeAllowItemSelect && (
              <div ref={logTimeItemDropdownRef} className="relative">
                <label className="text-[9px] font-bold text-stone-400 uppercase block mb-1">Assign to piece (optional)</label>
                <input
                  type="text"
                  placeholder="Search pieces…"
                  value={logTimeItemDropdownOpen ? logTimeItemSearch : (logTimeItemId ? (inventory.find((i: any) => i.id === logTimeItemId)?.name || '').toUpperCase() : '')
                  }
                  onChange={e => { setLogTimeItemSearch(e.target.value); setLogTimeItemDropdownOpen(true); }}
                  onFocus={() => { setLogTimeItemDropdownOpen(true); setLogTimeItemSearch(logTimeItemId ? (inventory.find((i: any) => i.id === logTimeItemId)?.name || '') : ''); }}
                  onBlur={() => setTimeout(() => setLogTimeItemDropdownOpen(false), 150)}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-brand text-sm font-bold"
                />
                {logTimeItemDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg z-50">
                    <button
                      type="button"
                      onClick={() => { setLogTimeItemId(null); setLogTimeItemSearch(''); setLogTimeItemDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 text-sm font-bold hover:bg-stone-50 first:rounded-t-xl ${!logTimeItemId ? 'bg-brand/10 text-brand' : 'text-stone-600'}`}
                    >
                      General / unassigned
                    </button>
                    {inventory
                      .filter((i: any) => !logTimeItemSearch.trim() || (i.name || '').toUpperCase().includes(logTimeItemSearch.trim().toUpperCase()))
                      .map((i: any) => (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => { setLogTimeItemId(i.id); setLogTimeItemSearch(''); setLogTimeItemDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2.5 text-sm font-bold hover:bg-stone-50 last:rounded-b-xl ${logTimeItemId === i.id ? 'bg-brand/10 text-brand' : 'text-stone-800'}`}
                        >
                          {(i.name || '').toUpperCase()}
                        </button>
                      ))}
                    {inventory.filter((i: any) => !logTimeItemSearch.trim() || (i.name || '').toUpperCase().includes(logTimeItemSearch.trim().toUpperCase())).length === 0 && (
                      <div className="px-3 py-4 text-sm text-stone-400 font-bold">No pieces match</div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-[9px] font-bold text-stone-400 uppercase block mb-1">Date worked</label>
              <input
                type="date"
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-brand text-sm font-bold"
                value={logTimeDate || localTodayYYYYMMDD()}
                onChange={e => setLogTimeDate(e.target.value)}
              />
              <p className="text-[9px] text-stone-400 mt-1">Backdate or choose the day this time applies to.</p>
            </div>
            <div>
              <label className="text-[9px] font-bold text-stone-400 uppercase block mb-1">Hours</label>
              <input
                type="number"
                min={0.01}
                step={0.25}
                placeholder="e.g. 2.5"
                className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-brand font-bold"
                value={logTimeHours}
                onChange={e => setLogTimeHours(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-stone-400 uppercase block mb-1">Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Polishing, stone setting"
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-brand text-sm"
                value={logTimeNote}
                onChange={e => setLogTimeNote(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowLogTimeModal(false); setEditingTimeEntryId(null); setLogTimeItemId(null); setLogTimeItemSearch(''); setLogTimeItemDropdownOpen(false); setLogTimeHours(''); setLogTimeDate(''); setLogTimeNote(''); setLogTimeAllowItemSelect(false); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              {editingTimeEntryId ? (
                <button onClick={updateTimeEntry} disabled={!logTimeHours || parseFloat(logTimeHours) <= 0} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase transition shadow-lg ${!logTimeHours || parseFloat(logTimeHours) <= 0 ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-brand text-white hover:bg-forest'}`}>Update</button>
              ) : (
                <button onClick={saveTimeEntry} disabled={!logTimeHours || parseFloat(logTimeHours) <= 0} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase transition shadow-lg ${!logTimeHours || parseFloat(logTimeHours) <= 0 ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-brand text-white hover:bg-forest'}`}>Add time</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Piece Modal (draft - time-only) */}
      {showQuickAddPiece && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand p-8 space-y-5">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Quick Add Piece</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase">Create a draft piece to track time. Add metal and pricing later.</p>
            <input
              placeholder="Piece name"
              className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-brand font-bold"
              value={quickAddPieceName}
              onChange={e => setQuickAddPieceName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addQuickAddPiece()}
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowQuickAddPiece(false); setQuickAddPieceName(''); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={addQuickAddPiece} disabled={savingToVault || !quickAddPieceName.trim()} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase transition shadow-lg ${savingToVault || !quickAddPieceName.trim() ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-brand text-white hover:bg-forest'}`}>{savingToVault ? 'Saving…' : 'Add piece'}</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: GLOBAL RECALCULATE MODAL */}
      {showGlobalRecalc && (
        <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[200] flex items-center justify-center pt-4 px-4 pb-modal-safe animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-brand max-h-[95vh] overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1 min-h-0 p-8 space-y-5 custom-scrollbar">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Recalculate all items</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase">Update spot prices, labor rate, and formula for selected or all items</p>

            {/* Rounding options */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-bold text-stone-400 uppercase">Round prices to</span>
              {(['none', 1, 5, 10, 25] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setPriceRoundingWithPersist(opt)}
                  className={`py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase border transition-all ${priceRounding === opt ? 'bg-brand text-white border-brand' : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                  {opt === 'none' ? 'None' : `$${opt}`}
                </button>
              ))}
            </div>

            <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
              <p className="text-[9px] text-stone-500 italic">Leave blank to keep saved spot price for each metal.</p>
              <button
                type="button"
                onClick={() => setRecalcParams({
                  gold: prices.gold ? String(prices.gold) : '',
                  silver: prices.silver ? String(prices.silver) : '',
                  platinum: prices.platinum ? String(prices.platinum) : '',
                  palladium: prices.palladium ? String(prices.palladium) : '',
                  laborRate: recalcParams.laborRate
                })}
                className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase bg-brand text-white hover:bg-forest transition"
              >
                Fill with current spot prices
              </button>
              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Gold spot ($/ozt)</label>
                <input type="number" placeholder={`${prices.gold}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.gold} onChange={(e) => setRecalcParams({ ...recalcParams, gold: e.target.value })} /></div>

              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Silver spot ($/ozt)</label>
                <input type="number" placeholder={`${prices.silver}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.silver} onChange={(e) => setRecalcParams({ ...recalcParams, silver: e.target.value })} /></div>

              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Platinum spot ($/ozt)</label>
                <input type="number" placeholder={`${prices.platinum}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.platinum} onChange={(e) => setRecalcParams({ ...recalcParams, platinum: e.target.value })} /></div>

              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Palladium spot ($/ozt)</label>
                <input type="number" placeholder={`${prices.palladium}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.palladium} onChange={(e) => setRecalcParams({ ...recalcParams, palladium: e.target.value })} /></div>

              <hr className="border-stone-200" />

              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">New Labor Rate ($/hr)</label>
                <input type="number" placeholder="Enter new rate..." className="w-full p-3 bg-white border rounded-xl outline-none focus:border-brand font-bold text-sm" value={recalcParams.laborRate} onChange={(e) => setRecalcParams({ ...recalcParams, laborRate: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Formula to use</label>
              <select
                value={globalRecalcFormulaMode}
                onChange={(e) => setGlobalRecalcFormulaMode(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-200 bg-white text-sm font-bold outline-none focus:border-brand"
              >
                <option value="keep">Keep each item&apos;s current formula</option>
                <option value="A">Apply Formula A to all</option>
                <option value="B">Apply Formula B to all</option>
                {formulas.map((f) => (
                  <option key={f.id} value={f.id}>Apply &quot;{f.name}&quot; to all</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowGlobalRecalc(false); setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' }); setGlobalRecalcFormulaMode('keep'); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={handleGlobalRecalcSync} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Recalculate</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-charcoal/90 backdrop-blur-md z-[300] flex items-center justify-center pt-4 px-4 pb-modal-safe">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-brand p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center">
              <h3 className="text-xl font-black uppercase italic tracking-tighter">Secure the Vault</h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase mt-2">Enter your new master password</p>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New Password"
                className="w-full p-4 bg-stone-50 border rounded-2xl outline-none focus:border-brand font-bold"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-stone-300 hover:text-brand"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={handleUpdatePassword}
              className="w-full py-5 bg-charcoal text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand transition-all shadow-lg"
            >
              Update Vault Access
            </button>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed inset-0 bg-charcoal/90 backdrop-blur-md z-[400] flex items-center justify-center pt-4 px-4 pb-modal-safe">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-brand p-10 space-y-6 shadow-2xl animate-in zoom-in-95 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 ${notification.type === 'error' ? 'bg-red-50 text-red-500' :
                notification.type === 'info' ? 'bg-blue-50 text-blue-500' :
                  notification.type === 'confirm' ? 'bg-amber-50 text-amber-500' :
                    'bg-brand/10 text-brand'
              }`}>
              <span className="text-2xl">
                {notification.type === 'error' ? '⚠️' : notification.type === 'info' ? 'ℹ️' : notification.type === 'confirm' ? '❓' : '✨'}
              </span>
            </div>
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-foreground leading-tight">{notification.title}</h3>
            <p className="text-xs font-bold text-stone-500 leading-relaxed normal-case">
              {notification.message}
            </p>
            <div className="flex gap-3">
              {notification.type === 'confirm' ? (
                <>
                  <button onClick={() => setNotification(null)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
                  <button onClick={() => { notification.onConfirm?.(); setNotification(null); }} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Confirm</button>
                </>
              ) : notification.onConfirm ? (
                <>
                  <button onClick={() => setNotification(null)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Dismiss</button>
                  <button onClick={() => { notification.onConfirm?.(); setNotification(null); }} className="flex-1 py-4 bg-charcoal text-white rounded-2xl font-black text-[10px] uppercase hover:bg-brand transition shadow-lg">Retry</button>
                </>
              ) : (
                <button
                  onClick={() => setNotification(null)}
                  className="w-full py-5 bg-charcoal text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand transition-all shadow-lg"
                >
                  Understood
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex w-full min-h-0 flex-1 flex-col gap-6 overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] md:min-h-0 md:flex-none md:space-y-6 md:gap-0 md:overflow-visible md:pb-[env(safe-area-inset-bottom,0px)]">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white px-6 py-8 rounded-[2rem] border-2 shadow-sm gap-8 shrink-0 relative border-brand">
          <div className="hidden md:block md:w-1/4" />
          <div className="flex flex-col items-center justify-center text-center w-full md:w-2/4">
            <a
              href={orgSiteUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 hover:opacity-90 transition-opacity"
              aria-label={`${ORG_NAME} — visit website`}
            >
              <NextImage
                src={BOMA_HEADER_LOGO_PATH}
                alt=""
                width={1024}
                height={1024}
                className="h-16 sm:h-[4.75rem] w-auto max-w-[min(100%,220px)] sm:max-w-[260px] object-contain object-center block pointer-events-none"
                sizes="(max-width: 640px) 220px, 260px"
                priority
                unoptimized
              />
            </a>
            <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-1.5 self-stretch text-center leading-none">
              <h1
                className={`${vaultHeaderFont.className} w-full min-w-0 text-3xl font-black uppercase italic tracking-[0.1em] text-foreground leading-none [font-synthesis-weight:none] sm:text-4xl`}
              >
                THE VAULT
              </h1>
              <a
                href={orgSiteUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full min-w-0 text-balance text-[9px] font-black uppercase tracking-[0.12em] text-stone-600 transition-colors hover:text-brand"
              >
                {ORG_NAME}
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end justify-center gap-3 w-full md:w-1/4">
            <div className="relative flex flex-col items-center md:items-end gap-2 w-full">
              {(!user || user.is_anonymous) ? (
                <>
                  <button onClick={() => { setShowAuth(!showAuth); setShowPassword(false); }} className="w-48 text-[10px] font-black uppercase bg-charcoal text-white px-8 py-3 rounded-xl hover:bg-brand transition shadow-sm">Login / Sign Up</button>
                  {(!user || user.is_anonymous || !subscriptionStatus?.subscribed) && (
                    <button onClick={() => setShowVaultPlusModal(true)} className="w-48 text-[10px] font-black uppercase bg-charcoal text-white px-8 py-3 rounded-xl hover:bg-brand transition shadow-sm">
                      Upgrade to Vault+
                    </button>
                  )}
                </>
              ) : (
                <div className="relative account-menu-container">
                  <button
                    type="button"
                    onClick={() => setShowAccountMenu(!showAccountMenu)}
                    className="w-48 text-[10px] font-black uppercase px-8 py-3 rounded-xl transition bg-stone-100 text-foreground hover:bg-stone-200 flex items-center justify-center gap-1.5"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${user ? 'bg-brand animate-pulse' : 'bg-stone-300'}`} />
                    {profile?.logo_url ? (
                      <img src={`${profile.logo_url}${profile.logo_url.includes('?') ? '&' : '?'}t=${profileLogoCacheBuster}`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : null}
                    {profile?.company_name || profile?.display_name || user.email?.split('@')[0] || 'Account'} {showAccountMenu ? '▲' : '▼'}
                  </button>
                  {showAccountMenu && (
                    <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border-2 border-brand z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2">
                      {subscriptionStatus?.subscribed && (
                        <button onClick={() => { initiateManageSubscription(); setShowAccountMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                          Manage Subscription
                        </button>
                      )}
                      <button onClick={() => { setShowProfileModal(true); setShowAccountMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                        Profile
                      </button>
                      <button
                        type="button"
                        disabled={loggingOut}
                        onClick={async () => {
                          if (loggingOut) return;
                          setLoggingOut(true);
                          setShowAccountMenu(false);
                          try {
                            await Promise.race([
                              supabase.auth.signOut(),
                              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                            ]);
                          } catch (_) { /* ignore */ }
                          window.location.reload();
                        }}
                        className={`w-full px-4 py-3 text-left text-[10px] font-black uppercase transition-colors ${loggingOut ? 'text-stone-400 cursor-wait' : 'text-slate-700 hover:bg-stone-50'} border-t border-stone-100`}
                      >
                        {loggingOut ? 'Logging out…' : 'Logout'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {user && !user.is_anonymous && subscriptionStatus !== null && !subscriptionStatus.subscribed && (
                <button onClick={() => setShowVaultPlusModal(true)} className="w-48 text-[10px] font-black uppercase bg-charcoal text-white px-8 py-3 rounded-xl hover:bg-brand transition shadow-sm">
                  Upgrade to Vault+
                </button>
              )}
              {showAuth ? (
                <GoogleAuthShell clientId={GOOGLE_WEB_CLIENT_ID}>
                <div className="absolute right-0 mt-12 w-full md:w-80 bg-white p-6 rounded-3xl border-2 border-brand shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 mx-auto auth-menu-container">
                  <button onClick={() => { setShowAuth(false); setShowPassword(false); setSignUpAwaitingConfirmation(false); setPendingVaultPlusAfterAuth(false); }} className="absolute top-4 right-4 text-stone-300 hover:text-brand font-black text-sm">✕</button>
                  <h3 className="text-sm font-black uppercase mb-4 text-center text-foreground">Vault Access</h3>
                  {signUpAwaitingConfirmation ? (
                    <div className="space-y-4">
                      <p className="text-sm text-stone-600 text-center">We&apos;ve sent a verification link to <strong>{email}</strong>. Please confirm your account to get access to your Vault.</p>
                      <button type="button" onClick={handleResendConfirmation} disabled={resendingConfirmation} className="w-full py-3 rounded-xl text-[10px] font-black uppercase border-2 border-brand bg-brand/10 text-slate-800 hover:bg-brand hover:text-white transition disabled:opacity-50">
                        {resendingConfirmation ? 'Sending…' : 'Resend confirmation email'}
                      </button>
                      <button type="button" onClick={() => { setSignUpAwaitingConfirmation(false); setIsSignUp(false); }} className="w-full text-center text-[9px] font-black uppercase text-stone-600 hover:text-brand transition tracking-widest">Switch to Login</button>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {GOOGLE_WEB_CLIENT_ID ? (
                      <div className="w-full flex justify-center mb-4">
                        <GoogleLoginButton
                          onSuccess={handleGoogleHandshake}
                          onError={() => setNotification({ title: "Error", message: "Google Login Failed", type: 'error' })}
                          theme="outline"
                          size="large"
                          width="300"
                          shape="pill"
                          text="continue_with"
                        />
                      </div>
                      ) : (
                      <p className="text-[10px] text-center text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 leading-snug">
                        Google sign-in is not configured. Set <span className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span> in <span className="font-mono">.env.local</span> (and Vercel) to your Web client ID, then add this site under Authorized JavaScript origins in Google Cloud.
                      </p>
                      )}
                      <div className="flex border-b border-stone-100 mb-4">
                        <button onClick={() => { setIsSignUp(false); setShowPassword(false); }} className={`flex-1 py-2 text-[10px] font-black uppercase ${!isSignUp ? 'text-brand border-b-2 border-brand' : 'text-stone-300'}`}>Login</button>
                        <button onClick={() => { setIsSignUp(true); setShowPassword(false); }} className={`flex-1 py-2 text-[10px] font-black uppercase ${isSignUp ? 'text-brand border-b-2 border-brand' : 'text-stone-300'}`}>Sign Up</button>
                      </div>
                      <form onSubmit={handleAuth} className="space-y-3">
                        <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl text-sm outline-none focus:border-brand transition" value={email} onChange={e => setEmail(e.target.value)} required />
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            className="w-full p-3 border rounded-xl text-sm outline-none focus:border-brand transition"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-stone-300 hover:text-brand"
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                        <button type="submit" className="w-full bg-brand text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-forest transition shadow-md">{isSignUp ? 'Create Vault Account' : 'Open The Vault'}</button>
                        {!isSignUp && (
                          <button type="button" onClick={handleResetPassword} className="w-full text-center text-[9px] font-black uppercase text-stone-600 hover:text-brand transition mt-2 tracking-widest">Forgot Password?</button>
                        )}
                      </form>
                    </div>
                  )}
                </div>
                </GoogleAuthShell>
              ) : null}
            </div>
          </div>
        </div>

        {/* MARKET TICKER — same max width + horizontal alignment as tab bar below (`max-w-7xl mx-auto`) */}
        <div className="w-full px-2 shrink-0">
          <div className="w-full max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 w-full">
            {(['gold', 'silver', 'platinum', 'palladium'] as const).map((name) => {
              const spot = Number(prices[name]) || 0;
              const rawPct = prices[`${name}_pct`];
              const pct = rawPct == null || rawPct === '' ? NaN : Number(rawPct);
              const showPct = Number.isFinite(pct);
              return (
                <div
                  key={name}
                  className="bg-white p-2.5 sm:p-4 rounded-xl border-l-4 border-brand shadow-sm text-center md:text-left min-w-0"
                  title={showPct ? "Today's % vs prior session close (from live data)" : undefined}
                >
                  <p className="text-[9px] sm:text-[10px] font-black uppercase text-stone-400 truncate">{name}</p>
                  <p className="text-base sm:text-xl font-bold tabular-nums text-foreground">
                    {spot > 0 ? `$${spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--.--'}
                  </p>
                  {showPct ? (
                    <p
                      className={`text-[10px] sm:text-[11px] font-bold tabular-nums mt-0.5 sm:mt-1 ${pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                    >
                      {pct >= 0 ? '+' : ''}
                      {pct.toFixed(2)}% <span className="text-[8px] sm:text-[9px] font-semibold text-stone-400 uppercase tracking-wide">today</span>
                    </p>
                  ) : spot > 0 ? (
                    <p className="text-[10px] font-medium text-stone-300 mt-0.5 sm:mt-1 tabular-nums">—</p>
                  ) : null}
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Tab Navigation — horizontal scroll on small screens; even-width row on md+ */}
        <div className="w-full px-2 shrink-0">
          <div className="bg-white rounded-2xl border border-brand shadow-sm p-2 w-full max-w-7xl mx-auto">
            <div
              className="flex w-full gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] scroll-smooth md:overflow-visible"
              role="tablist"
              aria-label="Sections"
            >
              {MAIN_NAV_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-shrink-0 md:flex-1 md:min-w-0 py-3 px-3 md:px-4 text-xs md:text-sm font-black uppercase tracking-tighter transition-all rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${t.id === 'vault' ? 'relative flex items-center justify-center gap-1.5' : ''} ${activeTab === t.id ? 'bg-brand text-white shadow-inner' : t.id === 'vault' && inventory.length > 0 ? 'text-stone-500' : 'text-stone-400 hover:text-stone-600'}`}
                >
                  {t.label}
                  {t.id === 'vault' && inventory.length > 0 && activeTab === 'vault' ? (
                    <span className="text-[10px] font-bold opacity-90">({inventory.length})</span>
                  ) : null}
                  {t.id === 'vault' && inventory.length > 0 && activeTab !== 'vault' ? (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand animate-pulse" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Single full-width panel per tab - one visible at a time */}
        <div className="mx-auto flex w-full min-h-0 flex-1 flex-col overflow-hidden md:max-h-[calc(100vh-5rem)] md:flex-initial">
          {/* CALCULATOR PANEL */}
          <div className={`flex min-h-0 flex-1 flex-col lg:max-h-[calc(100vh-5rem)] ${activeTab !== 'calculator' ? 'hidden' : ''}`}>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border-2 border-brand bg-white shadow-xl lg:h-full lg:min-h-0">
              <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] md:space-y-4 md:p-8 md:pb-8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-foreground shrink-0">Calculator</h2>

              {/* Desktop: side-by-side layout with independent scrolling per column */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] lg:gap-10 xl:gap-12 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              {/* LEFT: Components - metal, stones, labor (overscroll-behavior not contained so scroll chains to page at boundaries) */}
              <div className="lg:rounded-2xl lg:bg-stone-50/50 lg:border lg:border-stone-100 lg:min-h-0 lg:overflow-hidden lg:flex lg:flex-col">
              <div className="space-y-4 lg:p-5 lg:pr-6 lg:overflow-y-auto lg:custom-scrollbar lg:flex-1 lg:min-h-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand lg:mb-1 hidden lg:block">Components</p>
              {/* Calculator section tabs: one visible at a time */}
              <div className="space-y-3 max-md:scroll-mt-2">
                <div>
                  <p className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight">What&apos;s in this piece?</p>
                  <p className="text-[10px] sm:text-xs text-stone-500 font-medium leading-snug mt-1 max-md:max-w-[20rem]">
                    <span className="md:hidden">Choose Metal, Stones, or Labor below.</span>
                    <span className="hidden md:inline">Tap a section to add metal, stones, or labor.</span>
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-2 p-2.5 rounded-2xl bg-white border border-stone-200/90 shadow-sm min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveCalculatorTab('metal')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-3 rounded-xl min-h-[44px] text-[10px] sm:text-xs font-black uppercase tracking-wide transition-all min-w-0 ${activeCalculatorTab === 'metal' ? 'bg-brand text-white shadow-sm ring-1 ring-brand/30' : 'bg-stone-50 text-slate-700 border border-stone-200/90 hover:border-brand/40 hover:bg-white active:bg-stone-100'}`}
                  >
                    <span className="truncate">Metal</span>
                    <span
                      className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-black border cursor-default ${activeCalculatorTab === 'metal' ? 'bg-white/20 text-white border-white/40' : 'bg-brand text-white border-brand'}`}
                      title="Metals are required to add this piece to the vault"
                    >
                      ✓
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCalculatorTab('stones')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-3 rounded-xl min-h-[44px] text-[10px] sm:text-xs font-black uppercase tracking-wide transition-all min-w-0 ${activeCalculatorTab === 'stones' ? 'bg-brand text-white shadow-sm ring-1 ring-brand/30' : 'bg-stone-50 text-slate-700 border border-stone-200/90 hover:border-brand/40 hover:bg-white active:bg-stone-100'}`}
                  >
                    <span className="truncate">Stones</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setActiveCalculatorTab('stones'); setIncludeStonesSection(!includeStonesSection); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveCalculatorTab('stones'); setIncludeStonesSection(!includeStonesSection); } }}
                      className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-black border-2 transition-colors ${activeCalculatorTab === 'stones' && includeStonesSection ? 'bg-white/20 text-white border-white/40' : includeStonesSection ? 'bg-brand text-white border-brand' : 'bg-white text-stone-400 border-stone-200'}`}
                      title={includeStonesSection ? 'Included in price (click to exclude)' : 'Excluded from price (click to include)'}
                    >
                      {includeStonesSection ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCalculatorTab('labor')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-3 rounded-xl min-h-[44px] text-[10px] sm:text-xs font-black uppercase tracking-wide transition-all min-w-0 ${activeCalculatorTab === 'labor' ? 'bg-brand text-white shadow-sm ring-1 ring-brand/30' : 'bg-stone-50 text-slate-700 border border-stone-200/90 hover:border-brand/40 hover:bg-white active:bg-stone-100'}`}
                  >
                    <span className="truncate sm:hidden">Labor</span>
                    <span className="truncate hidden sm:inline">Labor & other</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setActiveCalculatorTab('labor'); setIncludeLaborSection(!includeLaborSection); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveCalculatorTab('labor'); setIncludeLaborSection(!includeLaborSection); } }}
                      className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-black border-2 transition-colors ${activeCalculatorTab === 'labor' && includeLaborSection ? 'bg-white/20 text-white border-white/40' : includeLaborSection ? 'bg-brand text-white border-brand' : 'bg-white text-stone-400 border-stone-200'}`}
                      title={includeLaborSection ? 'Included in price (click to exclude)' : 'Excluded from price (click to include)'}
                    >
                      {includeLaborSection ? '✓' : ''}
                    </span>
                  </button>
                </div>
              </div>

              {activeCalculatorTab === 'metal' && (
              <div className="space-y-2 pt-2 md:pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Metal components</p>
                <div className="p-4 max-md:bg-white max-md:border max-md:border-stone-200 max-md:shadow-sm md:bg-stone-50 rounded-2xl md:border-2 md:border-dotted md:border-stone-300 space-y-3">
                <select className="w-full p-3 border border-stone-200 rounded-xl font-bold bg-white focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none transition-shadow" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                  <option>Sterling Silver</option><option>10K Gold</option><option>14K Gold</option><option>18K Gold</option><option>22K Gold</option><option>24K Gold</option><option>Platinum 950</option><option>Palladium</option>
                </select>
                <div className="flex gap-2">
                  <input type="text" inputMode="decimal" autoComplete="off" placeholder="Weight" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none transition-shadow tabular-nums" value={tempWeight} onChange={e => { const t = e.target.value; if (t === '' || /^[0-9]*\.?[0-9]*$/.test(t)) setTempWeight(t); }} />
                  <select className="p-3 border border-stone-200 rounded-xl text-[10px] font-bold focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>{Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}</select>
                </div>
                <div className="space-y-2">
                  <select className="w-full p-3 border border-stone-200 rounded-xl text-[10px] font-bold bg-white focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none" value={useManualPrice ? "manual" : "spot"} onChange={(e) => setUseManualPrice(e.target.value === "manual")}>
                    <option value="spot">Use live spot ($/ozt)</option>
                    <option value="manual">Custom spot ($/ozt)</option>
                  </select>
                  {useManualPrice && (
                    <div className="space-y-1 animate-in fade-in">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={(() => {
                          const t = tempMetal.toLowerCase();
                          if (t.includes('gold')) return String(prices.gold || '');
                          if (t.includes('silver')) return String(prices.silver || '');
                          if (t.includes('platinum')) return String(prices.platinum || '');
                          if (t.includes('palladium')) return String(prices.palladium || '');
                          return 'e.g. 2650';
                        })()}
                        className="w-full p-3 border border-brand rounded-xl text-sm focus:ring-2 focus:ring-brand/30 focus:outline-none"
                        value={manualPriceInput}
                        onChange={(e) => { const t = e.target.value; if (t === '' || /^[0-9]*\.?[0-9]*$/.test(t)) setManualPriceInput(t); }}
                      />
                      <p className="text-[9px] font-bold text-stone-500 normal-case leading-snug">Same unit as market spot: $USD/ozt.</p>
                    </div>
                  )}
                </div>
                <button onClick={addMetalToPiece} className="w-full bg-charcoal text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-brand transition-colors">+ Add metal</button>
                {metalList.map((m, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border border-stone-100 flex justify-between items-center">
                    <span className="text-slate-700">{m.weight}{m.unit} {m.type}</span>
                    <button onClick={() => setMetalList(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 text-lg hover:text-red-700 transition-colors">×</button>
                  </div>
                ))}
                </div>
              </div>
              )}

              {activeCalculatorTab === 'stones' && (
              <div className="space-y-2 pt-2 md:pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Stones</p>
                <div className="p-4 max-md:bg-white max-md:border max-md:border-stone-200 max-md:shadow-sm md:bg-stone-50 rounded-2xl md:border-2 md:border-dotted md:border-stone-300 space-y-3">
                <input
                  type="text"
                  placeholder="Stone name (optional — e.g. Diamond, Ruby)"
                  className="w-full p-3 border border-stone-200 rounded-xl font-bold bg-white focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none text-[10px]"
                  value={tempStoneName}
                  onChange={e => setTempStoneName(e.target.value)}
                />
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Cost ($)</label>
                    <input type="number" min={0} placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none" value={tempStoneCost} onChange={e => setTempStoneCost(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div className="w-28">
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Multiplier (×)</label>
                    <div className="flex items-center border border-stone-200 rounded-xl focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-[#2d4a22] bg-white">
                      <span className="pl-3 text-stone-400 font-black text-sm">×</span>
                      <input type="number" min={0} step="0.1" placeholder="2" className="flex-1 p-3 pl-1 pr-3 text-[10px] font-bold focus:outline-none bg-transparent w-14" value={tempStoneMarkup} onChange={e => setTempStoneMarkup(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
                <button onClick={addStoneToPiece} className="w-full bg-charcoal text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-brand transition-colors">+ Add stone</button>
                {stoneList.map((stone, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border border-stone-100 flex justify-between items-center">
                    <span className="text-slate-700">{stone.name} ${stone.cost.toFixed(2)} ×{stone.markup.toFixed(1)}</span>
                    <button onClick={() => setStoneList(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 text-lg hover:text-red-700 transition-colors">×</button>
                  </div>
                ))}
                <details className="group mt-2">
                  <summary className="text-[10px] font-black uppercase tracking-wider text-stone-400 cursor-pointer list-none flex items-center gap-1.5 hover:text-stone-600 [&::-webkit-details-marker]:hidden">
                    <span className="group-open:rotate-90 transition-transform inline-block">›</span> Typical markup guide
                  </summary>
                  <div className="mt-2 p-3 bg-white rounded-xl border border-stone-200 text-[10px] space-y-3">
                    <div className="flex justify-between gap-4 font-bold text-slate-800 border-b border-stone-100 pb-1.5 hidden sm:flex">
                      <span>Item type</span>
                      <span className="text-right shrink-0">Typical multiplier</span>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-center sm:gap-4 text-stone-600">
                      <span className="font-medium text-slate-700">Loose diamonds</span>
                      <span className="sm:text-right sm:shrink-0">1.6× – 1.9× (60–90% over cost)</span>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-center sm:gap-4 text-stone-600">
                      <span className="font-medium text-slate-700">Common gemstones</span>
                      <span className="sm:text-right sm:shrink-0">2× – 3×</span>
                    </div>
                  </div>
                </details>
                </div>
              </div>
              )}

              {activeCalculatorTab === 'labor' && (
              <div className="space-y-2 pt-2 md:pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Labor & overhead</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Labor $/hr</label>
                      <input type="number" min={0} placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none" value={rate} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setRate(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Hours</label>
                      <input type="number" min={0} step="0.1" placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none" value={hours} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setHours(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Overhead</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" min={0} placeholder="0" className="flex-1 p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none pr-2" value={overheadCost} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setOverheadCost(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                      <div className="flex rounded-xl border border-stone-200 overflow-hidden bg-stone-50">
                        <button type="button" onClick={() => setOverheadType('flat')} className={`px-3 py-2.5 text-[10px] font-black uppercase transition-colors ${overheadType === 'flat' ? 'bg-charcoal text-white' : 'text-stone-400 hover:text-slate-700'}`}>$</button>
                        <button type="button" onClick={() => setOverheadType('percent')} className={`px-3 py-2.5 text-[10px] font-black uppercase transition-colors ${overheadType === 'percent' ? 'bg-charcoal text-white' : 'text-stone-400 hover:text-slate-700'}`}>%</button>
                      </div>
                    </div>
                    <details className="group mt-2">
                      <summary className="text-[10px] font-black uppercase tracking-wider text-stone-400 cursor-pointer list-none flex items-center gap-1.5 hover:text-stone-600 [&::-webkit-details-marker]:hidden">
                        <span className="group-open:rotate-90 transition-transform inline-block">›</span> How overhead pricing works
                      </summary>
                      <div className="mt-2 p-3 bg-white rounded-xl border border-stone-200 text-[10px] space-y-3">
                        <p className="text-stone-600 leading-relaxed">
                          Overhead covers shop costs — rent, utilities, tools, packaging, insurance, etc. — that get spread across each piece.
                        </p>
                        <div className="space-y-2">
                          <p className="font-bold text-slate-700">Percent (%)</p>
                          <p className="text-stone-600">
                            Applied to your total job cost (Metal + Labor + Other + Stone cost). Example: 15% on $200 of costs = $30 overhead.
                          </p>
                          <p className="font-bold text-slate-700">Flat ($)</p>
                          <p className="text-stone-600">
                            A fixed amount added per piece — e.g. $5 for packaging/shipping, or a set shop fee.
                          </p>
                        </div>
                      </div>
                    </details>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Findings / other ($)</label>
                    <input type="number" min={0} placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-brand/30 focus:outline-none" value={otherCosts} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setOtherCosts(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                  </div>
                  {strategy !== 'custom' && (
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Findings retail × <span className="normal-case text-stone-400 font-semibold">(optional)</span></label>
                      <div className="flex items-center border border-stone-200 rounded-xl focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-[#2d4a22] bg-white">
                        <span className="pl-3 text-stone-400 font-black text-sm">×</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={strategy === 'B' ? `e.g. ${(2 * markupB).toFixed(2)} (2× materials markup)` : `e.g. ${retailMultA}`}
                          className="flex-1 p-3 pl-1 pr-3 text-sm font-bold focus:outline-none bg-transparent min-w-0 tabular-nums"
                          value={findingsRetailMultInput}
                          onChange={(e) => { const t = e.target.value; if (t === '' || /^[0-9]*\.?[0-9]*$/.test(t)) setFindingsRetailMultInput(t); }}
                        />
                      </div>
                      <p className="text-[9px] font-medium text-stone-500 mt-1.5 normal-case leading-snug">Leave blank to use your formula&apos;s default on findings (same as before). Formula A uses your retail multiplier; Formula B uses 2× your materials markup.</p>
                    </div>
                  )}
                </div>
              </div>
              )}

              </div>
              </div>
              {/* RIGHT: Prices - cost breakdown, formula cards, save */}
              <div className="mt-6 lg:mt-0 flex flex-col min-h-0 lg:min-h-0 lg:rounded-2xl lg:bg-white lg:border-2 lg:border-brand/20 lg:shadow-sm lg:overflow-hidden">
              <div className="flex flex-col gap-5 lg:p-6 lg:overflow-y-auto lg:custom-scrollbar lg:flex-1 lg:min-h-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-brand hidden lg:block">Your price</p>
                <div className="w-full space-y-2">
                  <button
                    type="button"
                    onClick={() => setCostBreakdownOpen(!costBreakdownOpen)}
                    className="w-full flex items-center justify-between text-left py-2 px-3 lg:-mx-3 rounded-xl hover:bg-stone-100/80 transition-colors group"
                    aria-expanded={costBreakdownOpen}
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 group-hover:text-stone-600">Cost breakdown</p>
                    <span className={`text-stone-400 text-[10px] transition-transform ${costBreakdownOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                {costBreakdownOpen && (
                <div className="w-full p-4 rounded-xl bg-stone-100/80 border border-stone-200 space-y-3 text-left">
                  <div className="flex justify-between items-center py-2 border-b border-stone-200"><span className="text-stone-500 font-bold uppercase text-[10px]">Materials Total (Metal+Stone+Other)</span><span className="font-black text-foreground">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).totalMaterials.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2 border-b border-stone-200"><span className="text-stone-500 font-bold uppercase text-[10px]">Labor Total ({Number(calcHours) || 0}h)</span><span className="font-black text-foreground">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).labor.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2"><span className="text-stone-500 font-bold uppercase text-[10px]">Overhead Total ({overheadType === 'percent' ? `${Number(calcOverheadCost) || 0}%` : 'Flat'})</span><span className="font-black text-foreground">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).overhead.toFixed(2)}</span></div>
                </div>
                )}
                </div>

                <hr className="w-full border-t border-stone-200/60 my-1" />

                <div className="w-full space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Retail price</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] font-bold text-stone-400 uppercase w-full lg:w-auto">Round to</span>
                  <div className="flex flex-wrap gap-1.5">
                  {(['none', 1, 5, 10, 25] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPriceRoundingWithPersist(opt)}
                      className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase border transition-all ${priceRounding === opt ? 'bg-brand text-white border-brand shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100 hover:border-stone-300'}`}
                    >
                      {opt === 'none' ? 'None' : `$${opt}`}
                    </button>
                  ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-3 lg:gap-4 w-full">
                  {formulas.length > 0 && (
                    customStrategyExpanded ? (
                      <div
                        className={`rounded-2xl border-2 transition-all overflow-hidden lg:shadow-sm ${strategy === 'custom' ? 'border-brand bg-stone-50 shadow-md ring-2 ring-brand/20' : 'border-stone-100 bg-white hover:border-stone-200'}`}
                      >
                        <div className="w-full p-5">
                          <button
                            type="button"
                            onClick={() => {
                              if (subscriptionStatus && !subscriptionStatus.subscribed) {
                                setShowVaultPlusModal(true);
                                return;
                              }
                              setStrategy('custom');
                            }}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-[10px] font-black text-brand uppercase tracking-tighter">Custom</p>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setCustomStrategyExpanded(false); setStrategy('A'); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setCustomStrategyExpanded(false); setStrategy('A'); } }}
                                className="text-[9px] font-bold text-stone-400 hover:text-stone-600 uppercase cursor-pointer"
                              >
                                Hide
                              </span>
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">
                              ${(() => {
                                const a = calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult);
                                const p = getStrategyPrices(a);
                                return roundForDisplay(p.retail).toFixed(2);
                              })()}
                            </p>
                            <p className="text-[10px] font-semibold text-stone-500 mt-1">
                              Wholesale ${(() => {
                                const a = calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult);
                                const p = getStrategyPrices(a);
                                return roundForDisplay(p.wholesale).toFixed(2);
                              })()}
                            </p>
                          </button>
                          <div className="border-t border-stone-200 mt-3 pt-3">
                            <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mb-2">Select formula</p>
                            <select
                              value={selectedFormulaId || ''}
                              onChange={(e) => {
                                const id = e.target.value || null;
                                setSelectedFormulaId(id);
                                const f = formulas.find(x => x.id === id);
                                if (f) {
                                  setCustomFormulaModel({ formula_base: f.formula_base, formula_wholesale: f.formula_wholesale, formula_retail: f.formula_retail });
                                } else {
                                  setCustomFormulaModel({ formula_base: PRESET_A.base, formula_wholesale: PRESET_A.wholesale, formula_retail: PRESET_A.retail });
                                }
                              }}
                              className="w-full p-3 rounded-xl border border-stone-200 bg-white text-sm font-bold outline-none focus:border-brand"
                            >
                              <option value="">Choose a formula…</option>
                              {formulas.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setActiveTab('formulas')}
                              className="mt-2 text-[9px] font-bold text-brand hover:underline"
                            >
                              Manage formulas →
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (subscriptionStatus && !subscriptionStatus.subscribed) {
                            setShowVaultPlusModal(true);
                            return;
                          }
                          setCustomStrategyExpanded(true);
                          setStrategy('custom');
                        }}
                        className="w-full flex items-center justify-between gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50 hover:border-brand/50 hover:bg-stone-50 text-left transition-colors group"
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 group-hover:text-brand">Use Custom Formula</span>
                        <span className="text-stone-400 text-xs group-hover:text-brand">+</span>
                      </button>
                    )
                  )}
                  <div
                    className={`rounded-2xl border-2 transition-all overflow-hidden lg:shadow-sm ${strategy === 'A' ? 'border-brand bg-stone-50 shadow-md ring-2 ring-brand/20' : 'border-stone-100 bg-white hover:border-stone-200'}`}
                  >
                    <button
                      type="button"
                      onClick={() => { setStrategy('A'); setCustomStrategyExpanded(false); }}
                      className="w-full flex flex-col sm:flex-row sm:items-stretch sm:gap-4 p-5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-brand uppercase tracking-tighter mb-1">Formula A</p>
                        <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">${roundForDisplay(calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).retailA).toFixed(2)}</p>
                        <p className="text-[10px] font-semibold text-stone-500 mt-1">Wholesale ${roundForDisplay(calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).wholesaleA).toFixed(2)}</p>
                      </div>
                    </button>
                    <div className="border-t border-stone-200 sm:border-t-0 sm:border-l min-w-0 sm:min-w-[180px]">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFormulaAOpen(!formulaAOpen); }}
                        className="w-full flex items-center justify-between gap-2 py-2.5 px-4 sm:px-5 text-left hover:bg-stone-100/80 transition-colors"
                        aria-expanded={formulaAOpen}
                      >
                        <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider">Formula</span>
                        <span className={`text-stone-400 text-[10px] transition-transform shrink-0 ${formulaAOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {formulaAOpen && (
                        <div className="px-4 pb-4 pt-0 sm:px-5 sm:pt-0 space-y-1.5 overflow-x-auto">
                          <p className="text-[9px] text-stone-500 font-medium leading-tight">Base = Metal + Labor + Other + Overhead</p>
                          <p className="text-[9px] text-stone-500 font-medium leading-tight">Wholesale = Base + Stone cost</p>
                          <div className="flex items-center gap-1 flex-wrap leading-tight">
                            <span className="text-[9px] text-stone-500 font-medium">Retail = (Base ×</span>
                            <input
                              type="number"
                              step="0.1"
                              className="min-w-12 w-14 bg-white border border-stone-200 rounded-lg text-xs font-bold py-1.5 px-2 text-center outline-none text-foreground focus:border-brand"
                              value={retailMultA}
                              onChange={(e) => setRetailMultA(Number(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-[9px] text-stone-500 font-medium">) + Stone retail</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`rounded-2xl border-2 transition-all overflow-hidden lg:shadow-sm ${strategy === 'B' ? 'border-brand bg-stone-50 shadow-md ring-2 ring-brand/20' : 'border-stone-100 bg-white hover:border-stone-200'}`}
                  >
                    <button
                      type="button"
                      onClick={() => { setStrategy('B'); setCustomStrategyExpanded(false); }}
                      className="w-full flex flex-col sm:flex-row sm:items-stretch sm:gap-4 p-5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-brand uppercase tracking-tighter mb-1">Formula B</p>
                        <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">${roundForDisplay(calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).retailB).toFixed(2)}</p>
                        <p className="text-[10px] font-semibold text-stone-500 mt-1">Wholesale ${roundForDisplay(calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult).wholesaleB).toFixed(2)}</p>
                      </div>
                    </button>
                    <div className="border-t border-stone-200 sm:border-t-0 sm:border-l min-w-0 sm:min-w-[220px]">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFormulaBOpen(!formulaBOpen); }}
                        className="w-full flex items-center justify-between gap-2 py-2.5 px-4 sm:px-5 text-left hover:bg-stone-100/80 transition-colors"
                        aria-expanded={formulaBOpen}
                      >
                        <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider">Formula</span>
                        <span className={`text-stone-400 text-[10px] transition-transform shrink-0 ${formulaBOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {formulaBOpen && (
                        <div className="px-4 pb-4 pt-0 sm:px-5 sm:pt-0 space-y-1.5 overflow-x-auto">
                          <div className="flex items-center gap-1 flex-wrap leading-tight">
                            <span className="text-[9px] text-stone-500 font-medium">Base = ((Metal + Other) ×</span>
                            <input
                              type="number"
                              step="0.1"
                              className="min-w-12 w-14 bg-white border border-stone-200 rounded-lg text-xs font-bold py-1.5 px-2 text-center outline-none text-foreground focus:border-brand"
                              value={markupB}
                              onChange={(e) => setMarkupB(Number(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-[9px] text-stone-500 font-medium">) + Labor + Overhead</span>
                          </div>
                          <p className="text-[9px] text-stone-500 font-medium leading-tight">Wholesale = Base + Stone cost</p>
                          <p className="text-[9px] text-stone-500 font-medium leading-tight">Retail = (Base × 2) + Stone retail</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {formulas.length === 0 && (
                    !customStrategyExpanded ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (subscriptionStatus && !subscriptionStatus.subscribed) {
                            setShowVaultPlusModal(true);
                            return;
                          }
                          setCustomStrategyExpanded(true);
                          setStrategy('custom');
                        }}
                        className="w-full flex items-center justify-between gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50 hover:border-brand/50 hover:bg-stone-50 text-left transition-colors group"
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 group-hover:text-brand">Add Custom Price Formula</span>
                        <span className="text-stone-400 text-xs group-hover:text-brand">+</span>
                      </button>
                    ) : (
                      <div
                        className={`rounded-2xl border-2 transition-all overflow-hidden lg:shadow-sm ${strategy === 'custom' ? 'border-brand bg-stone-50 shadow-md ring-2 ring-brand/20' : 'border-stone-100 bg-white hover:border-stone-200'}`}
                      >
                        <div className="w-full p-5">
                          <button
                            type="button"
                            onClick={() => {
                              if (subscriptionStatus && !subscriptionStatus.subscribed) {
                                setShowVaultPlusModal(true);
                                return;
                              }
                              setStrategy('custom');
                            }}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-[10px] font-black text-brand uppercase tracking-tighter">Custom</p>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setCustomStrategyExpanded(false); setStrategy('A'); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setCustomStrategyExpanded(false); setStrategy('A'); } }}
                                className="text-[9px] font-bold text-stone-400 hover:text-stone-600 uppercase cursor-pointer"
                              >
                                Hide
                              </span>
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">
                              ${(() => {
                                const a = calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult);
                                const p = getStrategyPrices(a);
                                return roundForDisplay(p.retail).toFixed(2);
                              })()}
                            </p>
                            <p className="text-[10px] font-semibold text-stone-500 mt-1">
                              Wholesale ${(() => {
                                const a = calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType, undefined, undefined, undefined, applyManualMetalInCalculator, undefined, calculatorFindingsMult);
                                const p = getStrategyPrices(a);
                                return roundForDisplay(p.wholesale).toFixed(2);
                              })()}
                            </p>
                          </button>
                          <div className="border-t border-stone-200 mt-3 pt-3">
                            <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mb-2">Select formula</p>
                            <button
                              type="button"
                              onClick={() => { setActiveTab('formulas'); setFormulaEditorOpen(true); setEditingFormulaId(null); setFormulaDraftName(''); setFormulaDraftTokens({ base: formulaToTokens(PRESET_A.base), wholesale: formulaToTokens(PRESET_A.wholesale), retail: formulaToTokens(PRESET_A.retail) }); }}
                              className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50 hover:border-brand/50 text-left text-[10px] font-bold text-stone-500 hover:text-brand transition"
                            >
                              Create your first formula →
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
                </div>

                <hr className="w-full border-t border-stone-200/60 my-2" />

                <div className="w-full space-y-3 pt-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Save to vault</p>
                <div className="w-full space-y-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-stone-50/80 border border-stone-100 lg:border-stone-200/60">
                  <input
                    placeholder="Product name"
                    className="w-full p-4 bg-white border border-stone-200 rounded-xl outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-all font-bold placeholder:font-normal placeholder:text-stone-400"
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                  />
                  {!editingItemId && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={saveAsDraft} onChange={e => setSaveAsDraft(e.target.checked)} className="w-4 h-4 accent-brand rounded border-stone-300" />
                      <span className="text-[10px] font-bold text-stone-600 uppercase">Save as draft / time-only</span>
                    </label>
                  )}
                  {editingItemId && (
                    <p className="text-[10px] font-bold text-amber-700 uppercase">Adding metals & components to existing piece</p>
                  )}
                  <div className="flex gap-2">
                    {editingItemId && (
                      <button type="button" onClick={() => { setEditingItemId(null); setItemName(''); setMetalList([]); setStoneList([]); setHours(''); setRate(''); setOtherCosts(''); setOverheadCost(''); setFindingsRetailMultInput(''); setActiveTab('vault'); }} className="flex-1 py-4 rounded-2xl font-black uppercase tracking-[0.12em] text-sm bg-stone-200 text-stone-600 hover:bg-stone-300 transition-all">Cancel</button>
                    )}
                    <button type="button" onClick={addToInventory} disabled={(isGuest && !token && hasTurnstile) || savingToVault} className={`${editingItemId ? 'flex-1' : 'w-full'} py-4 rounded-2xl font-black uppercase tracking-[0.12em] text-sm transition-all ${(isGuest && !token && hasTurnstile) || savingToVault ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-brand text-white shadow-lg hover:bg-forest hover:shadow-xl active:scale-[0.98]'}`}>{(isGuest && !token && hasTurnstile) ? "Verifying…" : savingToVault ? "Saving…" : editingItemId ? "Update item" : "Save to vault"}</button>
                  </div>
                </div>
                </div>

                {isGuest && !token && hasTurnstile && <div className="w-full flex justify-center mt-4 h-auto overflow-hidden animate-in fade-in slide-in-from-top-1"><Turnstile siteKey={turnstileSiteKey} onSuccess={(token) => setToken(token)} options={{ theme: 'light', appearance: 'interaction-only' }} /></div>}
              </div>
              </div>
              </div>
            </div>
            </div>
          </div>

          {vaultTabVisited && (
            <div className={activeTab !== 'vault' ? 'hidden' : ''}>
              <VaultTabPanel
                SHOPIFY_FEATURE_ENABLED={SHOPIFY_FEATURE_ENABLED}
                VAULT_DIAGNOSTICS_UI_ENABLED={VAULT_DIAGNOSTICS_UI_ENABLED}
                VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED={VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED}
                MAX_VAULT_PHOTO_UPLOAD_BYTES={MAX_VAULT_PHOTO_UPLOAD_BYTES}
                VAULT_PHOTO_ACCEPT={VAULT_PHOTO_ACCEPT}
                VAULT_PLUS_PRICE_PHRASE={VAULT_PLUS_PRICE_PHRASE}
                addCustomLocation={addCustomLocation}
                addCustomTag={addCustomTag}
                calculateFullBreakdown={calculateFullBreakdown}
                clearTag={clearTag}
                convertStonesToArray={convertStonesToArray}
                deleteInventoryItem={deleteInventoryItem}
                deleteLocation={deleteLocation}
                deleteTagFromLibrary={deleteTagFromLibrary}
                editingNameId={editingNameId}
                exportToCSV={exportToCSV}
                fetchInventory={fetchInventory}
                filterButtonRef={filterButtonRef}
                filterDropdownRect={filterDropdownRect}
                filterLocation={filterLocation}
                filterMaxPrice={filterMaxPrice}
                filterMetal={filterMetal}
                filterMinPrice={filterMinPrice}
                filterStatus={filterStatus}
                filterStrategy={filterStrategy}
                filterTag={filterTag}
                filteredInventory={filteredInventory}
                getItemPrices={getItemPrices}
                hasValidSupabaseCredentials={Boolean(hasValidSupabaseCredentials)}
                inventory={inventory}
                loadItemIntoCalculator={loadItemIntoCalculator}
                loading={loading}
                locations={locations}
                newLocationInput={newLocationInput}
                newNameValue={newNameValue}
                newTagInput={newTagInput}
                onFileSelect={onFileSelect}
                openExistingImageInCropper={openExistingImageInCropper}
                openMenuId={openMenuId}
                prices={prices}
                pricesLoaded={pricesLoaded}
                priceRounding={priceRounding}
                renameItem={renameItem}
                roundForDisplay={roundForDisplay}
                saveNote={saveNote}
                searchTerm={searchTerm}
                selectedItems={selectedItems}
                setEditingItem={setEditingItem}
                setEditingNameId={setEditingNameId}
                setEditingTimeEntryId={setEditingTimeEntryId}
                setFilterLocation={setFilterLocation}
                setFilterMaxPrice={setFilterMaxPrice}
                setFilterMetal={setFilterMetal}
                setFilterMinPrice={setFilterMinPrice}
                setFilterStatus={setFilterStatus}
                setFilterStrategy={setFilterStrategy}
                setFilterStartDate={setFilterStartDate}
                setFilterEndDate={setFilterEndDate}
                setFilterTag={setFilterTag}
                setLoading={setLoading}
                setLogTimeAllowItemSelect={setLogTimeAllowItemSelect}
                setLogTimeDate={setLogTimeDate}
                setLogTimeHours={setLogTimeHours}
                setLogTimeItemId={setLogTimeItemId}
                setLogTimeNote={setLogTimeNote}
                setManualRetail={setManualRetail}
                setManualWholesale={setManualWholesale}
                setNewLocationInput={setNewLocationInput}
                setNewNameValue={setNewNameValue}
                setNewTagInput={setNewTagInput}
                setOpenMenuId={setOpenMenuId}
                setRecalcItem={setRecalcItem}
                setRecalcItemFormulaMode={setRecalcItemFormulaMode}
                setRecalcParams={setRecalcParams}
                setSearchTerm={setSearchTerm}
                setShowFilterMenu={setShowFilterMenu}
                setShowGlobalRecalc={setShowGlobalRecalc}
                setShowLogTimeModal={setShowLogTimeModal}
                setShowPDFOptions={setShowPDFOptions}
                setShowQuickAddPiece={setShowQuickAddPiece}
                setShowShopifyExportOptions={setShowShopifyExportOptions}
                setShowSiteProductCsvModal={setShowSiteProductCsvModal}
                setShowLocationMenuId={setShowLocationMenuId}
                setShowTagMenuId={setShowTagMenuId}
                setShowVaultMenu={setShowVaultMenu}
                setShowVaultPlusModal={setShowVaultPlusModal}
                setVaultDiagnostic={setVaultDiagnostic}
                setVaultImageErrorRetries={setVaultImageErrorRetries}
                shopifyConnected={shopifyConnected}
                shopifyExporting={shopifyExporting}
                showFilterMenu={showFilterMenu}
                showLocationMenuId={showLocationMenuId}
                showTagMenuId={showTagMenuId}
                showVaultMenu={showVaultMenu}
                showVaultPlusUpgradeLikeCompare={showVaultPlusUpgradeLikeCompare}
                subscriptionStatus={subscriptionStatus}
                syncToMarket={syncToMarket}
                syncingVaultPlus={syncingVaultPlus}
                syncVaultPlusFromStripe={syncVaultPlusFromStripe}
                toggleSelectAll={toggleSelectAll}
                toggleSelection={toggleSelection}
                totalVaultValue={totalVaultValue}
                trackedTimeByItem={trackedTimeByItem}
                uniqueTags={uniqueTags}
                updateLocation={updateLocation}
                updateStatus={updateStatus}
                updateStockQty={updateStockQty}
                updateTag={updateTag}
                uploadingId={uploadingId}
                vaultDiagnostic={vaultDiagnostic}
                vaultImageErrorRetries={vaultImageErrorRetries}
                vaultImageVisibilityEpoch={vaultImageVisibilityEpoch}
                vaultItemStockQty={vaultItemStockQty}
                vaultPaywallHasItems={vaultPaywallHasItems}
                vaultPullPx={vaultPullPx}
                vaultPullRefreshing={vaultPullRefreshing}
                vaultPullScrollRef={vaultPullScrollRef}
                updatingStockId={updatingStockId}
              />
            </div>
          )}
          {/* COMPARE PANEL — code-split after first visit */}
          {compareTabVisited && (
            <div className={activeTab !== 'compare' ? 'hidden' : ''}>
              <CompareTabPanel
                user={user}
                showVaultPlusUpgradeLikeCompare={showVaultPlusUpgradeLikeCompare}
                setShowAuth={setShowAuth}
                setShowVaultPlusModal={setShowVaultPlusModal}
                VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED={VAULT_REFRESH_AND_STRIPE_SYNC_UI_ENABLED}
                setLoading={setLoading}
                fetchInventory={fetchInventory}
                syncingVaultPlus={syncingVaultPlus}
                syncVaultPlusFromStripe={syncVaultPlusFromStripe}
                compareFilterButtonRef={compareFilterButtonRef}
                showCompareFilterMenu={showCompareFilterMenu}
                setShowCompareFilterMenu={setShowCompareFilterMenu}
                compareFilterDropdownRect={compareFilterDropdownRect}
                locations={locations}
                uniqueTags={uniqueTags}
                compareFilterLocation={compareFilterLocation}
                setCompareFilterLocation={setCompareFilterLocation}
                compareFilterTag={compareFilterTag}
                setCompareFilterTag={setCompareFilterTag}
                compareFilterStatus={compareFilterStatus}
                setCompareFilterStatus={setCompareFilterStatus}
                compareFilterStrategy={compareFilterStrategy}
                setCompareFilterStrategy={setCompareFilterStrategy}
                compareFilterMetal={compareFilterMetal}
                setCompareFilterMetal={setCompareFilterMetal}
                compareSearchTerm={compareSearchTerm}
                setCompareSearchTerm={setCompareSearchTerm}
                compareShowLive={compareShowLive}
                setCompareShowLive={setCompareShowLive}
                compareFormulas={compareFormulas}
                setCompareFormulas={setCompareFormulas}
                formulas={formulas}
                compareSpotEnabled={compareSpotEnabled}
                setCompareSpotEnabled={setCompareSpotEnabled}
                compareCustomSpots={compareCustomSpots}
                setCompareCustomSpots={setCompareCustomSpots}
                prices={prices}
                subscriptionStatus={subscriptionStatus}
                compareFilteredInventory={compareFilteredInventory}
                inventory={inventory}
                convertStonesToArray={convertStonesToArray}
                calculateFullBreakdown={calculateFullBreakdown}
                getItemPrices={getItemPrices}
                getPricesForFormulas={getPricesForFormulas}
                formatCompareWholesaleRetail={formatCompareWholesaleRetail}
                renderComparePriceDelta={renderComparePriceDelta}
              />
            </div>
          )}

          {/* FORMULAS PANEL — code-split after first visit */}
          {formulasTabVisited && (
            <div className={activeTab !== 'formulas' ? 'hidden' : ''}>
              <FormulasTabPanel
                user={user}
                formulas={formulas}
                formulaEditorOpen={formulaEditorOpen}
                setFormulaEditorOpen={setFormulaEditorOpen}
                setEditingFormulaId={setEditingFormulaId}
                setFormulaDraftName={setFormulaDraftName}
                setFormulaDraftTokens={setFormulaDraftTokens}
                formulaDraftName={formulaDraftName}
                formulaDraftTokens={formulaDraftTokens}
                priceRounding={priceRounding}
                setPriceRoundingWithPersist={setPriceRoundingWithPersist}
                formulaValid={formulaValid}
                setFormulaValid={setFormulaValid}
                roundForDisplay={roundForDisplay}
                calculateFullBreakdown={calculateFullBreakdown}
                metalList={metalList}
                calcHours={calcHours}
                calcRate={calcRate}
                calcOtherCosts={calcOtherCosts}
                calcStoneList={calcStoneList}
                calcOverheadCost={calcOverheadCost}
                overheadType={overheadType}
                applyManualMetalInCalculator={applyManualMetalInCalculator}
                calculatorFindingsMult={calculatorFindingsMult}
                subscriptionStatus={subscriptionStatus}
                setShowVaultPlusModal={setShowVaultPlusModal}
                setNotification={setNotification}
                editingFormulaId={editingFormulaId}
                setFormulas={setFormulas}
                savingFormula={savingFormula}
                setSavingFormula={setSavingFormula}
                formulaToReadableString={formulaToReadableString}
                deletingFormulaId={deletingFormulaId}
                setDeletingFormulaId={setDeletingFormulaId}
                selectedFormulaId={selectedFormulaId}
                setSelectedFormulaId={setSelectedFormulaId}
                setCustomFormulaModel={setCustomFormulaModel}
              />
            </div>
          )}

          {/* TIME PANEL — code-split after first visit */}
          {timeTabVisited && (
            <div className={activeTab !== 'time' ? 'hidden' : ''}>
              <TimeTabPanel
                user={user}
                inventory={inventory}
                timerStartedAt={timerStartedAt}
                setTimerStartedAt={setTimerStartedAt}
                timerPausedElapsed={timerPausedElapsed}
                setTimerPausedElapsed={setTimerPausedElapsed}
                timerElapsedDisplay={timerElapsedDisplay}
                timerElapsedSeconds={timerElapsedSeconds}
                timeSummaryToday={timeSummaryToday}
                timeSummaryThisWeek={timeSummaryThisWeek}
                timeFilterDateFrom={timeFilterDateFrom}
                setTimeFilterDateFrom={setTimeFilterDateFrom}
                timeFilterDateTo={timeFilterDateTo}
                setTimeFilterDateTo={setTimeFilterDateTo}
                timeFilterItemDropdownRef={timeFilterItemDropdownRef}
                timeFilterItemId={timeFilterItemId}
                setTimeFilterItemId={setTimeFilterItemId}
                timeFilterItemSearch={timeFilterItemSearch}
                setTimeFilterItemSearch={setTimeFilterItemSearch}
                timeFilterItemDropdownOpen={timeFilterItemDropdownOpen}
                setTimeFilterItemDropdownOpen={setTimeFilterItemDropdownOpen}
                filteredTimeEntries={filteredTimeEntries}
                deletingTimeEntryId={deletingTimeEntryId}
                onOpenLogTimeHeader={() => {
                  setLogTimeItemId(null);
                  setLogTimeAllowItemSelect(true);
                  setEditingTimeEntryId(null);
                  setLogTimeHours('');
                  setLogTimeDate(localTodayYYYYMMDD());
                  setLogTimeNote('');
                  setShowLogTimeModal(true);
                }}
                onOpenLogTimeFromStoppedTimer={() => {
                  setEditingTimeEntryId(null);
                  setLogTimeItemId(null);
                  setLogTimeAllowItemSelect(true);
                  setLogTimeHours((timerPausedElapsed / 3600).toFixed(2));
                  setLogTimeDate(localTodayYYYYMMDD());
                  setLogTimeNote('');
                  setShowLogTimeModal(true);
                }}
                openEditTimeModal={openEditTimeModal}
                deleteTimeEntry={deleteTimeEntry}
              />
            </div>
          )}

          {/* LOGIC PANEL — code-split after first visit */}
          {logicTabVisited && (
            <div className={`flex flex-col flex-1 min-h-0 min-h-[50vh] lg:min-h-0 lg:max-h-[calc(100vh-5rem)] overflow-y-auto overflow-x-hidden custom-scrollbar scrollbar-gutter-stable ${activeTab !== 'logic' ? 'hidden' : ''}`}>
              <LogicTabPanel
                retailMultA={retailMultA}
                markupB={markupB}
                onCreateFormula={() => {
                  setActiveTab('formulas');
                  setFormulaEditorOpen(true);
                  setEditingFormulaId(null);
                  setFormulaDraftName('');
                  setFormulaDraftTokens({
                    base: formulaToTokens(PRESET_A.base),
                    wholesale: formulaToTokens(PRESET_A.wholesale),
                    retail: formulaToTokens(PRESET_A.retail),
                  });
                }}
              />
            </div>
          )}

        <div className="flex flex-col items-center justify-center gap-2 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] md:py-8 border-t border-stone-200 mt-10">
            <a
              href={orgSiteUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-wrap items-center justify-center gap-2 hover:opacity-80 transition-opacity rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              aria-label={`${ORG_NAME} — visit website`}
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Powered by</span>
              <NextImage
                src={BOMA_HEADER_LOGO_PATH}
                alt=""
                width={1024}
                height={1024}
                className="h-6 w-6 object-contain pointer-events-none"
                sizes="24px"
                unoptimized
              />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">{ORG_NAME}</span>
            </a>
            <a
              href={CREATOR_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[8px] font-bold uppercase tracking-[0.12em] text-stone-400 hover:text-brand transition-colors text-center max-w-md leading-snug"
            >
              {CREATOR_ATTRIBUTION_LABEL}
            </a>
            <InstallPrompt />
            {privacyFooterUrl ? (
              <a
                href={privacyFooterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[8px] font-bold uppercase tracking-widest text-stone-300 hover:text-brand transition-colors mt-2"
              >
                Privacy Policy
              </a>
            ) : null}
          </div>
        </div>
      </div>

    </div>
  );
}
