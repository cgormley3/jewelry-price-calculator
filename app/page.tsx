"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase, hasValidSupabaseCredentials } from '../lib/supabase';
import { Turnstile } from '@marsidev/react-turnstile';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import InstallPrompt from './InstallPrompt';

const UNIT_TO_GRAMS: { [key: string]: number } = {
  "Grams": 1,
  "Pennyweights (dwt)": 1.55517,
  "Troy Ounces": 31.1035,
  "Ounces (std)": 28.3495
};

export default function Home() {
  // Check if Turnstile is configured (for human verification)
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const hasTurnstile = !!turnstileSiteKey;

  const [prices, setPrices] = useState<any>({ gold: 0, silver: 0, platinum: 0, palladium: 0, updated_at: null });
  const [itemName, setItemName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Menus
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

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

  // Modals
  const [showGlobalRecalc, setShowGlobalRecalc] = useState(false);
  const [openEditId, setOpenEditId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [recalcItem, setRecalcItem] = useState<any>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // PDF Export Options Modal
  const [showPDFOptions, setShowPDFOptions] = useState(false);
  const [includeLiveInPDF, setIncludeLiveInPDF] = useState(true);
  const [includeBreakdownInPDF, setIncludeBreakdownInPDF] = useState(true);

  // Form States
  const [manualRetail, setManualRetail] = useState('');
  const [manualWholesale, setManualWholesale] = useState('');
  const [recalcParams, setRecalcParams] = useState({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [newNameValue, setNewNameValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Calculator State
  const [metalList, setMetalList] = useState<{ type: string, weight: number, unit: string, isManual?: boolean, manualPrice?: number, spotSaved?: number }[]>([]);
  const [tempMetal, setTempMetal] = useState('Sterling Silver');
  const [tempWeight, setTempWeight] = useState(0);
  const [tempUnit, setTempUnit] = useState('Ounces (std)');
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [manualPriceInput, setManualPriceInput] = useState<number | ''>('');
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

  const [strategy, setStrategy] = useState<'A' | 'B'>('A');
  const [retailMultA, setRetailMultA] = useState(3);
  const [markupB, setMarkupB] = useState(1.8);

  // Which calculator sections to show (build from bottom up: only show what you include)
  const [includeStonesSection, setIncludeStonesSection] = useState(false);
  const [includeLaborSection, setIncludeLaborSection] = useState(false);
  // Tab for calculator: which section's form is visible (Metal | Stones | Labor)
  const [activeCalculatorTab, setActiveCalculatorTab] = useState<'metal' | 'stones' | 'labor'>('metal');
  // Cost breakdown section: collapsible, default collapsed
  const [costBreakdownOpen, setCostBreakdownOpen] = useState(false);
  // Formula dropdowns in retail strategy cards: closed by default
  const [formulaAOpen, setFormulaAOpen] = useState(false);
  const [formulaBOpen, setFormulaBOpen] = useState(false);

  // When Labor section is off, use 0 for labor/overhead/other in display (save still uses real values)
  const calcHours = includeLaborSection ? hours : 0;
  const calcRate = includeLaborSection ? rate : 0;
  const calcOtherCosts = includeLaborSection ? otherCosts : 0;
  const calcOverheadCost = includeLaborSection ? overheadCost : 0;
  // When Stones section is off, price ignores stones until user turns it on
  const calcStoneList = includeStonesSection ? stoneList : [];

  // App State
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'calculator' | 'vault' | 'logic'>('calculator');

  // Image Upload & Crop State
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropItemId, setCropItemId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(0.1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Selection & Location State
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<string[]>(['Main Vault']);
  const [showLocationMenuId, setShowLocationMenuId] = useState<string | null>(null);
  const [showTagMenuId, setShowTagMenuId] = useState<string | null>(null);
  const [newLocationInput, setNewLocationInput] = useState('');
  const [itemTag, setItemTag] = useState<'necklace' | 'ring' | 'bracelet' | 'other'>('other');

  const fetchInProgressRef = useRef(false);
  const fetchVersionRef = useRef(0);
  const wakeUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (showFilterMenu && !target.closest('.filter-menu-container')) setShowFilterMenu(false);
      if (showVaultMenu && !target.closest('.vault-menu-container')) setShowVaultMenu(false);
      if (openMenuId && !target.closest('.item-menu-container')) setOpenMenuId(null);
      if (showLocationMenuId && !target.closest('.location-menu-container')) setShowLocationMenuId(null);
      if (showTagMenuId && !target.closest('.tag-menu-container')) setShowTagMenuId(null);
      if (showAuth && !target.closest('.auth-menu-container')) setShowAuth(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu, showVaultMenu, openMenuId, showLocationMenuId, showTagMenuId, showAuth]);

  const fetchPrices = useCallback(async (force = false) => {
    const cachedData = sessionStorage.getItem('vault_prices');
    const cacheTimestamp = sessionStorage.getItem('vault_prices_time');
    const now = Date.now();
    const oneMinute = 60 * 1000;

    if (!force && cachedData && cacheTimestamp && (now - Number(cacheTimestamp) < oneMinute)) {
      setPrices(JSON.parse(cachedData));
      setPricesLoaded(true);
      return;
    }

    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;
    const myVersion = ++fetchVersionRef.current;

    try {
      const res = await fetch(`/api/gold-price?cb=${now}`);
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
        const freshPrices = {
          gold: priceData.gold || 0,
          silver: priceData.silver || 0,
          platinum: priceData.platinum || 0,
          palladium: priceData.palladium || 0,
          gold_pct: priceData.gold_pct ?? null,
          silver_pct: priceData.silver_pct ?? null,
          platinum_pct: priceData.platinum_pct ?? null,
          palladium_pct: priceData.palladium_pct ?? null,
          updated_at: priceData.updated_at
        };
        setPrices(freshPrices);
        sessionStorage.setItem('vault_prices', JSON.stringify(freshPrices));
        sessionStorage.setItem('vault_prices_time', now.toString());
        setPricesLoaded(true);
      } else {
        console.warn('No price data received from API');
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
      if (!pricesLoaded && cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed.gold > 0 || parsed.silver > 0) {
            setPrices(parsed);
            setPricesLoaded(true);
          }
        } catch (_) { /* ignore */ }
      }
    }
  }, [pricesLoaded]);

  const calculateFullBreakdown = useCallback((metals: any[], h: any, r: any, o: any, stones: any[], ovCost: any, ovType: 'flat' | 'percent', customMult?: number, customMarkup?: number, priceOverride?: any) => {
    let rawMaterialCost = 0;
    metals.forEach(m => {
      let pricePerGram = 0;
      if (m.isManual && m.manualPrice) {
        pricePerGram = m.manualPrice / UNIT_TO_GRAMS[m.unit];
      } else {
        let spot = 0;
        const type = m.type.toLowerCase();

        if (type.includes('gold')) spot = (priceOverride && priceOverride.gold) ? Number(priceOverride.gold) : prices.gold;
        else if (type.includes('silver')) spot = (priceOverride && priceOverride.silver) ? Number(priceOverride.silver) : prices.silver;
        else if (type.includes('platinum')) spot = (priceOverride && priceOverride.platinum) ? Number(priceOverride.platinum) : prices.platinum;
        else if (type.includes('palladium')) spot = (priceOverride && priceOverride.palladium) ? Number(priceOverride.palladium) : prices.palladium;

        const purities: any = { '10K Gold': 0.417, '14K Gold': 0.583, '18K Gold': 0.75, '22K Gold': 0.916, '24K Gold': 0.999, 'Sterling Silver': 0.925, 'Platinum 950': 0.95, 'Palladium': 0.95 };
        pricePerGram = (spot / 31.1035) * (purities[m.type] || 1.0);
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

    // --- STRATEGY A (STANDARD MULTIPLIER) ---
    // Base Cost: Metal + Labor + Other + Overhead (Stones excluded from base)
    const baseCostA = metalCost + labor + other + overhead;
    // Retail Price: (Base Cost × Retail Multiplier) + (Stones × Stone Markup)
    const retailA = (baseCostA * (customMult ?? retailMultA)) + totalStoneRetail;
    // Displayed Wholesale: Base Cost + Stone Cost
    const wholesaleA = baseCostA + totalStoneCost;

    // --- STRATEGY B (MATERIALS MARKUP) ---
    // Base Cost: ((Metal + Other) × Markup B) + Labor + Overhead
    const baseCostB = ((metalCost + other) * (customMarkup ?? markupB)) + labor + overhead;
    // Retail Price: (Base Cost × 2) + (Stones × Stone Markup)
    const retailB = (baseCostB * 2) + totalStoneRetail;
    // Displayed Wholesale: Base Cost + Stone Cost
    const wholesaleB = baseCostB + totalStoneCost;

    return { wholesaleA, retailA, wholesaleB, retailB, totalMaterials, labor, metalCost, stones: totalStoneCost, stoneRetail: totalStoneRetail, overhead, other };
  }, [prices, retailMultA, markupB]);

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
    async function initSession() {
      // Only attempt Supabase auth if credentials are configured
      if (hasValidSupabaseCredentials) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            const { data } = await supabase.auth.signInAnonymously();
            setUser(data.user);
          } else {
            setUser(session.user);
          }
        } catch (error) {
          console.warn('Supabase auth error:', error);
          // Continue without auth - app can still function
        }
      } else {
        console.log('Skipping Supabase auth - credentials not configured');
      }

      await fetchPrices();
      fetchInventory();
    }
    initSession();

    const handleWakeUp = () => {
      if (document.visibilityState !== 'visible') return;
      if (wakeUpTimeoutRef.current) clearTimeout(wakeUpTimeoutRef.current);
      wakeUpTimeoutRef.current = setTimeout(() => {
        wakeUpTimeoutRef.current = null;
        fetchPrices(true);
      }, 100);
    };

    window.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);

    // Only set up auth state listener if Supabase is configured
    let subscription: { unsubscribe: () => void } | null = null;
    if (hasValidSupabaseCredentials) {
      try {
        const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          setUser(session?.user ?? null);
          if (session) fetchInventory();

          if (event === "PASSWORD_RECOVERY") {
            setShowResetModal(true);
          }
        });
        subscription = authSubscription;
      } catch (error) {
        console.warn('Supabase auth state change error:', error);
      }
    }

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
      if (wakeUpTimeoutRef.current) clearTimeout(wakeUpTimeoutRef.current);
      window.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
    };
  }, [fetchPrices]);

  async function fetchInventory() {
    // Skip if Supabase credentials are not configured
    if (!hasValidSupabaseCredentials) {
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setLoading(false); return; }
      const { data, error } = await supabase.from('inventory').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
      if (!error && data) {
        setInventory(data);
        const uniqueLocs = Array.from(new Set(data.map(i => i.location).filter(Boolean)));
        setLocations(prev => Array.from(new Set([...prev, ...uniqueLocs])));
      }
    } catch (error) {
      console.warn('Error fetching inventory:', error);
    }
    setLoading(false);
  }

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

  const updateTag = async (id: string, newTag: string) => {
    const { error } = await supabase.from('inventory').update({ tag: newTag }).eq('id', id);
    if (!error) {
      setInventory(inventory.map(i => i.id === id ? { ...i, tag: newTag } : i));
      setShowTagMenuId(null);
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
  const onFileSelect = (event: any, itemId: string) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotification({ title: "File Too Large", message: "Please select an image under 5MB.", type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result as string);
      setCropItemId(itemId);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setOpenMenuId(null);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
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
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(offset.x, offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setUploadingId(cropItemId);
      setCropImage(null);
      const fileName = `${user.id}/${cropItemId}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, blob);
      if (uploadError) {
        setNotification({ title: "Upload Failed", message: "Could not upload cropped image.", type: 'error' });
      } else {
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        const { error: dbError } = await supabase.from('inventory').update({ image_url: publicUrl }).eq('id', cropItemId);
        if (!dbError) {
          setInventory(inventory.map(item => item.id === cropItemId ? { ...item, image_url: publicUrl } : item));
          setNotification({ title: "Image Updated", message: "New photo saved successfully.", type: 'success' });
        }
      }
      setUploadingId(null);
      setCropItemId(null);
    }, 'image/png');
  };

  const addMetalToPiece = () => {
    if (tempWeight <= 0) return;
    let currentSpot = 0;
    const type = tempMetal.toLowerCase();
    if (type.includes('gold')) currentSpot = prices.gold;
    else if (type.includes('silver')) currentSpot = prices.silver;
    else if (type.includes('platinum')) currentSpot = prices.platinum;
    else if (type.includes('palladium')) currentSpot = prices.palladium;

    setMetalList([...metalList, {
      type: tempMetal,
      weight: tempWeight,
      unit: tempUnit,
      isManual: useManualPrice,
      manualPrice: useManualPrice ? Number(manualPriceInput) : undefined,
      spotSaved: useManualPrice ? undefined : currentSpot
    }]);
    setTempWeight(0); setManualPriceInput(''); setUseManualPrice(false);
  };

  const addStoneToPiece = () => {
    if (!tempStoneName.trim() || Number(tempStoneCost) <= 0) return;
    setStoneList([...stoneList, {
      name: tempStoneName.trim(),
      cost: Number(tempStoneCost),
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

  const syncToMarket = async (item: any) => {
    setNotification({
      title: "Sync Prices",
      message: `Update "${item.name}" to reflect current market spot prices?`,
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
          'flat', // Force flat to use the saved dollar amount
          item.multiplier,
          item.markup_b
        );

        const liveRetail = item.strategy === 'A' ? current.retailA : current.retailB;
        const liveWholesaleFinal = item.strategy === 'A' ? current.wholesaleA : current.wholesaleB;

        const updatedMetals = item.metals.map((m: any) => {
          let currentSpot = 0;
          const type = m.type.toLowerCase();
          if (type.includes('gold')) currentSpot = prices.gold;
          else if (type.includes('silver')) currentSpot = prices.silver;
          else if (type.includes('platinum')) currentSpot = prices.platinum;
          else if (type.includes('palladium')) currentSpot = prices.palladium;

          return { ...m, spotSaved: m.isManual ? undefined : currentSpot };
        });

        const { error } = await supabase.from('inventory').update({
          wholesale: liveWholesaleFinal,
          retail: liveRetail,
          metals: updatedMetals
        }).eq('id', item.id);

        if (!error) {
          fetchInventory();
          setOpenMenuId(null);
          setNotification({ title: "Vault Updated", message: `"${item.name}" has been synced to live market prices.`, type: 'success' });
        }
      }
    });
  };

  const syncAllToMarket = async () => {
    const targetItems = selectedItems.size > 0
      ? inventory.filter(i => selectedItems.has(i.id))
      : inventory;

    const count = targetItems.length;

    setNotification({
      title: `Sync ${selectedItems.size > 0 ? `Selected (${count})` : 'All'}`,
      message: `Update ${count} item(s) to reflect current market spot prices? This cannot be undone.`,
      type: 'confirm',
      onConfirm: async () => {
        setLoading(true);
        setShowVaultMenu(false);

        const updates = targetItems.map(async (item) => {
          const stonesArray = convertStonesToArray(item);
          const calc = calculateFullBreakdown(
            item.metals || [],
            1,
            item.labor_at_making || 0, // CORRECTED: Use saved labor cost
            item.other_costs_at_making || 0,
            stonesArray,
            item.overhead_cost || 0,
            'flat', // Force flat
            item.multiplier,
            item.markup_b
          );

          const liveRetail = item.strategy === 'A' ? calc.retailA : calc.retailB;
          const liveWholesale = item.strategy === 'A' ? calc.wholesaleA : calc.wholesaleB;

          const updatedMetals = item.metals.map((m: any) => {
            let currentSpot = 0;
            const type = m.type.toLowerCase();
            if (type.includes('gold')) currentSpot = prices.gold;
            else if (type.includes('silver')) currentSpot = prices.silver;
            else if (type.includes('platinum')) currentSpot = prices.platinum;
            else if (type.includes('palladium')) currentSpot = prices.palladium;

            return { ...m, spotSaved: m.isManual ? undefined : currentSpot };
          });

          return supabase.from('inventory').update({
            wholesale: liveWholesale,
            retail: liveRetail,
            metals: updatedMetals
          }).eq('id', item.id);
        });

        await Promise.all(updates);
        await fetchInventory();
        setNotification({ title: "Vault Synced", message: `${count} items updated to live market prices.`, type: 'success' });
      }
    });
  };

  const handleGlobalRecalcSync = async () => {
    const targetItems = selectedItems.size > 0
      ? inventory.filter(i => selectedItems.has(i.id))
      : inventory;

    const count = targetItems.length;

    setNotification({
      title: `Recalculate ${selectedItems.size > 0 ? `Selected (${count})` : 'All'}`,
      message: `Recalculate ${count} item(s) with these new parameters? This will overwrite saved labor costs and spot prices.`,
      type: 'confirm',
      onConfirm: async () => {
        setLoading(true);
        setShowVaultMenu(false);

        const updates = targetItems.map(async (item) => {
          const laborHours = item.hours || 1;
          const newLaborCost = recalcParams.laborRate
            ? Number(recalcParams.laborRate) * laborHours
            : Number(item.labor_at_making || 0);

          const stonesArray = convertStonesToArray(item);
          const calc = calculateFullBreakdown(
            item.metals || [],
            1,
            newLaborCost,
            item.other_costs_at_making || 0,
            stonesArray,
            item.overhead_cost || 0,
            'flat', // Force flat for global recalc unless logic changes
            item.multiplier,
            item.markup_b,
            recalcParams
          );

          const newWholesale = item.strategy === 'A' ? calc.wholesaleA : calc.wholesaleB;
          const newRetail = item.strategy === 'A' ? calc.retailA : calc.retailB;

          const updatedMetals = (item.metals || []).map((m: any) => {
            const type = m.type.toLowerCase();
            let newSpot = m.spotSaved;

            if (type.includes('gold') && recalcParams.gold) newSpot = Number(recalcParams.gold);
            if (type.includes('silver') && recalcParams.silver) newSpot = Number(recalcParams.silver);
            if (type.includes('platinum') && recalcParams.platinum) newSpot = Number(recalcParams.platinum);
            if (type.includes('palladium') && recalcParams.palladium) newSpot = Number(recalcParams.palladium);

            return { ...m, spotSaved: m.isManual ? undefined : newSpot };
          });

          return supabase.from('inventory').update({
            wholesale: newWholesale,
            retail: newRetail,
            labor_at_making: newLaborCost,
            metals: updatedMetals
          }).eq('id', item.id);
        });

        await Promise.all(updates);
        await fetchInventory();
        setShowGlobalRecalc(false);
        setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
        setNotification({ title: "Update Complete", message: `${count} items have been recalculated.`, type: 'success' });
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
      message: `Overwrite "${recalcItem.name}" with these new prices and costs? This cannot be undone.`,
      type: 'confirm',
      onConfirm: async () => {
        const laborHours = recalcItem.hours || 1;
        const newLaborCost = recalcParams.laborRate
          ? Number(recalcParams.laborRate) * laborHours
          : Number(recalcItem.labor_at_making || 0);

        const stonesArray = convertStonesToArray(recalcItem);
        const calc = calculateFullBreakdown(
          recalcItem.metals,
          1,
          newLaborCost,
          recalcItem.other_costs_at_making,
          stonesArray,
          recalcItem.overhead_cost || 0,
          'flat',
          recalcItem.multiplier,
          recalcItem.markup_b,
          recalcParams
        );

        const newWholesale = recalcItem.strategy === 'A' ? calc.wholesaleA : calc.wholesaleB;
        const newRetail = recalcItem.strategy === 'A' ? calc.retailA : calc.retailB;

        const updatedMetals = recalcItem.metals.map((m: any) => {
          const type = m.type.toLowerCase();
          let newSpot = m.spotSaved;

          if (type.includes('gold') && recalcParams.gold) newSpot = Number(recalcParams.gold);
          if (type.includes('silver') && recalcParams.silver) newSpot = Number(recalcParams.silver);
          if (type.includes('platinum') && recalcParams.platinum) newSpot = Number(recalcParams.platinum);
          if (type.includes('palladium') && recalcParams.palladium) newSpot = Number(recalcParams.palladium);

          return { ...m, spotSaved: m.isManual ? undefined : newSpot };
        });

        const { error } = await supabase.from('inventory').update({
          wholesale: newWholesale,
          retail: newRetail,
          labor_at_making: newLaborCost,
          metals: updatedMetals
        }).eq('id', recalcItem.id);

        if (!error) {
          fetchInventory();
          setRecalcItem(null);
          setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
          setNotification({ title: "Vault Updated", message: "Item prices and costs have been updated successfully.", type: 'success' });
        } else {
          setNotification({ title: "Update Failed", message: "Could not sync new prices to Vault.", type: 'error' });
        }
      }
    });
  };

  const addToInventory = async () => {
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
    // Only require Turnstile verification if site key is configured (production)
    if (isGuest && !token && hasTurnstile) {
      setNotification({ title: "Verification Required", message: "Please complete the human verification to save items as a guest.", type: 'info' });
      return;
    }
    if (!itemName) {
      setNotification({ title: "Name Required", message: "Please provide a name for this piece to save it to your Vault.", type: 'info' });
      return;
    }
    if (metalList.length === 0) return;

    // Calculate with new inputs
    const a = calculateFullBreakdown(metalList, hours, rate, otherCosts, stoneList, overheadCost, overheadType);

    const newItem = {
      name: itemName,
      metals: metalList,
      stones: stoneList, // Store as JSON array
      wholesale: strategy === 'A' ? a.wholesaleA : a.wholesaleB,
      retail: strategy === 'A' ? a.retailA : a.retailB,
      materials_at_making: a.metalCost,
      labor_at_making: a.labor,
      other_costs_at_making: Number(otherCosts) || 0,
      stone_cost: a.stones, // Total stone cost for backward compatibility
      stone_markup: stoneList.length > 0 ? stoneList.reduce((sum, s) => sum + (s.cost * s.markup), 0) / a.stones : 1.5, // Weighted average markup
      // CHANGE THIS: Save the calculated dollar amount from 'a', not the raw input
      overhead_cost: a.overhead,
      overhead_type: overheadType,
      strategy: strategy,
      multiplier: retailMultA,
      markup_b: markupB,
      user_id: currentUser.id,
      notes: '',
      hours: Number(hours) || 0,
      location: 'Main Vault',
      tag: itemTag,
      status: 'active'
    };

    try {
      const { data, error } = await supabase.from('inventory').insert([newItem]).select();
      if (!error && data) {
        setInventory([data[0], ...inventory]);
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
        setTempWeight(0);
        setTempUnit('Ounces (std)');
        setUseManualPrice(false);
        setManualPriceInput('');
        setIncludeStonesSection(false);
        setIncludeLaborSection(false);
        setActiveCalculatorTab('metal');
        setStrategy('A');
        setRetailMultA(3);
        setMarkupB(1.8);
        setCostBreakdownOpen(false);
        setFormulaAOpen(false);
        setFormulaBOpen(false);
        setToken(null);
        setItemTag('other');
        setNotification({ title: "Item Saved", message: `"${newItem.name}" is now stored in your Vault.`, type: 'success' });
        if (!user) setUser(currentUser);
      } else {
        console.error(error);
        setNotification({ title: "Save Failed", message: error?.message || "Could not save item.", type: 'error' });
      }
    } catch (error: any) {
      console.error('Database save error:', error);
      setNotification({ 
        title: "Save Failed", 
        message: error?.message || "Could not save item to database. Please check your Supabase configuration.", 
        type: 'error' 
      });
    }
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const lowerTerm = searchTerm.toLowerCase();
      if (searchTerm) {
        const matchName = item.name.toLowerCase().includes(lowerTerm);
        const matchMetal = item.metals.some((m: any) => m.type.toLowerCase().includes(lowerTerm));
        const matchNotes = item.notes && item.notes.toLowerCase().includes(lowerTerm);
        const matchLocation = item.location && item.location.toLowerCase().includes(lowerTerm);
        const matchTag = (item.tag || 'other').toLowerCase().includes(lowerTerm);
        const matchDate = new Date(item.created_at).toLocaleDateString().includes(searchTerm);
        if (!matchName && !matchMetal && !matchNotes && !matchLocation && !matchTag && !matchDate) return false;
      }

      if (filterLocation !== 'All' && (item.location || 'Main Vault') !== filterLocation) return false;
      if (filterTag !== 'All' && (item.tag || 'other') !== filterTag) return false;
      if (filterStrategy !== 'All' && item.strategy !== filterStrategy) return false;
      if (filterMetal !== 'All') {
        if (!item.metals.some((m: any) => m.type.toLowerCase().includes(filterMetal.toLowerCase()))) return false;
      }

      const itemStatus = item.status || 'active';
      if (filterStatus === 'Active' && itemStatus !== 'active') return false;
      if (filterStatus === 'Archived' && itemStatus === 'active') return false;

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
        // FIX: Force overhead_type to 'flat' here to correctly calculate Live Retail using the stored Dollar value
        // FIX: Pass labor cost so live price includes labor
        const stonesArray = convertStonesToArray(item);
        const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, 'flat', item.multiplier, item.markup_b);
        const liveRetail = item.strategy === 'A' ? current.retailA : current.retailB;

        if (filterMinPrice && liveRetail < Number(filterMinPrice)) return false;
        if (filterMaxPrice && liveRetail > Number(filterMaxPrice)) return false;
      }

      return true;
    });
  }, [inventory, searchTerm, filterLocation, filterTag, filterStrategy, filterMetal, filterStatus, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate, prices]);

  const totalVaultValue = useMemo(() => {
    return inventory.reduce((acc, item) => {
      if (item.status === 'archived' || item.status === 'sold') return acc;
      // FIX: Force overhead_type to 'flat' here to correctly calculate Live Retail using the stored Dollar value
      // FIX: Pass labor cost so live price includes labor
      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, 'flat', item.multiplier, item.markup_b);
      const liveRetail = item.strategy === 'A' ? current.retailA : current.retailB;
      return acc + liveRetail;
    }, 0);
  }, [inventory, prices, calculateFullBreakdown]);

  const exportToCSV = () => {
    const targetItems = selectedItems.size > 0
      ? filteredInventory.filter(i => selectedItems.has(i.id))
      : filteredInventory;

    const headers = ["Item Name", "Status", "Tag", "Location", "Live Retail", "Live Wholesale", "Saved Retail", "Saved Wholesale", "Labor Hours", "Labor Cost", "Materials Cost", "Other Costs", "Stone Retail", "Stone Cost", "Stone Markup", "Overhead Cost", "Overhead Type", "Notes", "Date Created", "Strategy", "Metals", "Image URL"];
    const rows = targetItems.map(item => {
      // FIX: Force overhead_type to 'flat' for live calc
      // FIX: Pass labor cost
      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, 'flat', item.multiplier, item.markup_b);
      const liveWholesale = item.strategy === 'A' ? current.wholesaleA : current.wholesaleB;
      const liveRetail = item.strategy === 'A' ? current.retailA : current.retailB;
      const metalsStr = item.metals.map((m: any) => `${m.weight}${m.unit} ${m.type}`).join('; ');

      const stoneRetail = current.stoneRetail || 0;
      const stoneCost = current.stones || 0;
      const stoneMarkup = stoneCost > 0 ? stoneRetail / stoneCost : 1.5;

      return [
        `"${item.name}"`,
        `"${item.status || 'active'}"`,
        `"${item.tag || 'other'}"`,
        `"${item.location || 'Main Vault'}"`,
        liveRetail.toFixed(2),
        liveWholesale.toFixed(2),
        Number(item.retail).toFixed(2),
        Number(item.wholesale).toFixed(2),
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
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri); link.setAttribute("download", "bear-vault-inventory.csv");
    document.body.appendChild(link); link.click(); setShowVaultMenu(false);
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

  const pdfPageHeight = 297;
  const pdfPageWidth = 210;
  const pdfMargin = 16;
  const pdfContentWidth = pdfPageWidth - pdfMargin * 2;
  const PDF_FOOTER_HEIGHT = 28;

  const drawPDFPageHeader = (doc: jsPDF, currentUser?: { email?: string; user_metadata?: { full_name?: string }; is_anonymous?: boolean } | null) => {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(0, 22, pdfPageWidth, 22);
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(40, 40, 40);
    doc.text('Inventory Report', pdfMargin, 12);
    let y = 16;
    if (currentUser && !currentUser.is_anonymous) {
      const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || currentUser.email;
      if (name) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
        doc.text(`Prepared for: ${name}`, pdfMargin, y);
        y += 4;
      }
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(`Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, pdfMargin, y);
  };

  const drawPDFPageFooter = (doc: jsPDF, iconData: string | null, pageNum?: number) => {
    const footerY = pdfPageHeight - 10;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(pdfMargin, footerY - 8, pdfPageWidth - pdfMargin, footerY - 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(130, 130, 130);
    doc.text('Powered by', pdfMargin, footerY - 2);
    const logoSize = 5;
    if (iconData) {
      try {
        doc.addImage(iconData, 'PNG', pdfMargin + 20, footerY - 6, logoSize, logoSize);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(60, 60, 60);
        doc.text('Bear Silver and Stone', pdfMargin + 26, footerY - 2);
      } catch {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(80, 80, 80);
        doc.text('Bear Silver and Stone', pdfMargin + 20, footerY - 2);
      }
    } else {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(80, 80, 80);
      doc.text('Bear Silver and Stone', pdfMargin + 20, footerY - 2);
    }
    if (pageNum != null) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(130, 130, 130);
      doc.text(`Page ${pageNum}`, pdfPageWidth - pdfMargin - doc.getTextWidth(`Page ${pageNum}`), footerY - 2);
    }
  };

  const exportDetailedPDF = async () => {
    setLoading(true);
    setShowPDFOptions(false);

    const targetItems = selectedItems.size > 0
      ? filteredInventory.filter(i => selectedItems.has(i.id))
      : filteredInventory;

    const iconData = await getImageData(typeof window !== 'undefined' ? `${window.location.origin}/icon.png?v=2` : '/icon.png?v=2');

    const doc = new jsPDF();
    const neutralDark = [80, 80, 80] as [number, number, number];
    const muted = [100, 100, 100];
    const dark = [40, 40, 40];
    let pageNum = 1;

    drawPDFPageHeader(doc, user);
    let currentY = 28;

    if (includeLiveInPDF) {
      if (prices.gold > 0 || prices.silver > 0 || prices.platinum > 0 || prices.palladium > 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(pdfMargin, currentY, pdfContentWidth, 14, 'F');
        doc.setDrawColor(220, 220, 220);
        doc.rect(pdfMargin, currentY, pdfContentWidth, 14, 'S');
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(neutralDark[0], neutralDark[1], neutralDark[2]);
        doc.text('Live spot prices ($/oz troy)', pdfMargin + 5, currentY + 5.5);
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
      if (currentY + 58 > pdfPageHeight - PDF_FOOTER_HEIGHT) {
        drawPDFPageFooter(doc, iconData, pageNum);
        doc.addPage();
        pageNum += 1;
        currentY = 28;
        drawPDFPageHeader(doc, user);
      }

      const stonesArray = convertStonesToArray(item);
      const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, 'flat', item.multiplier, item.markup_b);
      const liveWholesale = item.strategy === 'A' ? current.wholesaleA : current.wholesaleB;
      const liveRetail = item.strategy === 'A' ? current.retailA : current.retailB;

      const pdfThumbSize = 18;
      const pdfThumbGap = 4;
      const pdfThumbPaddingBelow = 4;
      let titleX = pdfMargin;
      let itemHeaderHeight = 14;

      if (item.image_url) {
        const imgData = await getImageData(item.image_url);
        if (imgData) {
          doc.addImage(imgData, 'PNG', pdfMargin, currentY, pdfThumbSize, pdfThumbSize);
          titleX = pdfMargin + pdfThumbSize + pdfThumbGap;
          itemHeaderHeight = pdfThumbSize + pdfThumbPaddingBelow;
        }
      }

      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.text(item.name, titleX, currentY + (itemHeaderHeight > 14 ? 4 : 5));
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(muted[0], muted[1], muted[2]);
      const meta = `${item.status === 'archived' || item.status === 'sold' ? 'Archived' : 'Active'}  ·  ${item.location || 'Main Vault'}  ·  Saved ${new Date(item.created_at).toLocaleDateString()}`;
      doc.text(meta, titleX, currentY + (itemHeaderHeight > 14 ? 11 : 10));
      currentY += itemHeaderHeight;

      const tableStartY = currentY;
      const tableHead = includeLiveInPDF ? [['', 'Saved', 'Live (market)']] : [['', 'Saved']];
      const retailRow: any[] = ['Retail', `$${Number(item.retail).toFixed(2)}`];
      if (includeLiveInPDF) retailRow.push(`$${liveRetail.toFixed(2)}`);
      const wholesaleRow: any[] = ['Wholesale', `$${Number(item.wholesale).toFixed(2)}`];
      if (includeLiveInPDF) wholesaleRow.push(`$${liveWholesale.toFixed(2)}`);

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
          if (m.spotSaved != null && !m.isManual) {
            if (t.includes('gold') && savedSpotByMetal.Gold == null) savedSpotByMetal.Gold = m.spotSaved;
            else if (t.includes('silver') && savedSpotByMetal.Silver == null) savedSpotByMetal.Silver = m.spotSaved;
            else if (t.includes('platinum') && savedSpotByMetal.Platinum == null) savedSpotByMetal.Platinum = m.spotSaved;
            else if (t.includes('palladium') && savedSpotByMetal.Palladium == null) savedSpotByMetal.Palladium = m.spotSaved;
          }
        });
        const savedSpotParts = Object.entries(savedSpotByMetal)
          .map(([name, val]) => `${name} $${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
          .filter(Boolean);
        if (savedSpotParts.length > 0) metalLines.push(`Saved spot ($/oz): ${savedSpotParts.join(' | ')}`);

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
          const totalStoneCost = stonesArray.reduce((sum: number, s: any) => sum + (Number(s.cost) || 0), 0);
          const denominator = Number(item.materials_at_making) + Number(item.labor_at_making) + Number(item.other_costs_at_making) + totalStoneCost;
          const ovPct = item.overhead_type === 'percent' && denominator > 0 ? ((Number(item.overhead_cost) / denominator) * 100).toFixed(1) : null;
          otherLines.push(`Overhead: $${Number(item.overhead_cost).toFixed(2)} ${ovPct ? `(${ovPct}%)` : ''}`);
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
      if (item.notes) {
        let drawNotesY = notesAnchorY;
        if (notesAnchorY > pdfPageHeight - PDF_FOOTER_HEIGHT - 10) {
          drawPDFPageFooter(doc, iconData, pageNum);
          doc.addPage();
          pageNum += 1;
          drawPDFPageHeader(doc, user);
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
    setLoading(false);
    setShowVaultMenu(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    let result = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { data: { is_converted_from_anonymous: true } } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setNotification({ title: "Vault Access Error", message: result.error.message, type: 'error' });
    } else {
      if (isSignUp) {
        setShowAuth(false);
        setNotification({ title: "Check Your Inbox", message: "We've sent a verification link to your email. Please confirm your account to get access to your Vault.", type: 'success' });
      } else {
        setShowAuth(false);
        setShowPassword(false);
        fetchInventory();
      }
    }
  };

  const handleGoogleHandshake = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;

    if (!idToken) {
      setNotification({ title: "Error", message: "No credential received from Google.", type: 'error' });
      return;
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
      setNotification({ title: "Welcome to the Vault", message: "Successfully logged in via Google.", type: 'success' });
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setNotification({ title: "Email Required", message: "Please enter your email address first so we know where to send the recovery link.", type: 'info' });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://vault.bearsilverandstone.com',
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
    <div className="min-h-screen bg-stone-50 p-4 md:p-10 text-slate-900 font-sans text-left relative">

      {/* Image Adjuster Modal */}
      {cropImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black uppercase text-center text-slate-900">Adjust Photo</h3>

            {/* Cropper Container */}
            <div
              className="relative w-64 h-64 mx-auto rounded-full overflow-hidden border-4 border-[#A5BEAC] shadow-inner bg-stone-100 touch-none"
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
                draggable={false}
              />
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-bold text-stone-400 uppercase">
                <span>Zoom</span>
                <button onClick={() => setRotation(r => (r + 90) % 360)} className="text-[#A5BEAC] hover:text-slate-900 transition-colors">⟳ Rotate 90°</button>
              </div>
              <input
                type="range"
                min={minZoom}
                max={minZoom * 5}
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#A5BEAC]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setCropImage(null)} className="flex-1 py-3 bg-stone-100 rounded-xl font-bold text-xs uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={performCropAndUpload} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase hover:bg-[#A5BEAC] transition shadow-md">
                {uploadingId ? 'Saving...' : 'Save Photo'}
              </button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

      {/* PDF Options Modal */}
      {showPDFOptions && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-[#A5BEAC] p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-900">PDF Options</h3>

            <div className="space-y-3">
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setIncludeLiveInPDF(!includeLiveInPDF)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${includeLiveInPDF ? 'bg-[#A5BEAC] border-[#A5BEAC] text-white' : 'bg-white border-stone-300'}`}>
                  {includeLiveInPDF && '✓'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-slate-900">Include Live Prices</p>
                  <p className="text-[10px] text-stone-400 font-bold">Show current market value calculations</p>
                </div>
              </div>

              {/* Breakdown Toggle */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center gap-4 cursor-pointer" onClick={() => setIncludeBreakdownInPDF(!includeBreakdownInPDF)}>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${includeBreakdownInPDF ? 'bg-[#A5BEAC] border-[#A5BEAC] text-white' : 'bg-white border-stone-300'}`}>
                  {includeBreakdownInPDF && '✓'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-slate-900">Include Breakdown</p>
                  <p className="text-[10px] text-stone-400 font-bold">Show list of metals and labor costs</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPDFOptions(false)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={exportDetailedPDF} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-[#A5BEAC] transition shadow-lg">Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-[#A5BEAC] p-8 space-y-6">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-900">Manual Price Edit</h3>
            <div className="space-y-4">
              <div><label className="text-[10px] font-black uppercase text-stone-400 mb-1 block">New Retail Price ($)</label>
                <input type="number" className="w-full p-4 bg-stone-50 border rounded-2xl outline-none focus:border-[#A5BEAC] font-bold" value={manualRetail} onChange={(e) => setManualRetail(e.target.value)} /></div>
              <div><label className="text-[10px] font-black uppercase text-stone-400 mb-1 block">New Wholesale Cost ($)</label>
                <input type="number" className="w-full p-4 bg-stone-50 border rounded-2xl outline-none focus:border-[#A5BEAC] font-bold" value={manualWholesale} onChange={(e) => setManualWholesale(e.target.value)} /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditingItem(null)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={handleManualPriceSave} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-[#A5BEAC] transition shadow-lg">Save Vault</button>
            </div>
          </div>
        </div>
      )}

      {/* RECALCULATE MODAL (Individual) */}
      {recalcItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-[#A5BEAC] p-8 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-900">Scenario Calculator</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase">Temporarily recalculate logic with custom inputs</p>

            <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('gold')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Gold Spot Price ($/oz)</label>
                  <input type="number" placeholder={`${prices.gold}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.gold} onChange={(e) => setRecalcParams({ ...recalcParams, gold: e.target.value })} /></div>
              )}
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('silver')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Silver Spot Price ($/oz)</label>
                  <input type="number" placeholder={`${prices.silver}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.silver} onChange={(e) => setRecalcParams({ ...recalcParams, silver: e.target.value })} /></div>
              )}
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('platinum')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Platinum Spot Price ($/oz)</label>
                  <input type="number" placeholder={`${prices.platinum}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.platinum} onChange={(e) => setRecalcParams({ ...recalcParams, platinum: e.target.value })} /></div>
              )}
              {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('palladium')) && (
                <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Palladium Spot Price ($/oz)</label>
                  <input type="number" placeholder={`${prices.palladium}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.palladium} onChange={(e) => setRecalcParams({ ...recalcParams, palladium: e.target.value })} /></div>
              )}

              <hr className="border-stone-200" />

              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">New Labor Rate ($/hr)</label>
                <input type="number" placeholder="Enter rate to recalculate..." className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.laborRate} onChange={(e) => setRecalcParams({ ...recalcParams, laborRate: e.target.value })} />
              </div>
            </div>

            {/* LIVE CALCULATION DISPLAY */}
            <div className="p-4 bg-slate-900 rounded-2xl text-white space-y-2">
              {(() => {
                const laborHours = recalcItem.hours || 1;
                const effectiveRate = recalcParams.laborRate
                  ? Number(recalcParams.laborRate)
                  : (Number(recalcItem.labor_at_making || 0) / laborHours);
                const newLaborCost = effectiveRate * laborHours;

                const stonesArray = convertStonesToArray(recalcItem);
                const calc = calculateFullBreakdown(
                  recalcItem.metals,
                  laborHours,
                  effectiveRate,
                  recalcItem.other_costs_at_making ?? 0,
                  stonesArray,
                  recalcItem.overhead_cost ?? 0,
                  'flat', // Force flat for recalc to avoid % of old dollar value issue
                  recalcItem.multiplier,
                  recalcItem.markup_b,
                  recalcParams
                );

                const liveRetail = recalcItem.strategy === 'A' ? calc.retailA : calc.retailB;

                return (
                  <>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-stone-400 uppercase">Recalculated Retail</span><span className="text-xl font-black">${liveRetail.toFixed(2)}</span></div>
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
              <button onClick={() => { setRecalcItem(null); setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' }); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Close Calculator</button>
              <button onClick={handleRecalcSync} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-[#A5BEAC] transition shadow-lg">Sync to Vault</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: GLOBAL RECALCULATE MODAL */}
      {showGlobalRecalc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border-2 border-[#A5BEAC] p-8 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-900">Global Recalculate</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase">Recalculate ENTIRE inventory with new inputs</p>

            <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Gold Spot Price ($/oz)</label>
                <input type="number" placeholder={`${prices.gold}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.gold} onChange={(e) => setRecalcParams({ ...recalcParams, gold: e.target.value })} /></div>

              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Silver Spot Price ($/oz)</label>
                <input type="number" placeholder={`${prices.silver}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.silver} onChange={(e) => setRecalcParams({ ...recalcParams, silver: e.target.value })} /></div>

              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Platinum Spot Price ($/oz)</label>
                <input type="number" placeholder={`${prices.platinum}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.platinum} onChange={(e) => setRecalcParams({ ...recalcParams, platinum: e.target.value })} /></div>

              <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Palladium Spot Price ($/oz)</label>
                <input type="number" placeholder={`${prices.palladium}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.palladium} onChange={(e) => setRecalcParams({ ...recalcParams, palladium: e.target.value })} /></div>

              <hr className="border-stone-200" />

              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">New Labor Rate ($/hr)</label>
                <input type="number" placeholder="Enter new rate..." className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.laborRate} onChange={(e) => setRecalcParams({ ...recalcParams, laborRate: e.target.value })} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowGlobalRecalc(false); setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' }); }} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
              <button onClick={handleGlobalRecalcSync} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-[#A5BEAC] transition shadow-lg">Recalculate All</button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-[#A5BEAC] p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center">
              <h3 className="text-xl font-black uppercase italic tracking-tighter">Secure the Vault</h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase mt-2">Enter your new master password</p>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New Password"
                className="w-full p-4 bg-stone-50 border rounded-2xl outline-none focus:border-[#A5BEAC] font-bold"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-stone-300 hover:text-[#A5BEAC]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={handleUpdatePassword}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#A5BEAC] transition-all shadow-lg"
            >
              Update Vault Access
            </button>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[400] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] border-2 border-[#A5BEAC] p-10 space-y-6 shadow-2xl animate-in zoom-in-95 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 ${notification.type === 'error' ? 'bg-red-50 text-red-500' :
                notification.type === 'info' ? 'bg-blue-50 text-blue-500' :
                  notification.type === 'confirm' ? 'bg-amber-50 text-amber-500' :
                    'bg-[#A5BEAC]/10 text-[#A5BEAC]'
              }`}>
              <span className="text-2xl">
                {notification.type === 'error' ? '⚠️' : notification.type === 'info' ? 'ℹ️' : notification.type === 'confirm' ? '❓' : '✨'}
              </span>
            </div>
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-900 leading-tight">{notification.title}</h3>
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wide leading-relaxed">
              {notification.message}
            </p>
            <div className="flex gap-3">
              {notification.type === 'confirm' ? (
                <>
                  <button onClick={() => setNotification(null)} className="flex-1 py-4 bg-stone-100 rounded-2xl font-black text-[10px] uppercase hover:bg-stone-200 transition">Cancel</button>
                  <button onClick={() => { notification.onConfirm?.(); setNotification(null); }} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-[#A5BEAC] transition shadow-lg">Confirm</button>
                </>
              ) : (
                <button
                  onClick={() => setNotification(null)}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#A5BEAC] transition-all shadow-lg"
                >
                  Understood
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white px-6 py-8 rounded-[2rem] border-2 shadow-sm gap-8 mb-6 relative border-[#A5BEAC]">
          <div className="hidden md:block md:w-1/4"></div>
          <div className="flex flex-col items-center justify-center text-center w-full md:w-2/4">
            <img src="/icon.png?v=2" alt="Logo" className="w-12 h-12 object-contain bg-transparent block brightness-110 contrast-125 mb-3" style={{ mixBlendMode: 'multiply' }} />
            <div className="flex flex-col items-center leading-none">
              <div className="flex items-center justify-center gap-2 mb-2">
                <h1 className="text-3xl font-black uppercase italic tracking-[0.1em] text-slate-900 leading-none">THE VAULT</h1>
              </div>
              <a href="https://bearsilverandstone.com" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black uppercase tracking-[0.15em] text-stone-400 hover:text-[#A5BEAC] transition-colors">BY BEAR SILVER AND STONE</a>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end justify-center gap-4 w-full md:w-1/4">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">{!user ? 'Vault Locked' : (user.is_anonymous ? 'Guest Mode' : `Vault: ${user.email?.split('@')[0]}`)}</p>
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-[#A5BEAC] animate-pulse' : 'bg-stone-300'}`}></div>
            </div>
            <div className="relative flex gap-2 w-full justify-center md:justify-end">
              {(!user || user.is_anonymous) ? (
                <button onClick={() => { setShowAuth(!showAuth); setShowPassword(false); }} className="text-[10px] font-black uppercase bg-slate-900 text-white px-8 py-3 rounded-xl hover:bg-[#A5BEAC] transition shadow-sm">Login / Sign Up</button>
              ) : (
                <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="text-[10px] font-black uppercase bg-stone-100 text-slate-900 px-8 py-3 rounded-xl hover:bg-stone-200 transition">Logout</button>
              )}
              {showAuth && (
                <div className="absolute right-0 mt-12 w-full md:w-80 bg-white p-6 rounded-3xl border-2 border-[#A5BEAC] shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 mx-auto auth-menu-container">
                  <button onClick={() => { setShowAuth(false); setShowPassword(false); }} className="absolute top-4 right-4 text-stone-300 hover:text-[#A5BEAC] font-black text-sm">✕</button>
                  <h3 className="text-sm font-black uppercase mb-4 text-center text-slate-900">Vault Access</h3>
                  <div className="w-full flex justify-center mb-4">
                    <GoogleLogin
                      onSuccess={handleGoogleHandshake}
                      onError={() => setNotification({ title: "Error", message: "Google Login Failed", type: 'error' })}
                      theme="outline"
                      size="large"
                      width="300"
                      shape="pill"
                      text="continue_with"
                    />
                  </div>
                  <div className="flex border-b border-stone-100 mb-4">
                    <button onClick={() => { setIsSignUp(false); setShowPassword(false); }} className={`flex-1 py-2 text-[10px] font-black uppercase ${!isSignUp ? 'text-[#A5BEAC] border-b-2 border-[#A5BEAC]' : 'text-stone-300'}`}>Login</button>
                    <button onClick={() => { setIsSignUp(true); setShowPassword(false); }} className={`flex-1 py-2 text-[10px] font-black uppercase ${isSignUp ? 'text-[#A5BEAC] border-b-2 border-[#A5BEAC]' : 'text-stone-300'}`}>Sign Up</button>
                  </div>
                  <form onSubmit={handleAuth} className="space-y-3">
                    <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl text-sm outline-none focus:border-[#A5BEAC] transition" value={email} onChange={e => setEmail(e.target.value)} required />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        className="w-full p-3 border rounded-xl text-sm outline-none focus:border-[#A5BEAC] transition"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-stone-300 hover:text-[#A5BEAC]"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <button type="submit" className="w-full bg-[#A5BEAC] text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-slate-900 transition shadow-md">{isSignUp ? 'Create Vault Account' : 'Open The Vault'}</button>
                    {!isSignUp && (
                      <button type="button" onClick={handleResetPassword} className="w-full text-center text-[9px] font-black uppercase text-stone-400 hover:text-[#A5BEAC] transition mt-2 tracking-widest">Forgot Password?</button>
                    )}
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MARKET TICKER - MODIFIED: Increased mb-2 to mb-6 for spacing */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2 mb-6 md:mb-6">
          {['gold', 'silver', 'platinum', 'palladium'].map((name) => (
            <div key={name} className="bg-white p-4 rounded-xl border-l-4 border-[#A5BEAC] shadow-sm text-center lg:text-left">
              <p className="text-[10px] font-black uppercase text-stone-400">{name}</p>
              <p className="text-xl font-bold">{prices[name] > 0 ? `$${prices[name].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--.--"}</p>
              {prices[`${name}_pct`] != null && (
                <p className={`text-xs font-semibold mt-0.5 ${prices[`${name}_pct`] >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {prices[`${name}_pct`] >= 0 ? '+' : ''}{prices[`${name}_pct`].toFixed(2)}% today
                </p>
              )}
            </div>
          ))}
        </div>

        {/* MOBILE NAVIGATION DROPDOWN - MODIFIED: Increased text size */}
        <div className="md:hidden w-full px-2 mt-0 mb-4">
          <div className="flex bg-white rounded-2xl border border-[#A5BEAC] shadow-sm overflow-hidden p-1">
            <button
              onClick={() => setActiveTab('calculator')}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-tighter transition-all rounded-xl ${activeTab === 'calculator' ? 'bg-[#A5BEAC] text-white shadow-inner' : 'text-stone-400'}`}
            >
              Calculator
            </button>
            <button
              onClick={() => setActiveTab('vault')}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-tighter transition-all rounded-xl ${activeTab === 'vault' ? 'bg-[#A5BEAC] text-white shadow-inner' : 'text-stone-400'}`}
            >
              The Vault
            </button>
            <button
              onClick={() => setActiveTab('logic')}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-tighter transition-all rounded-xl ${activeTab === 'logic' ? 'bg-[#A5BEAC] text-white shadow-inner' : 'text-stone-400'}`}
            >
              Logic
            </button>
          </div>
        </div>

        {/* On desktop (lg) items-stretch so calculator and vault columns match height; mobile unchanged */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start lg:items-stretch">
          {/* CALCULATOR COLUMN */}
          <div className={`lg:col-span-5 space-y-6 lg:sticky lg:top-6 self-start lg:self-stretch ${activeTab !== 'calculator' ? 'hidden md:block' : ''}`}>
            <div className="bg-white p-8 rounded-[2rem] shadow-xl border-2 border-[#A5BEAC] space-y-6 lg:h-full flex flex-col">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Calculator</h2>

              {/* Calculator section tabs: one visible at a time */}
              <div className="space-y-2">
                <p className="text-[11px] sm:text-xs font-bold text-stone-500 leading-snug">
                  <span className="block sm:inline">What&apos;s in this piece?</span>{' '}
                  <span className="text-stone-400 font-normal">Tap a section to add metal, stones, or labor.</span>
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2 p-2 rounded-xl bg-stone-100 border border-stone-200 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveCalculatorTab('metal')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-3 rounded-lg min-h-[44px] text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all min-w-0 ${activeCalculatorTab === 'metal' ? 'bg-[#A5BEAC] text-white shadow-sm' : 'bg-white text-slate-700 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 active:bg-stone-100'}`}
                  >
                    <span className="truncate">Metal</span>
                    <span
                      className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-black border cursor-default ${activeCalculatorTab === 'metal' ? 'bg-white/20 text-white border-white/40' : 'bg-[#A5BEAC] text-white border-[#A5BEAC]'}`}
                      title="Metals are required to add this piece to the vault"
                    >
                      ✓
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCalculatorTab('stones')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-3 rounded-lg min-h-[44px] text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all min-w-0 ${activeCalculatorTab === 'stones' ? 'bg-[#A5BEAC] text-white shadow-sm' : 'bg-white text-slate-700 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 active:bg-stone-100'}`}
                  >
                    <span className="truncate">Stones</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setActiveCalculatorTab('stones'); setIncludeStonesSection(!includeStonesSection); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveCalculatorTab('stones'); setIncludeStonesSection(!includeStonesSection); } }}
                      className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-black border-2 transition-colors ${activeCalculatorTab === 'stones' && includeStonesSection ? 'bg-white/20 text-white border-white/40' : includeStonesSection ? 'bg-[#A5BEAC] text-white border-[#A5BEAC]' : 'bg-white text-stone-400 border-stone-200'}`}
                      title={includeStonesSection ? 'Included in price (click to exclude)' : 'Excluded from price (click to include)'}
                    >
                      {includeStonesSection ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCalculatorTab('labor')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-3 rounded-lg min-h-[44px] text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all min-w-0 ${activeCalculatorTab === 'labor' ? 'bg-[#A5BEAC] text-white shadow-sm' : 'bg-white text-slate-700 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 active:bg-stone-100'}`}
                  >
                    <span className="truncate sm:hidden">Labor</span>
                    <span className="truncate hidden sm:inline">Labor & other</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setActiveCalculatorTab('labor'); setIncludeLaborSection(!includeLaborSection); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveCalculatorTab('labor'); setIncludeLaborSection(!includeLaborSection); } }}
                      className={`shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-black border-2 transition-colors ${activeCalculatorTab === 'labor' && includeLaborSection ? 'bg-white/20 text-white border-white/40' : includeLaborSection ? 'bg-[#A5BEAC] text-white border-[#A5BEAC]' : 'bg-white text-stone-400 border-stone-200'}`}
                      title={includeLaborSection ? 'Included in price (click to exclude)' : 'Excluded from price (click to include)'}
                    >
                      {includeLaborSection ? '✓' : ''}
                    </span>
                  </button>
                </div>
              </div>

              {activeCalculatorTab === 'metal' && (
              <div className="space-y-2 pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Metal components</p>
                <div className="p-4 bg-stone-50 rounded-2xl border-2 border-dotted border-stone-300 space-y-3">
                <select className="w-full p-3 border border-stone-200 rounded-xl font-bold bg-white focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none transition-shadow" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                  <option>Sterling Silver</option><option>10K Gold</option><option>14K Gold</option><option>18K Gold</option><option>22K Gold</option><option>24K Gold</option><option>Platinum 950</option><option>Palladium</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" min={0} placeholder="Weight" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none transition-shadow" value={tempWeight || ''} onChange={e => setTempWeight(Number(e.target.value))} />
                  <select className="p-3 border border-stone-200 rounded-xl text-[10px] font-bold focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>{Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}</select>
                </div>
                <div className="space-y-2">
                  <select className="w-full p-3 border border-stone-200 rounded-xl text-[10px] font-bold bg-white focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none" value={useManualPrice ? "manual" : "spot"} onChange={(e) => setUseManualPrice(e.target.value === "manual")}>
                    <option value="spot">Use Live Spot Price</option><option value="manual">Use Manual Input</option>
                  </select>
                  {useManualPrice && <input type="number" min={0} placeholder={`Price per ${tempUnit}`} className="w-full p-3 border border-[#A5BEAC] rounded-xl text-sm focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none animate-in fade-in" value={manualPriceInput} onChange={(e) => setManualPriceInput(e.target.value === '' ? '' : Number(e.target.value))} />}
                </div>
                <button onClick={addMetalToPiece} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#A5BEAC] transition-colors">+ Add metal</button>
                {metalList.map((m, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border border-stone-100 flex justify-between items-center">
                    <span className="text-slate-700">{m.weight}{m.unit} {m.type}</span>
                    <button onClick={() => setMetalList(metalList.filter((_, idx) => idx !== i))} className="text-red-500 text-lg hover:text-red-700 transition-colors">×</button>
                  </div>
                ))}
                </div>
              </div>
              )}

              {activeCalculatorTab === 'stones' && (
              <div className="space-y-2 pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Stones</p>
                <div className="p-4 bg-stone-50 rounded-2xl border-2 border-dotted border-stone-300 space-y-3">
                <input
                  type="text"
                  placeholder="Stone name (e.g. Diamond, Ruby)"
                  className="w-full p-3 border border-stone-200 rounded-xl font-bold bg-white focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none text-[10px]"
                  value={tempStoneName}
                  onChange={e => setTempStoneName(e.target.value)}
                />
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Cost ($)</label>
                    <input type="number" min={0} placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none" value={tempStoneCost} onChange={e => setTempStoneCost(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div className="w-28">
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Multiplier (×)</label>
                    <div className="flex items-center border border-stone-200 rounded-xl focus-within:ring-2 focus-within:ring-[#A5BEAC]/30 focus-within:border-[#2d4a22] bg-white">
                      <span className="pl-3 text-stone-400 font-black text-sm">×</span>
                      <input type="number" min={0} step="0.1" placeholder="2" className="flex-1 p-3 pl-1 pr-3 text-[10px] font-bold focus:outline-none bg-transparent w-14" value={tempStoneMarkup} onChange={e => setTempStoneMarkup(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
                <button onClick={addStoneToPiece} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#A5BEAC] transition-colors">+ Add stone</button>
                {stoneList.map((stone, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border border-stone-100 flex justify-between items-center">
                    <span className="text-slate-700">{stone.name} ${stone.cost.toFixed(2)} ×{stone.markup.toFixed(1)}</span>
                    <button onClick={() => setStoneList(stoneList.filter((_, idx) => idx !== i))} className="text-red-500 text-lg hover:text-red-700 transition-colors">×</button>
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
              <div className="space-y-2 pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Labor & overhead</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Labor $/hr</label>
                      <input type="number" min={0} placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none" value={rate} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setRate(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Hours</label>
                      <input type="number" min={0} step="0.1" placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none" value={hours} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setHours(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Overhead</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" min={0} placeholder="0" className="flex-1 p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none pr-2" value={overheadCost} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setOverheadCost(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                      <div className="flex rounded-xl border border-stone-200 overflow-hidden bg-stone-50">
                        <button type="button" onClick={() => setOverheadType('flat')} className={`px-3 py-2.5 text-[10px] font-black uppercase transition-colors ${overheadType === 'flat' ? 'bg-slate-900 text-white' : 'text-stone-400 hover:text-slate-700'}`}>$</button>
                        <button type="button" onClick={() => setOverheadType('percent')} className={`px-3 py-2.5 text-[10px] font-black uppercase transition-colors ${overheadType === 'percent' ? 'bg-slate-900 text-white' : 'text-stone-400 hover:text-slate-700'}`}>%</button>
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
                    <input type="number" min={0} placeholder="0" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22] focus:ring-2 focus:ring-[#A5BEAC]/30 focus:outline-none" value={otherCosts} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setOtherCosts(v); if (Number(v) > 0) setIncludeLaborSection(true); }} />
                  </div>
                </div>
              </div>
              )}

              <div className="mt-2 flex flex-col items-center gap-4 flex-1 min-h-0">
                <div className="w-full space-y-2">
                  <button
                    type="button"
                    onClick={() => setCostBreakdownOpen(!costBreakdownOpen)}
                    className="w-full flex items-center justify-between text-left py-1.5 group"
                    aria-expanded={costBreakdownOpen}
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 group-hover:text-stone-600">Cost breakdown</p>
                    <span className={`text-stone-400 transition-transform ${costBreakdownOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                {costBreakdownOpen && (
                <div className="w-full p-4 rounded-xl bg-stone-100 border border-stone-200 space-y-3 text-left">
                  <div className="flex justify-between items-center py-2 border-b border-stone-200"><span className="text-stone-500 font-bold uppercase text-[10px]">Materials Total (Metal+Stone+Other)</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).totalMaterials.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2 border-b border-stone-200"><span className="text-stone-500 font-bold uppercase text-[10px]">Labor Total ({Number(calcHours) || 0}h)</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).labor.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2"><span className="text-stone-500 font-bold uppercase text-[10px]">Overhead Total ({overheadType === 'percent' ? `${Number(calcOverheadCost) || 0}%` : 'Flat'})</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).overhead.toFixed(2)}</span></div>
                </div>
                )}
                </div>

                <hr className="w-full border-t border-stone-100 my-2" />

                <div className="w-full space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Retail price</p>
                <div className="grid grid-cols-1 gap-4 w-full">
                  <div
                    className={`rounded-2xl border-2 transition-all overflow-hidden ${strategy === 'A' ? 'border-[#A5BEAC] bg-stone-50 shadow-md' : 'border-stone-100 bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setStrategy('A')}
                      className="w-full flex flex-col sm:flex-row sm:items-stretch sm:gap-4 p-5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-[#A5BEAC] uppercase tracking-tighter mb-1">Strategy A</p>
                        <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).retailA.toFixed(2)}</p>
                        <p className="text-[10px] font-semibold text-stone-500 mt-1">Wholesale ${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).wholesaleA.toFixed(2)}</p>
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
                              className="min-w-12 w-14 bg-white border border-stone-200 rounded-lg text-xs font-bold py-1.5 px-2 text-center outline-none text-slate-900 focus:border-[#A5BEAC]"
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
                    className={`rounded-2xl border-2 transition-all overflow-hidden ${strategy === 'B' ? 'border-[#A5BEAC] bg-stone-50 shadow-md' : 'border-stone-100 bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setStrategy('B')}
                      className="w-full flex flex-col sm:flex-row sm:items-stretch sm:gap-4 p-5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-[#A5BEAC] uppercase tracking-tighter mb-1">Strategy B</p>
                        <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).retailB.toFixed(2)}</p>
                        <p className="text-[10px] font-semibold text-stone-500 mt-1">Wholesale ${calculateFullBreakdown(metalList, calcHours, calcRate, calcOtherCosts, calcStoneList, calcOverheadCost, overheadType).wholesaleB.toFixed(2)}</p>
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
                              className="min-w-12 w-14 bg-white border border-stone-200 rounded-lg text-xs font-bold py-1.5 px-2 text-center outline-none text-slate-900 focus:border-[#A5BEAC]"
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
                </div>
                </div>

                <hr className="w-full border-t border-stone-100 my-2" />

                <div className="w-full space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Save to vault</p>
                <div className="w-full space-y-4">
                  <input
                    placeholder="Product name"
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:border-[#A5BEAC] focus:ring-2 focus:ring-[#A5BEAC]/30 transition-all font-bold placeholder:font-normal"
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                  />
                  <p className="text-[9px] font-bold text-stone-400 uppercase">Tag</p>
                  <div className="flex flex-wrap gap-2">
                    {(['necklace', 'ring', 'bracelet', 'other'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setItemTag(t)} className={`py-1.5 px-3 rounded-xl text-[9px] font-black uppercase border transition-all ${itemTag === t ? 'bg-[#A5BEAC] text-white border-[#A5BEAC]' : 'bg-white border-stone-200 text-stone-400 hover:border-stone-300'}`}>{t}</button>
                    ))}
                  </div>
                  <button onClick={addToInventory} disabled={isGuest && !token && hasTurnstile} className={`w-full py-5 rounded-[1.8rem] font-black uppercase tracking-[0.15em] text-sm transition-all ${(isGuest && !token && hasTurnstile) ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-[#A5BEAC] text-white shadow-xl hover:bg-slate-900 active:scale-[0.97]'}`}>{(isGuest && !token && hasTurnstile) ? "Verifying…" : "Save to vault"}</button>
                </div>
                </div>

                {isGuest && !token && hasTurnstile && <div className="w-full flex justify-center mt-4 h-auto overflow-hidden animate-in fade-in slide-in-from-top-1"><Turnstile siteKey={turnstileSiteKey} onSuccess={(token) => setToken(token)} options={{ theme: 'light', appearance: 'interaction-only' }} /></div>}
              </div>
            </div>
          </div>

          {/* VAULT COLUMN */}
          {/* On desktop lg:h-full matches calculator column height; mobile keeps h-[85vh] */}
          <div className={`lg:col-span-7 bg-white rounded-[2.5rem] border-2 border-[#A5BEAC] shadow-sm flex flex-col h-[85vh] lg:h-full ${activeTab !== 'vault' ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-6 border-b border-stone-100 bg-white space-y-4 rounded-t-[2.5rem]">
              <div className="flex justify-between items-center text-left">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">Vault Inventory</h2>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{inventory.length} Records Stored</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-stone-400 uppercase italic">Total Vault Value</p>
                  <p className="text-2xl font-black text-slate-900">${pricesLoaded ? totalVaultValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--.--"}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 min-h-[48px] sm:h-12"> {/* Responsive height for mobile */}
                <div className="relative flex-1 flex gap-2 w-full min-h-[48px] sm:h-full">
                  {/* NEW: Filter Button (Fixed w-12 h-12) */}
                  <div className="relative filter-menu-container shrink-0 min-h-[48px] sm:h-full w-12"> {/* Explicit w-12 with min-height */}
                    <button
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      className={`filter-menu-trigger w-full h-full min-h-[48px] sm:min-h-0 flex items-center justify-center rounded-xl border transition-all ${showFilterMenu ? 'bg-slate-900 text-white border-slate-900' : 'bg-stone-50 border-stone-200 text-stone-400 hover:border-[#A5BEAC]'}`}
                    >
                      <span className="text-lg">⚡</span>
                    </button>

                    {/* Filter Menu Dropdown */}
                    {showFilterMenu && (
                      <div className="filter-menu-dropdown absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border-2 border-[#A5BEAC] z-[100] p-4 animate-in fade-in slide-in-from-top-2 space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase text-slate-900">Filters</h4>
                          <button onClick={() => {
                            setFilterLocation('All'); setFilterTag('All'); setFilterStrategy('All'); setFilterMetal('All'); setFilterStatus('Active');
                            setFilterMinPrice(''); setFilterMaxPrice(''); setFilterStartDate(''); setFilterEndDate('');
                          }} className="text-[9px] font-bold text-[#A5BEAC] uppercase hover:text-slate-900">Reset</button>
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
                            {['All', 'necklace', 'ring', 'bracelet', 'other'].map(t => (
                              <button key={t} onClick={() => setFilterTag(t)} className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border ${filterTag === t ? 'bg-[#A5BEAC] text-white border-[#A5BEAC]' : 'bg-white border-stone-200 text-stone-400'}`}>{t}</button>
                            ))}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Item Status</label>
                          <div className="flex gap-2 bg-stone-100 p-1 rounded-lg">
                            {['Active', 'Archived', 'All'].map(s => (
                              <button key={s} onClick={() => setFilterStatus(s)} className={`flex-1 py-1.5 rounded-md text-[8px] font-black uppercase transition-all ${filterStatus === s ? 'bg-white text-slate-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>{s}</button>
                            ))}
                          </div>
                        </div>

                        {/* Strategy */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Strategy</label>
                          <div className="flex gap-2">
                            {['All', 'A', 'B'].map(s => (
                              <button key={s} onClick={() => setFilterStrategy(s)} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border ${filterStrategy === s ? 'bg-[#A5BEAC] text-white border-[#A5BEAC]' : 'bg-white border-stone-200 text-stone-400'}`}>{s}</button>
                            ))}
                          </div>
                        </div>

                        {/* Metal */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-400 uppercase">Metal Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['All', 'Gold', 'Silver', 'Platinum'].map(m => (
                              <button key={m} onClick={() => setFilterMetal(m)} className={`py-1.5 rounded-lg text-[9px] font-black uppercase border ${filterMetal === m ? 'bg-[#A5BEAC] text-white border-[#A5BEAC]' : 'bg-white border-stone-200 text-stone-400'}`}>{m}</button>
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
                    )}
                  </div>

                  <div className="relative flex-1 min-w-0 min-h-[48px] sm:h-full"> {/* min-height for mobile */}
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 text-xs">🔍</span>
                    <input
                      type="text"
                      placeholder="Search items..."
                      className="w-full h-full min-h-[48px] sm:min-h-0 pl-10 pr-4 bg-stone-50 border rounded-xl text-xs font-bold outline-none focus:border-[#A5BEAC] transition-all"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* NEW: Combined Vault Options Menu */}
                <div className="relative vault-menu-container min-h-[48px] sm:h-full">
                  <button
                    onClick={() => { if (inventory.length > 0) setShowVaultMenu(!showVaultMenu); }}
                    disabled={inventory.length === 0}
                    className={`vault-menu-trigger w-full h-full min-h-[48px] sm:min-h-0 sm:w-auto px-6 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition shadow-sm ${inventory.length === 0
                        ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                        : 'bg-slate-900 text-white hover:bg-[#A5BEAC]'
                      }`}
                  >
                    Vault Options {showVaultMenu ? '▲' : '▼'}
                  </button>
                  {showVaultMenu && (
                    <div className="vault-menu-dropdown absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border-2 border-[#A5BEAC] z-[50] overflow-hidden animate-in fade-in">
                      {/* Selection Checkbox */}
                      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-slate-900">Select All</span>
                        <input type="checkbox" onChange={toggleSelectAll} checked={selectedItems.size === filteredInventory.length && filteredInventory.length > 0} className="accent-[#A5BEAC] w-4 h-4 cursor-pointer" />
                      </div>

                      {/* Batch Actions */}
                      <button onClick={syncAllToMarket} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                        Sync {selectedItems.size > 0 ? `Selected (${selectedItems.size})` : 'All'} to Market
                      </button>
                      <button onClick={() => { setShowGlobalRecalc(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                        Recalculate {selectedItems.size > 0 ? `Selected (${selectedItems.size})` : 'All'}
                      </button>

                      {/* Export Options */}
                      {filteredInventory.length > 0 ? (
                        <>
                          <button onClick={() => { setShowPDFOptions(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                            Export PDF Report {selectedItems.size > 0 && `(${selectedItems.size})`}
                          </button>
                          <button onClick={() => { exportToCSV(); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 transition-colors">
                            Export CSV Spreadsheet {selectedItems.size > 0 && `(${selectedItems.size})`}
                          </button>
                        </>
                      ) : (
                        <div className="px-4 py-3 text-[9px] text-stone-300 italic text-center uppercase font-bold cursor-default">
                          Vault Empty - No Exports
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FIXED: Removed max-h, added flex-1 min-h-0 and min-h-[600px] to ensure list has height */}
            {/* Added pb-40 to allow scrolling past last item so dropdown is visible */}
            <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 pb-40 custom-scrollbar overscroll-behavior-contain touch-pan-y bg-stone-50/20 rounded-b-[2.5rem]">
              {loading ? (
                <div className="p-20 text-center text-stone-400 font-bold uppercase text-xs tracking-widest animate-pulse">Opening Vault...</div>
              ) : (
                filteredInventory.map(item => {
                  // FIX: Force overhead_type to 'flat' here to correctly calculate Live Retail using the stored Dollar value
                  // FIX: Pass labor cost
                  const stonesArray = convertStonesToArray(item);
                  const current = calculateFullBreakdown(item.metals || [], 1, item.labor_at_making, item.other_costs_at_making || 0, stonesArray, item.overhead_cost || 0, 'flat', item.multiplier, item.markup_b);
                  const labor = item.labor_at_making || 0;
                  const liveWholesale = item.strategy === 'A' ? current.wholesaleA : current.wholesaleB;
                  const liveRetail = item.strategy === 'A' ? current.retailA : current.retailB;
                  const priceDiff = liveRetail - item.retail;
                  const isUp = priceDiff >= 0;

                  const formatCurrency = (num: number) => {
                    return num.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    });
                  };

                  // Calculate saved metal cost specifically for the breakdown display consistency
                  const savedMetalCost = item.metals?.reduce((acc: number, m: any) => {
                    const purities: any = { '10K Gold': 0.417, '14K Gold': 0.583, '18K Gold': 0.75, '22K Gold': 0.916, '24K Gold': 0.999, 'Sterling Silver': 0.925, 'Platinum 950': 0.95, 'Palladium': 0.95 };
                    const purity = purities[m.type] || 1;
                    const gramWeight = m.weight * UNIT_TO_GRAMS[m.unit];
                    const spot = m.isManual ? 0 : (m.spotSaved || 0);
                    const val = m.isManual ? (m.manualPrice || 0) : (spot / 31.1035) * purity * gramWeight;
                    return acc + val;
                  }, 0) || 0;

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
                          className="w-5 h-5 accent-[#A5BEAC] cursor-pointer rounded-md border-stone-300"
                        />
                      </div>

                      <div className="p-5 md:p-6 flex flex-col gap-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start flex-nowrap justify-between gap-3 relative">

                            {/* NEW IMAGE SLOT - Circular 64x64 thumbnail */}
                            {item.image_url && (
                              <div className="shrink-0 w-16 h-16 rounded-full overflow-hidden border border-stone-200 shadow-sm">
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              {editingNameId === item.id ? (
                                <div className="w-full animate-in fade-in slide-in-from-left-1 flex items-center gap-2">
                                  <input
                                    type="text"
                                    // FIXED: Added min-w-0 to prevent flex item blowout on mobile
                                    className="flex-1 bg-stone-50 border-2 border-[#A5BEAC] rounded-xl px-4 py-2 text-sm font-black uppercase outline-none shadow-inner min-w-0"
                                    value={newNameValue}
                                    autoFocus
                                    onChange={(e) => setNewNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') renameItem(item.id);
                                      if (e.key === 'Escape') setEditingNameId(null);
                                    }}
                                  />
                                  <button onClick={() => renameItem(item.id)} className="w-10 h-10 flex items-center justify-center bg-[#A5BEAC] text-white rounded-xl font-black text-lg shadow-sm hover:bg-slate-900 transition-colors shrink-0">✓</button>
                                </div>
                              ) : (
                                <div className="flex items-start flex-nowrap gap-2 w-full">
                                  <h3 className={`text-lg font-black leading-tight uppercase tracking-tight break-words flex-1 ${isSold ? 'line-through text-stone-400' : 'text-slate-900'}`}>
                                    {item.name}
                                  </h3>
                                  <div className="relative shrink-0 pt-0.5 item-menu-container">
                                    <button
                                      onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                                      className="item-menu-trigger w-8 h-8 flex items-center justify-center rounded-full bg-stone-50 text-[#A5BEAC] border border-stone-100 hover:bg-stone-100 transition-all shadow-sm"
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
                                          <label className="w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-stone-50 transition-colors flex items-center gap-3 cursor-pointer block">
                                            <span className="text-stone-400 w-5 text-center">📷</span>
                                            Change image
                                            <input
                                              type="file"
                                              accept="image/*"
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
                                              setManualRetail(item.retail.toFixed(2));
                                              setManualWholesale(item.wholesale.toFixed(2));
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
                                              deleteInventoryItem(item.id, item.name);
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
                                {(isSold || isArchived) && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-stone-200 text-stone-600 uppercase">SOLD / ARCHIVED</span>}

                                {/* Tag Badge & Dropdown */}
                                <div className="relative tag-menu-container">
                                  <button
                                    onClick={() => setShowTagMenuId(showTagMenuId === item.id ? null : item.id)}
                                    className="text-[8px] font-black px-1.5 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-100 uppercase hover:bg-amber-100 transition-colors leading-none flex items-center h-[18px]"
                                  >
                                    {item.tag || 'other'}
                                  </button>
                                  {showTagMenuId === item.id && (
                                    <div className="tag-menu-dropdown absolute top-full left-0 mt-1 w-28 bg-white border border-stone-200 rounded-xl shadow-lg z-[60] overflow-hidden animate-in fade-in">
                                      {(['necklace', 'ring', 'bracelet', 'other'] as const).map(t => (
                                        <button
                                          key={t}
                                          onClick={() => updateTag(item.id, t)}
                                          className="w-full px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-600 hover:bg-stone-50 border-b border-stone-50 last:border-0"
                                        >
                                          {t}
                                        </button>
                                      ))}
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
                                          className="w-full py-1 bg-[#A5BEAC] text-white rounded text-[9px] font-bold uppercase hover:bg-slate-900"
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
                            <p className="text-[7px] font-black text-slate-900 uppercase tracking-widest mb-1">Live Wholesale</p>
                            <p className="text-sm font-black text-slate-900 whitespace-nowrap">
                              ${pricesLoaded ? formatCurrency(liveWholesale) : "--.--"}
                            </p>
                          </div>
                          <div className="p-3 bg-white text-left">
                            <p className="text-[7px] font-black text-[#A5BEAC] uppercase tracking-widest italic mb-1">Live Retail</p>
                            <p className="text-base sm:text-lg font-black text-slate-900 leading-none whitespace-nowrap">
                              ${pricesLoaded ? formatCurrency(liveRetail) : "--.--"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <details className="group border-t border-stone-50 text-left">
                        <summary className="list-none cursor-pointer py-2 text-center text-[8px] font-black uppercase tracking-[0.3em] text-stone-300 hover:text-[#A5BEAC] transition-colors">View Breakdown & Notes</summary>
                        <div className="p-5 md:p-6 bg-stone-50/50 space-y-6">

                          {/* Compact Strategy, Materials, and Labor Boxes */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3">
                            {/* Strategy Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1">Strategy</p>
                              <p className="text-sm md:text-xs font-black text-slate-700 uppercase">{item.strategy}</p>
                            </div>
                            {/* Materials Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1">Materials</p>
                              <p className="text-sm md:text-xs font-black text-slate-700">${(savedMetalCost + Number(item.other_costs_at_making || 0)).toFixed(2)}</p>
                            </div>
                            {/* Labor Box */}
                            <div className="bg-white p-3.5 md:p-3 rounded-xl border border-stone-100 shadow-sm flex flex-col justify-center items-center text-center col-span-2 md:col-span-1 min-h-[70px] md:min-h-0">
                              <p className="text-[9px] md:text-[8px] font-black text-stone-400 uppercase mb-1.5 md:mb-1 leading-tight">Labor ({Number(item.hours || 0)}h @ ${((Number(item.labor_at_making) || 0) / (Number(item.hours) || 1)).toFixed(2)}/hr)</p>
                              <p className="text-sm md:text-xs font-black text-slate-700">${Number(item.labor_at_making || 0).toFixed(2)}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-8 text-left">
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase text-stone-400">Saved Breakdown</h4>
                              {item.metals?.map((m: any, idx: number) => {
                                const purities: any = { '10K Gold': 0.417, '14K Gold': 0.583, '18K Gold': 0.75, '22K Gold': 0.916, '24K Gold': 0.999, 'Sterling Silver': 0.925, 'Platinum 950': 0.95, 'Palladium': 0.95 };
                                const purity = purities[m.type] || 1;
                                const gramWeight = m.weight * UNIT_TO_GRAMS[m.unit];
                                const spot = m.isManual ? 0 : (m.spotSaved || 0);
                                const val = m.isManual ? m.manualPrice : (spot / 31.1035) * purity * gramWeight;

                                return (
                                  <div key={idx} className="flex justify-between items-center text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                    <div>
                                      <span>{m.weight}{m.unit} {m.type}</span>
                                    </div>
                                    <div className="text-right">
                                      <span>${(val > 0 ? val : 0).toFixed(2)}</span>
                                      {spot > 0 && <span className="block text-[8px] text-stone-400 font-medium normal-case tracking-wide">Spot: ${spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                      {m.isManual && <span className="block text-[8px] text-stone-400 font-medium normal-case tracking-wide">Manual</span>}
                                    </div>
                                  </div>
                                );
                              })}
                              {item.other_costs_at_making > 0 && (
                                <div className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                  <span>Findings/Other</span>
                                  <span>${Number(item.other_costs_at_making).toFixed(2)}</span>
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
                              {item.overhead_cost > 0 && (
                                <div className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                  <span>Overhead {(() => {
                                    const stonesArray = convertStonesToArray(item);
                                    const totalStoneCost = stonesArray.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
                                    const denominator = Number(item.materials_at_making) + Number(item.labor_at_making) + Number(item.other_costs_at_making) + totalStoneCost;
                                    return item.overhead_type === 'percent' && denominator > 0
                                      ? `(${((Number(item.overhead_cost) / denominator) * 100).toFixed(1)}%)`
                                      : '';
                                  })()}</span>
                                  <span>${Number(item.overhead_cost).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="bg-white p-4 rounded-2xl border border-stone-200 text-left">
                            <h4 className="text-[9px] font-black uppercase text-stone-400 mb-2">Vault Notes</h4>
                            <textarea className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-xs italic text-slate-600 resize-none h-24 outline-none focus:border-[#A5BEAC] transition-all" placeholder="Click to add notes..." defaultValue={item.notes || ''} onBlur={(e) => saveNote(item.id, (e.target as HTMLTextAreaElement).value)} />
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* LOGIC SECTION */}
        <div className={`grid grid-cols-1 gap-8 pt-0 mt-[-1rem] md:mt-0 md:pt-10 ${activeTab !== 'logic' ? 'hidden md:grid' : ''}`}>
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-[#A5BEAC] min-h-[400px] md:min-h-0">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-[#A5BEAC] decoration-4 underline-offset-8">1. MATERIAL CALCULATION DETAIL</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 text-left">
              <div className="space-y-6">
                <div className="bg-stone-50 p-6 md:p-8 rounded-[2rem] border border-stone-100 text-left">
                  <h3 className="text-xs font-black text-[#A5BEAC] uppercase tracking-widest mb-6">THE LOGIC</h3>
                  <div className="font-mono text-sm bg-white p-6 rounded-2xl border border-stone-100 text-center shadow-sm">
                    <p className="text-slate-900 font-bold break-words">Cost = (Spot ÷ 31.1035) × Grams × Purity</p>
                  </div>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed italic px-2">Spot prices are quoted per Troy Ounce. We divide by 31.1035 to get the price per gram, then multiply by the specific metal purity.</p>
              </div>
              <div className="bg-stone-50 p-6 md:p-8 rounded-[2rem] border border-stone-100 text-left">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">PURITY CONSTANTS:</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[10px] font-bold text-stone-400 uppercase tracking-tighter">
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>24K Gold</span><span>99.9%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>22K Gold</span><span>91.6%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>18K Gold</span><span>75.0%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>14K Gold</span><span>58.3%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>10K Gold</span><span>41.7%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>Sterling Silver</span><span>92.5%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>Plat 950</span><span>95.0%</span></div>
                  <div className="flex justify-between border-b border-stone-200 pb-1"><span>Palladium</span><span>95.0%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* New Logic Explanation for Stones & Overhead */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-[#A5BEAC] min-h-[400px] md:min-h-0">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-[#A5BEAC] decoration-4 underline-offset-8">2. ADVANCED PRICING LOGIC</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">STONE PRICING</h3>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0">S</div>
                      <span className="text-xs font-bold text-slate-900 break-words">Stone Retail = Stone Cost × Markup</span>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed italic">Stones are calculated separately from the main piece markup to allow for competitive diamond pricing (often lower margin) vs findings.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">OVERHEAD CALCULATION</h3>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0">$</div>
                      <span className="text-xs font-bold text-slate-900 break-words">Flat: Simple dollar addition</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0">%</div>
                      <span className="text-xs font-bold text-slate-900 break-words">Percent: (Metal + Labor + Other + Stones) × Percentage</span>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed italic mt-2">Stones are included in the burden base for percentage calculations.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-[#A5BEAC] min-h-[400px] md:min-h-0">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-[#A5BEAC] decoration-4 underline-offset-8">3. PRICE STRATEGY DETAIL</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">STRATEGY A (STANDARD MULTIPLIER)</h3>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">B</div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-stone-400 block mb-1">Base Cost =</span>
                        <span className="text-xs font-bold text-slate-900 break-words">Metal + Labor + Other + Overhead</span>
                        <span className="text-xs text-stone-500 italic block mt-1">(Stones excluded from base)</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">R</div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-stone-400 block mb-1">Retail Price =</span>
                        <span className="text-xs font-bold text-slate-900 break-words">(Base Cost × {retailMultA}) + (Stones × Stone Markup)</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">W</div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-stone-400 block mb-1">Displayed Wholesale =</span>
                        <span className="text-xs font-bold text-slate-900 break-words">Base Cost + Stone Cost</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">STRATEGY B (MATERIALS MARKUP)</h3>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">B</div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-stone-400 block mb-1">Base Cost =</span>
                        <span className="text-xs font-bold text-slate-900 break-words">((Metal + Other) × {markupB}) + Labor + Overhead</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">R</div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-stone-400 block mb-1">Retail Price =</span>
                        <span className="text-xs font-bold text-slate-900 break-words">(Base Cost × 2) + (Stones × Stone Markup)</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">W</div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-stone-400 block mb-1">Displayed Wholesale =</span>
                        <span className="text-xs font-bold text-slate-900 break-words">Base Cost + Stone Cost</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-2 py-8 border-t border-stone-200 mt-10">
            <a href="https://bearsilverandstone.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Powered by</span>
              <img
                src="/icon.png?v=2"
                alt="Bear Silver and Stone"
                className="w-6 h-6 object-contain brightness-110 contrast-125 mb-3"
                style={{ mixBlendMode: 'multiply' }}
              />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Bear Silver and Stone</span>
            </a>
            <InstallPrompt />
            <a href="https://bearsilverandstone.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[8px] font-bold uppercase tracking-widest text-stone-300 hover:text-[#A5BEAC] transition-colors mt-2">
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #A5BEAC; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #A5BEAC; }
        .custom-scrollbar { -webkit-overflow-scrolling: touch; }
      `}</style>
    </div>
  );
}