"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
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
  const [prices, setPrices] = useState<any>({ gold: 0, silver: 0, platinum: 0, palladium: 0, updated_at: null });
  const [itemName, setItemName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Menus
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  
  // Modals
  const [showGlobalRecalc, setShowGlobalRecalc] = useState(false);
  const [openEditId, setOpenEditId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [recalcItem, setRecalcItem] = useState<any>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  
  // PDF Export Options
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
  const [otherCosts, setOtherCosts] = useState<number | ''>('');
  const [strategy, setStrategy] = useState<'A' | 'B'>('A');
  const [retailMultA, setRetailMultA] = useState(3);
  const [markupB, setMarkupB] = useState(1.8);

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

  const [notification, setNotification] = useState<{ 
    title: string; 
    message: string; 
    type?: 'success' | 'error' | 'info' | 'confirm'; 
    onConfirm?: () => void 
  } | null>(null);

  const isGuest = !user || user.is_anonymous;

  const fetchPrices = useCallback(async (force = false) => {
    try {
      const cachedData = sessionStorage.getItem('vault_prices');
      const cacheTimestamp = sessionStorage.getItem('vault_prices_time');
      const now = Date.now();
      const oneMinute = 60 * 1000;

      if (!force && cachedData && cacheTimestamp && (now - Number(cacheTimestamp) < oneMinute)) {
        setPrices(JSON.parse(cachedData));
        setPricesLoaded(true);
        return;
      }

      const res = await fetch(`/api/gold-price?cb=${now}`);
      const priceData = await res.json();
      if (priceData.gold || priceData.silver) {
        const freshPrices = {
          gold: priceData.gold || 0,
          silver: priceData.silver || 0,
          platinum: priceData.platinum || 0,
          palladium: priceData.palladium || 0,
          updated_at: priceData.updated_at
        };
        setPrices(freshPrices);
        sessionStorage.setItem('vault_prices', JSON.stringify(freshPrices));
        sessionStorage.setItem('vault_prices_time', now.toString());
        setPricesLoaded(true);
      }
    } catch (e) {
      console.error("Price fetch failed", e);
    }
  }, []);

  const calculateFullBreakdown = useCallback((metals: any[], h: any, r: any, o: any, customMult?: number, customMarkup?: number, priceOverride?: any) => {
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
    const totalMaterials = rawMaterialCost + (Number(o) || 0);
    const labor = (Number(h) || 0) * (Number(r) || 0);
    const wholesaleA = totalMaterials + labor;
    const retailA = wholesaleA * (customMult ?? retailMultA);
    const wholesaleB = (totalMaterials * (customMarkup ?? markupB)) + labor;
    const retailB = wholesaleB * 2;
    return { wholesaleA, retailA, wholesaleB, retailB, totalMaterials, labor };
  }, [prices, retailMultA, markupB]);

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously();
        setUser(data.user);
      } else {
        setUser(session.user);
      }

      await fetchPrices();
      fetchInventory();
    }
    initSession();

    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        fetchPrices(true);
      }
    };

    window.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session) fetchInventory();

      if (event === "PASSWORD_RECOVERY") {
        setShowResetModal(true);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
    };
  }, [fetchPrices]);

  async function fetchInventory() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) { setLoading(false); return; }
    const { data, error } = await supabase.from('inventory').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
    if (!error && data) setInventory(data);
    setLoading(false);
  }

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
      
      ctx.clearRect(0,0,size,size);
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

  const deleteInventoryItem = async (id: string, name: string) => {
    setNotification({
      title: "Confirm Deletion",
      message: `Are you sure you want to permanently remove "${name}" from your Vault?`,
      type: 'confirm',
      onConfirm: async () => {
        const { error } = await supabase.from('inventory').delete().eq('id', id);
        if (!error) {
          setInventory(inventory.filter(item => item.id !== id));
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
            const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
            const labor = item.labor_at_making || 0;
            const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
            const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
            
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
                wholesale: liveWholesale, 
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
    setNotification({
        title: "Sync All to Market",
        message: "This will update EVERY item in your vault to reflect current market spot prices. This cannot be undone.",
        type: 'confirm',
        onConfirm: async () => {
            setLoading(true);
            setShowVaultMenu(false);
            
            const updates = inventory.map(async (item) => {
                const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
                const labor = item.labor_at_making || 0;
                const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
                const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
                
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
            setNotification({ title: "Vault Synced", message: "All items have been updated to live market prices.", type: 'success' });
        }
    });
  };

  const handleGlobalRecalcSync = async () => {
    setNotification({
      title: "Confirm Global Update",
      message: `Recalculate ALL items with these new parameters? This will overwrite saved labor costs and spot prices.`,
      type: 'confirm',
      onConfirm: async () => {
        setLoading(true);
        setShowVaultMenu(false);

        const updates = inventory.map(async (item) => {
            const laborHours = item.hours || 1;
            const newLaborCost = recalcParams.laborRate 
               ? Number(recalcParams.laborRate) * laborHours
               : Number(item.labor_at_making || 0);

            const calc = calculateFullBreakdown(
               item.metals || [], 
               1, 
               newLaborCost, 
               item.other_costs_at_making || 0, 
               item.multiplier, 
               item.markup_b,
               recalcParams 
            );

            const newWholesale = item.strategy === 'A' ? calc.wholesaleA + newLaborCost : calc.wholesaleB;
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
        setNotification({ title: "Global Update Complete", message: "All items have been recalculated.", type: 'success' });
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

        const calc = calculateFullBreakdown(
           recalcItem.metals, 
           1, 
           newLaborCost, 
           recalcItem.other_costs_at_making, 
           recalcItem.multiplier, 
           recalcItem.markup_b,
           recalcParams 
        );

        const newWholesale = recalcItem.strategy === 'A' ? calc.wholesaleA + newLaborCost : calc.wholesaleB;
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
    if (isGuest && !token) {
        setNotification({ title: "Verification Required", message: "Please complete the human verification to save items as a guest.", type: 'info' });
        return;
    }
    if (!itemName) {
        setNotification({ title: "Name Required", message: "Please provide a name for this piece to save it to your Vault.", type: 'info' });
        return;
    }
    if (metalList.length === 0 || !user) return;

    const a = calculateFullBreakdown(metalList, hours, rate, otherCosts);
    const newItem = {
      name: itemName, 
      metals: metalList, 
      wholesale: strategy === 'A' ? a.wholesaleA : a.wholesaleB, 
      retail: strategy === 'A' ? a.retailA : a.retailB,
      materials_at_making: a.totalMaterials - (Number(otherCosts) || 0), 
      labor_at_making: a.labor, 
      other_costs_at_making: Number(otherCosts) || 0,
      strategy: strategy, 
      multiplier: retailMultA, 
      markup_b: markupB, 
      user_id: user.id, 
      notes: '',
      hours: Number(hours) || 0 
    };
    const { data, error } = await supabase.from('inventory').insert([newItem]).select();
    if (!error && data) { 
        setInventory([data[0], ...inventory]); 
        setItemName(''); 
        setMetalList([]); 
        setHours(''); 
        setRate(''); 
        setOtherCosts(''); 
        setToken(null);
        setNotification({ title: "Item Saved", message: `"${newItem.name}" is now stored in your Vault.`, type: 'success' });
    }
  };

  const filteredInventory = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase();
    return inventory.filter(item => {
        if (item.name.toLowerCase().includes(lowerTerm)) return true;
        if (item.metals.some((m: any) => m.type.toLowerCase().includes(lowerTerm))) return true;
        if (item.notes && item.notes.toLowerCase().includes(lowerTerm)) return true;
        if (item.strategy && item.strategy.toLowerCase().includes(lowerTerm)) return true;
        const dateStr = new Date(item.created_at).toLocaleDateString();
        if (dateStr.includes(searchTerm)) return true;
        return false;
    });
  }, [inventory, searchTerm]);

  const totalVaultValue = useMemo(() => {
    return inventory.reduce((acc, item) => {
      const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
      const labor = item.labor_at_making || 0;
      const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
      return acc + liveRetail;
    }, 0);
  }, [inventory, prices, calculateFullBreakdown]);

  const exportToCSV = () => {
    const headers = ["Item Name", "Live Retail", "Live Wholesale", "Saved Retail", "Saved Wholesale", "Labor Hours", "Labor Cost", "Materials Cost", "Other Costs", "Notes", "Date Created", "Strategy", "Metals", "Image URL"];
    const rows = filteredInventory.map(item => {
      const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
      const labor = item.labor_at_making || 0;
      const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
      const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
      const metalsStr = item.metals.map((m: any) => `${m.weight}${m.unit} ${m.type}`).join('; ');
      return [
          `"${item.name}"`, 
          liveRetail.toFixed(2), 
          liveWholesale.toFixed(2), 
          Number(item.retail).toFixed(2), 
          Number(item.wholesale).toFixed(2), 
          item.hours || 0,
          labor.toFixed(2),
          (Number(item.materials_at_making) + Number(item.other_costs_at_making)).toFixed(2),
          Number(item.other_costs_at_making).toFixed(2),
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

  // UPDATED: Use circular cropping in memory for PDF
  const getCircularImageData = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        // Create a square canvas to fit the image
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            // 1. Draw the circle mask
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            
            // 2. Draw the image centered and cover
            // We need to calculate aspect ratio to simulate object-cover
            const aspect = img.width / img.height;
            let drawW = size;
            let drawH = size;
            let offsetX = 0;
            let offsetY = 0;

            if (aspect > 1) {
                // Landscape
                drawW = size * aspect;
                offsetX = -(drawW - size) / 2;
            } else {
                // Portrait
                drawH = size / aspect;
                offsetY = -(drawH - size) / 2;
            }
            
            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
            resolve(canvas.toDataURL("image/png"));
        } else {
            resolve(null);
        }
      };
      img.onerror = () => resolve(null);
    });
  };

  const exportDetailedPDF = async () => {
    setLoading(true);
    setShowPDFOptions(false); 

    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(45, 74, 34); doc.text('THE VAULT INVENTORY REPORT', 14, 20);
    doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
    
    if (includeLiveInPDF) {
        doc.text(`Total Vault live Market Value: $${totalVaultValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 14, 31);
    }

    let currentY = 45; // Moved down to avoid header

    for (const item of filteredInventory) {
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
      const labor = item.labor_at_making || 0;
      const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
      const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;

      let titleX = 14;
      if (item.image_url) {
          const imgData = await getCircularImageData(item.image_url); // Use the new safe helper
          if (imgData) {
              doc.addImage(imgData, 'PNG', 14, currentY, 20, 20); 
              titleX = 40; 
          }
      }

      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(0, 0, 0); doc.text(`${item.name.toUpperCase()}`, titleX, currentY + 8);
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
      doc.text(`Strategy: ${item.strategy} | Saved: ${new Date(item.created_at).toLocaleDateString()}`, titleX, currentY + 13);

      const tableHead = includeLiveInPDF 
          ? [['Financial Metric', 'Saved (Original)', 'Live (Current Market)']]
          : [['Financial Metric', 'Saved (Original)']];
      
      const tableBody = [];
      const retailRow: any[] = ['Retail Price', `$${Number(item.retail).toFixed(2)}`];
      if (includeLiveInPDF) retailRow.push({ content: `$${liveRetail.toFixed(2)}`, styles: { fontStyle: 'bold', textColor: [0, 0, 0] } });
      tableBody.push(retailRow);

      const wholesaleRow: any[] = ['Wholesale Cost', `$${Number(item.wholesale).toFixed(2)}`];
      if (includeLiveInPDF) wholesaleRow.push({ content: `$${liveWholesale.toFixed(2)}`, styles: { textColor: [0, 0, 0] } });
      tableBody.push(wholesaleRow);

      // UPDATED: Margin top for table to ensure it doesn't overlap image
      autoTable(doc, {
        startY: currentY + 22, 
        head: tableHead,
        body: tableBody,
        theme: 'grid', headStyles: { fillColor: [165, 190, 172], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14 }, tableWidth: includeLiveInPDF ? 120 : 80
      });

      let nextY = (doc as any).lastAutoTable.finalY + 6;

      if (includeBreakdownInPDF) {
          const breakdownLines = item.metals.map((m: any) => `${m.weight}${m.unit} ${m.type}`);
          if (item.other_costs_at_making > 0) breakdownLines.push(`Stones/Other: $${Number(item.other_costs_at_making).toFixed(2)}`);
          if (labor > 0) breakdownLines.push(`Labor Cost (${item.hours || 0}h): $${Number(labor).toFixed(2)}`);
          breakdownLines.push(`Materials Total: $${(Number(item.materials_at_making) + Number(item.other_costs_at_making)).toFixed(2)}`);

          doc.setFontSize(8); doc.setTextColor(80, 80, 80); doc.setFont("helvetica", "bold"); doc.text("BREAKDOWN:", 140, currentY + 28);
          doc.setFont("helvetica", "normal");
          breakdownLines.forEach((line: string, i: number) => doc.text(line, 140, currentY + 33 + (i * 4)));
          
          nextY = Math.max(nextY, currentY + 33 + (breakdownLines.length * 4) + 5);
      }

      if (item.notes) {
        if (nextY > 270) { doc.addPage(); nextY = 20; }
        
        doc.setFont("helvetica", "bold"); doc.text("NOTES:", 14, nextY);
        doc.setFont("helvetica", "italic"); doc.setTextColor(100, 100, 100);
        doc.text(item.notes, 14, nextY + 4, { maxWidth: 120 });
        nextY += 14; 
      }

      currentY = nextY + 10;
      doc.setDrawColor(220); doc.line(14, currentY - 5, 196, currentY - 5);
    }

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
                            marginLeft: imageRef.current ? -imageRef.current.naturalWidth/2 : 0,
                            marginTop: imageRef.current ? -imageRef.current.naturalHeight/2 : 0,
                            opacity: imageRef.current ? 1 : 0
                        }}
                        onLoad={(e) => {
                           const img = e.target as HTMLImageElement;
                           img.style.marginLeft = `-${img.naturalWidth / 2}px`;
                           img.style.marginTop = `-${img.naturalHeight / 2}px`;
                           img.style.opacity = '1';
                           
                           // FIXED: Calculate perfect fit scale (contain)
                           const fitScale = 256 / Math.min(img.naturalWidth, img.naturalHeight);
                           setMinZoom(fitScale); 
                           setZoom(fitScale); // Start at fit scale
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
                 <input type="number" placeholder={`${prices.gold}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.gold} onChange={(e) => setRecalcParams({...recalcParams, gold: e.target.value})} /></div>
               )}
               {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('silver')) && (
                 <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Silver Spot Price ($/oz)</label>
                 <input type="number" placeholder={`${prices.silver}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.silver} onChange={(e) => setRecalcParams({...recalcParams, silver: e.target.value})} /></div>
               )}
               {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('platinum')) && (
                 <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Platinum Spot Price ($/oz)</label>
                 <input type="number" placeholder={`${prices.platinum}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.platinum} onChange={(e) => setRecalcParams({...recalcParams, platinum: e.target.value})} /></div>
               )}
               {recalcItem.metals.some((m: any) => m.type.toLowerCase().includes('palladium')) && (
                 <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Palladium Spot Price ($/oz)</label>
                 <input type="number" placeholder={`${prices.palladium}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.palladium} onChange={(e) => setRecalcParams({...recalcParams, palladium: e.target.value})} /></div>
               )}
               
               <hr className="border-stone-200" />
               
               <div>
                   <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">New Labor Rate ($/hr)</label>
                   <input type="number" placeholder="Enter rate to recalculate..." className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.laborRate} onChange={(e) => setRecalcParams({...recalcParams, laborRate: e.target.value})} />
               </div>
            </div>

            {/* LIVE CALCULATION DISPLAY */}
            <div className="p-4 bg-slate-900 rounded-2xl text-white space-y-2">
               {(() => {
                 const laborHours = recalcItem.hours || 1;
                 const newLaborCost = recalcParams.laborRate 
                    ? Number(recalcParams.laborRate) * laborHours
                    : Number(recalcItem.labor_at_making || 0);
                 
                 const calc = calculateFullBreakdown(
                   recalcItem.metals, 
                   1, 
                   newLaborCost, 
                   recalcItem.other_costs_at_making, 
                   recalcItem.multiplier, 
                   recalcItem.markup_b,
                   recalcParams 
                 );
                 
                 const liveRetail = recalcItem.strategy === 'A' ? (calc.totalMaterials + newLaborCost) * (recalcItem.multiplier || 3) : ((calc.totalMaterials * (recalcItem.markup_b || 1.8)) + newLaborCost) * 2;
                 
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
               <input type="number" placeholder={`${prices.gold}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.gold} onChange={(e) => setRecalcParams({...recalcParams, gold: e.target.value})} /></div>
               
               <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Silver Spot Price ($/oz)</label>
               <input type="number" placeholder={`${prices.silver}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.silver} onChange={(e) => setRecalcParams({...recalcParams, silver: e.target.value})} /></div>
               
               <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Platinum Spot Price ($/oz)</label>
               <input type="number" placeholder={`${prices.platinum}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.platinum} onChange={(e) => setRecalcParams({...recalcParams, platinum: e.target.value})} /></div>
               
               <div><label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">Palladium Spot Price ($/oz)</label>
               <input type="number" placeholder={`${prices.palladium}`} className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.palladium} onChange={(e) => setRecalcParams({...recalcParams, palladium: e.target.value})} /></div>
               
               <hr className="border-stone-200" />
               
               <div>
                   <label className="text-[9px] font-black uppercase text-stone-400 mb-1 block">New Labor Rate ($/hr)</label>
                   <input type="number" placeholder="Enter new rate..." className="w-full p-3 bg-white border rounded-xl outline-none focus:border-[#A5BEAC] font-bold text-sm" value={recalcParams.laborRate} onChange={(e) => setRecalcParams({...recalcParams, laborRate: e.target.value})} />
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
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 ${
                notification.type === 'error' ? 'bg-red-50 text-red-500' : 
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
                <div className="absolute right-0 mt-12 w-full md:w-80 bg-white p-6 rounded-3xl border-2 border-[#A5BEAC] shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 mx-auto">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* CALCULATOR COLUMN */}
          <div className={`lg:col-span-5 space-y-6 ${activeTab !== 'calculator' ? 'hidden md:block' : ''}`}>
            <div className="bg-white p-8 rounded-[2rem] shadow-xl border-2 border-[#A5BEAC] lg:sticky lg:top-6 space-y-5">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Calculator</h2>
              
              <div className="p-4 bg-stone-50 rounded-2xl border-2 border-dotted border-stone-300 space-y-3">
                <select className="w-full p-3 border rounded-xl font-bold bg-white focus:border-[#2d4a22]" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                  <option>Sterling Silver</option><option>10K Gold</option><option>14K Gold</option><option>18K Gold</option><option>22K Gold</option><option>24K Gold</option><option>Platinum 950</option><option>Palladium</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" placeholder="Weight" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#2d4a22]" value={tempWeight || ''} onChange={e => setTempWeight(Number(e.target.value))} />
                  <select className="p-3 border border-stone-200 rounded-xl text-[10px] font-bold focus:border-[#2d4a22]" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>{Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}</select>
                </div>
                <div className="space-y-2">
                  <select className="w-full p-3 border border-stone-200 rounded-xl text-[10px] font-bold bg-white focus:border-[#2d4a22]" value={useManualPrice ? "manual" : "spot"} onChange={(e) => setUseManualPrice(e.target.value === "manual")}>
                    <option value="spot">Use Live Spot Price</option><option value="manual">Use Manual Input</option>
                  </select>
                  {useManualPrice && <input type="number" placeholder={`Price per ${tempUnit}`} className="w-full p-3 border border-[#A5BEAC] rounded-xl text-sm outline-none animate-in fade-in" value={manualPriceInput} onChange={(e) => setManualPriceInput(e.target.value === '' ? '' : Number(e.target.value))} />}
                </div>
                <button onClick={addMetalToPiece} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#A5BEAC] transition-colors">+ Add Component</button>
                {metalList.map((m, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border border-stone-100 flex justify-between items-center">
                    <span className="text-slate-700">{m.weight}{m.unit} {m.type}</span>
                    <button onClick={() => setMetalList(metalList.filter((_, idx) => idx !== i))} className="text-red-500 text-lg hover:text-red-700 transition-colors">×</button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Labor $/hr" className="p-3 border rounded-xl focus:border-[#2d4a22]" value={rate} onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} />
                <input type="number" placeholder="Hours" className="p-3 border rounded-xl focus:border-[#2d4a22]" value={hours} onChange={e => setHours(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <input type="number" placeholder="Stones/Other Costs ($)" className="w-full p-3 border rounded-xl focus:border-[#2d4a22]" value={otherCosts} onChange={e => setOtherCosts(e.target.value === '' ? '' : Number(e.target.value))} />
              <div className="mt-4 flex flex-col items-center gap-4">
                <div className="w-full p-4 rounded-xl bg-stone-100 border border-stone-200 space-y-3 text-left">
                  <div className="flex justify-between items-center py-2 border-b border-stone-200"><span className="text-stone-500 font-bold uppercase text-[10px]">Materials Total</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).totalMaterials.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2"><span className="text-stone-500 font-bold uppercase text-[10px]">Labor Total ({hours || 0}h)</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).labor.toFixed(2)}</span></div>
                </div>

                <hr className="w-full border-t border-stone-100 my-2" />

                <div className="grid grid-cols-1 gap-4 w-full">
                  <button
                    onClick={() => setStrategy('A')}
                    className={`group flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 rounded-[2rem] border-2 transition-all ${strategy === 'A' ? 'border-[#A5BEAC] bg-stone-50 shadow-md' : 'border-stone-100 bg-white hover:border-stone-200'}`}
                  >
                    <div className="text-left mb-4 sm:mb-0">
                      <p className="text-[10px] font-black text-[#A5BEAC] uppercase tracking-tighter mb-1">Retail A</p>
                      <p className="text-3xl font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).retailA.toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-1">Wholesale: ${calculateFullBreakdown(metalList, hours, rate, otherCosts).wholesaleA.toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col items-start sm:items-end">
                      <div className="flex items-center gap-1 text-[#a8a29e] italic font-black text-[10px] uppercase whitespace-nowrap">
                        <span>Wholesale: M + L</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-black text-[#a8a29e] uppercase italic whitespace-nowrap">Retail: W ×</span>
                        <input
                          type="number"
                          step="0.1"
                          className="w-12 bg-white border-2 border-[#A5BEAC] rounded-xl text-xs font-black py-1.5 text-center outline-none text-slate-900"
                          value={retailMultA}
                          onChange={(e) => setRetailMultA(Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setStrategy('B')}
                    className={`group relative flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 rounded-[2rem] border-2 transition-all ${strategy === 'B' ? 'border-[#A5BEAC] bg-stone-50 shadow-md' : 'border-stone-100 bg-white hover:border-stone-200'}`}
                  >
                    <div className="text-left mb-4 sm:mb-0">
                      <p className="text-[10px] font-black text-[#A5BEAC] uppercase tracking-tighter mb-1">Retail B</p>
                      <p className="text-3xl font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).retailB.toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-1">Wholesale: ${calculateFullBreakdown(metalList, hours, rate, otherCosts).wholesaleB.toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col items-start sm:items-end">
                      <div className="flex items-center gap-1 text-[#a8a29e] italic font-black text-[10px] uppercase whitespace-nowrap">
                        <span>Wholesale: (M ×</span>
                        <input
                          type="number"
                          step="0.1"
                          className="w-12 bg-white border-2 border-[#A5BEAC] rounded-xl text-xs font-black py-1.5 text-center outline-none text-slate-900"
                          value={markupB}
                          onChange={(e) => setMarkupB(Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span>) + L</span>
                      </div>
                      <p className="text-[10px] font-black text-[#a8a29e] italic uppercase whitespace-nowrap mt-1">Retail: W × 2</p>
                    </div>
                  </button>
                </div>

                <hr className="w-full border-t border-stone-100 my-2" />
                
                <div className="w-full space-y-4">
                  <input 
                    placeholder="Product Name" 
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:border-[#A5BEAC] transition-all font-bold placeholder:font-normal" 
                    value={itemName} 
                    onChange={e => setItemName(e.target.value)} 
                  />
                  <button onClick={addToInventory} disabled={isGuest && !token} className={`w-full py-5 rounded-[1.8rem] font-black uppercase tracking-[0.15em] text-sm transition-all ${(isGuest && !token) ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-[#A5BEAC] text-white shadow-xl hover:bg-slate-900 active:scale-[0.97]'}`}>{(isGuest && !token) ? "Verifying Human..." : "Save to Vault"}</button>
                </div>

                {isGuest && !token && <div className="w-full flex justify-center mt-4 h-auto overflow-hidden animate-in fade-in slide-in-from-top-1"><Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} onSuccess={(token) => setToken(token)} options={{ theme: 'light', appearance: 'interaction-only' }} /></div>}
              </div>
            </div>
          </div>

          {/* VAULT COLUMN */}
          <div className={`lg:col-span-7 bg-white rounded-[2.5rem] border-2 border-[#A5BEAC] shadow-sm overflow-hidden flex flex-col h-fit ${activeTab !== 'vault' ? 'hidden md:block' : ''}`}>
            <div className="p-6 border-b border-stone-100 bg-white space-y-4">
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

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 text-xs">🔍</span>
                  <input
                    type="text"
                    placeholder="Search items..."
                    className="w-full pl-10 pr-4 py-3 bg-stone-50 border rounded-xl text-xs font-bold outline-none focus:border-[#A5BEAC] transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                {/* NEW: Combined Vault Options Menu */}
                <div className="relative">
                    <button 
                        onClick={() => { if (inventory.length > 0) setShowVaultMenu(!showVaultMenu); }} 
                        disabled={inventory.length === 0}
                        className={`w-full sm:w-auto px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition shadow-sm ${
                            inventory.length === 0 
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed' 
                            : 'bg-slate-900 text-white hover:bg-[#A5BEAC]'
                        }`}
                    >
                        Vault Options {showVaultMenu ? '▲' : '▼'}
                    </button>
                    {showVaultMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border-2 border-[#A5BEAC] z-[50] overflow-hidden animate-in fade-in">
                            {/* Batch Actions */}
                            <button onClick={syncAllToMarket} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                                Sync All to Market
                            </button>
                            <button onClick={() => { setShowGlobalRecalc(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                                Recalculate All
                            </button>
                            
                            {/* Export Options */}
                            {filteredInventory.length > 0 ? (
                                <>
                                    <button onClick={() => { setShowPDFOptions(true); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                                        Export PDF Report
                                    </button>
                                    <button onClick={() => { exportToCSV(); setShowVaultMenu(false); }} className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 transition-colors">
                                        Export CSV Spreadsheet
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

            <div className="p-4 md:p-6 space-y-4 overflow-y-auto max-h-[850px] custom-scrollbar overscroll-behavior-contain touch-pan-y bg-stone-50/20">
              {loading ? (
                <div className="p-20 text-center text-stone-400 font-bold uppercase text-xs tracking-widest animate-pulse">Opening Vault...</div>
              ) : (
                filteredInventory.map(item => {
                  const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
                  const labor = item.labor_at_making || 0;
                  const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
                  const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
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

                  return (
                    <div key={item.id} className="bg-white rounded-[2rem] border border-stone-100 shadow-sm overflow-visible relative transition-all hover:shadow-md">
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
                                    className="flex-1 bg-stone-50 border-2 border-[#A5BEAC] rounded-xl px-4 py-2 text-sm font-black uppercase outline-none shadow-inner"
                                    value={newNameValue}
                                    autoFocus
                                    onChange={(e) => setNewNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') renameItem(item.id);
                                        if(e.key === 'Escape') setEditingNameId(null);
                                    }}
                                    />
                                    <button onClick={() => renameItem(item.id)} className="w-10 h-10 flex items-center justify-center bg-[#A5BEAC] text-white rounded-xl font-black text-lg shadow-sm hover:bg-slate-900 transition-colors shrink-0">✓</button>
                                </div>
                                ) : (
                                <div className="flex items-start flex-nowrap gap-2 w-full">
                                    <h3 className="text-lg font-black text-slate-900 leading-tight uppercase tracking-tight break-words flex-1">
                                        {item.name}
                                    </h3>
                                    <div className="relative shrink-0 pt-0.5">
                                        <button 
                                            onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                                            className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-50 text-[#A5BEAC] border border-stone-100 hover:bg-stone-100 transition-all shadow-sm"
                                        >
                                            <span className="text-[10px] transform transition-transform duration-200" style={{ transform: openMenuId === item.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                        </button>
                                        
                                        {openMenuId === item.id && (
                                            <div className="absolute top-full left-auto right-0 mt-2 w-48 bg-white border border-[#A5BEAC] rounded-2xl shadow-xl z-[150] overflow-hidden animate-in fade-in slide-in-from-top-1">
                                                <button 
                                                    onClick={() => {
                                                    setEditingNameId(item.id);
                                                    setNewNameValue(item.name);
                                                    setOpenMenuId(null);
                                                    }}
                                                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b transition-colors flex items-center gap-2"
                                                >
                                                    <span>✎</span> Edit Name
                                                </button>
                                                
                                                {/* NEW: Image Upload Option */}
                                                <label className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b transition-colors flex items-center gap-2 cursor-pointer">
                                                    <span>📷</span> {uploadingId === item.id ? "Uploading..." : "Add/Edit Image"}
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        className="hidden" 
                                                        disabled={uploadingId === item.id}
                                                        onChange={(e) => onFileSelect(e, item.id)}
                                                    />
                                                </label>

                                                <button 
                                                    onClick={() => syncToMarket(item)}
                                                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b transition-colors flex items-center gap-2"
                                                >
                                                    <span>🔄</span> Sync to Market
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                    setRecalcItem(item);
                                                    setRecalcParams({ gold: '', silver: '', platinum: '', palladium: '', laborRate: '' });
                                                    setOpenMenuId(null);
                                                    }}
                                                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b transition-colors flex items-center gap-2"
                                                >
                                                    <span>🧮</span> Recalculate
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                    setEditingItem(item);
                                                    setManualRetail(item.retail.toFixed(2));
                                                    setManualWholesale(item.wholesale.toFixed(2));
                                                    setOpenMenuId(null);
                                                    }}
                                                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-slate-700 hover:bg-stone-50 border-b transition-colors flex items-center gap-2"
                                                >
                                                    <span>⚙️</span> Manual Price Edit
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                    deleteInventoryItem(item.id, item.name);
                                                    setOpenMenuId(null);
                                                    }}
                                                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
                                                >
                                                    <span>🗑️</span> Remove from Vault
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                )}
                                
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md border bg-slate-100 text-slate-500 border-slate-200 uppercase">
                                      Strategy {item.strategy}
                                    </span>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${isUp ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                        {isUp ? '▲' : '▼'} ${formatCurrency(Math.abs(priceDiff))}
                                    </span>
                                    <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest text-left">
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
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
                                    {spot > 0 && <span className="block text-[8px] text-stone-400 font-medium normal-case tracking-wide">Spot: ${spot.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>}
                                  </div>
                                  <div className="text-right">
                                     <span className="text-stone-400">{m.isManual ? 'Manual' : (val > 0 ? `$${val.toFixed(2)}` : 'Spot')}</span>
                                  </div>
                                </div>
                                );
                              })}
                              {item.other_costs_at_making > 0 && (
                                <div className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1.5 uppercase">
                                  <span>Stones/Other</span>
                                  <span>${Number(item.other_costs_at_making).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-5">
                              <div className="grid grid-cols-2 gap-3 text-center">
                                <div className="bg-white p-3.5 rounded-xl border border-stone-100 shadow-sm">
                                  <p className="text-[8px] font-black text-stone-400 uppercase mb-1">Materials</p>
                                  <p className="text-xs font-black text-slate-700">${(savedMetalCost + Number(item.other_costs_at_making || 0)).toFixed(2)}</p>
                                </div>
                                <div className="bg-white p-3.5 rounded-xl border border-stone-100 shadow-sm">
                                  <p className="text-[8px] font-black text-stone-400 uppercase mb-1">Labor ({Number(item.hours || 0)}h @ ${((Number(item.labor_at_making) || 0) / (Number(item.hours) || 1)).toFixed(2)}/hr)</p>
                                  <p className="text-xs font-black text-slate-700">${Number(item.labor_at_making || 0).toFixed(2)}</p>
                                </div>
                              </div>
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

          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-[#A5BEAC] min-h-[400px] md:min-h-0">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-[#A5BEAC] decoration-4 underline-offset-8">2. PRICE STRATEGY DETAIL</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">STRATEGY A (STANDARD MULTIPLIER)</h3>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0">W</div>
                      <span className="text-xs font-bold text-stone-400">=</span>
                      <span className="text-xs font-bold text-slate-900 break-words">Materials (M) + Labor (L)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0">R</div>
                      <span className="text-xs font-bold text-stone-400">=</span>
                      <span className="text-xs font-bold text-slate-900 break-words">Wholesale (W) × {retailMultA}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-stone-200/60">
                  <p className="text-[11px] text-[#a8a29e] leading-relaxed italic uppercase font-bold tracking-tight">
                    * The standard retail model. Best for production pieces where a 2-3x markup covers overhead, marketing, and business growth.
                  </p>
                </div>
              </div>

              <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">STRATEGY B (MATERIALS MARKUP)</h3>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center font-black text-xs shrink-0">W</div>
                      <span className="text-xs font-bold text-stone-400">=</span>
                      <span className="text-xs font-bold text-slate-900 break-words">(Materials × {markupB}) + Labor</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0">R</div>
                      <span className="text-xs font-bold text-stone-400">=</span>
                      <span className="text-xs font-bold text-slate-900 break-words">Wholesale (W) × 2</span>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-stone-200/60">
                  <p className="text-[11px] text-[#a8a29e] leading-relaxed italic uppercase font-bold tracking-tight">
                    * The custom model. Best for high-material-cost work where you markup the metals first by 1.5-1.8X to protect against market volatility.
                  </p>
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