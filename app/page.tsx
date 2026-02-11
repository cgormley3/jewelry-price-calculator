"use client";
import { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { Turnstile } from '@marsidev/react-turnstile';

const UNIT_TO_GRAMS: { [key: string]: number } = {
  "Grams": 1,
  "Pennyweights (dwt)": 1.55517,
  "Troy Ounces": 31.1035,
  "Ounces (std)": 28.3495
};

export default function Home() {
  const [prices, setPrices] = useState<any>({ gold: null, silver: null, platinum: null, palladium: null, updated_at: null });
  const [itemName, setItemName] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // NEW: For filtering large lists
  const [metalList, setMetalList] = useState<{ type: string, weight: number, unit: string, isManual?: boolean, manualPrice?: number }[]>([]);
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
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [markupB, setMarkupB] = useState(1.8);

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously();
        setUser(data.user);
      } else {
        setUser(session.user);
      }
      try {
        const res = await fetch('/api/gold-price');
        const priceData = await res.json();
        if (priceData.gold) {
          setPrices(priceData);
          setTimeout(() => setPricesLoaded(true), 800);
        }
      } catch (e) { console.error("Price fetch failed", e); }
      fetchInventory();
    }
    initSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) fetchInventory();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchInventory() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) { setLoading(false); return; }
    const { data, error } = await supabase.from('inventory').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
    if (!error && data) setInventory(data);
    setLoading(false);
  }

  // --- CORE FUNCTIONS ---

  const addMetalToPiece = () => {
    if (tempWeight <= 0) return;
    setMetalList([...metalList, { type: tempMetal, weight: tempWeight, unit: tempUnit, isManual: useManualPrice, manualPrice: useManualPrice ? Number(manualPriceInput) : undefined }]);
    setTempWeight(0); setManualPriceInput(''); setUseManualPrice(false);
  };

  const calculateFullBreakdown = (metals: any[], h: any, r: any, o: any, customMult?: number, customMarkup?: number) => {
    let rawMaterialCost = 0;
    const numH = Number(h) || 0;
    const numR = Number(r) || 0;
    const numO = Number(o) || 0;
    metals.forEach(m => {
      let pricePerGram = 0;
      if (m.isManual && m.manualPrice) pricePerGram = m.manualPrice / UNIT_TO_GRAMS[m.unit];
      else {
        let spot = 0;
        if (m.type.includes('Gold')) spot = prices.gold;
        else if (m.type.includes('Silver')) spot = prices.silver;
        else if (m.type.includes('Platinum')) spot = prices.platinum;
        else if (m.type.includes('Palladium')) spot = prices.palladium;
        const purities: any = { '10K Gold': 0.417, '14K Gold': 0.583, '18K Gold': 0.750, '22K Gold': 0.916, '24K Gold': 0.999, 'Sterling Silver': 0.925, 'Platinum 950': 0.950, 'Palladium': 0.950 };
        pricePerGram = (spot / 31.1035) * (purities[m.type] || 1.0);
      }
      rawMaterialCost += pricePerGram * (m.weight * UNIT_TO_GRAMS[m.unit]);
    });
    const totalMaterials = rawMaterialCost + numO;
    const labor = numH * numR;
    const wholesaleA = totalMaterials + labor;
    const retailA = wholesaleA * (customMult ?? retailMultA);
    const wholesaleB = (totalMaterials * (customMarkup ?? markupB)) + labor;
    const retailB = wholesaleB * 2;
    return { wholesaleA, retailA, wholesaleB, retailB, totalMaterials, labor };
  };

  const deleteInventoryItem = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to permanently delete "${name}" from your vault?`)) {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (!error) setInventory(inventory.filter(item => item.id !== id));
    }
  };

  const saveNote = async (id: string, newNote: string) => {
    const { error } = await supabase.from('inventory').update({ notes: newNote }).eq('id', id);
    if (!error) fetchInventory();
  };

  const syncToMarket = async (item: any) => {
    if (!window.confirm(`Update stored prices for "${item.name}" to today's market value?`)) return;
    const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
    const labor = item.labor_at_making || 0;
    const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
    const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
    const { error } = await supabase.from('inventory').update({ wholesale: liveWholesale, retail: liveRetail }).eq('id', item.id);
    if (!error) fetchInventory();
  };

  const addToInventory = async () => {
    if (!token || !itemName || metalList.length === 0 || !user) return alert("Missing verification");
    const a = calculateFullBreakdown(metalList, hours, rate, otherCosts);
    const newItem = {
      name: itemName, metals: metalList, wholesale: strategy === 'A' ? a.wholesaleA : a.wholesaleB, retail: strategy === 'A' ? a.retailA : a.retailB,
      materials_at_making: a.totalMaterials - (Number(otherCosts) || 0), labor_at_making: a.labor, other_costs_at_making: Number(otherCosts) || 0,
      strategy: strategy, multiplier: retailMultA, markup_b: markupB, user_id: user.id, notes: ''
    };
    const { data, error } = await supabase.from('inventory').insert([newItem]).select();
    if (!error && data) { setInventory([data[0], ...inventory]); setItemName(''); setMetalList([]); setHours(''); setRate(''); setOtherCosts(''); setToken(null); }
  };

  // --- AUTH ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    let result = isSignUp ? await supabase.auth.signUp({ email, password, options: { data: { is_converted_from_anonymous: true } } }) : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) alert(result.error.message); else { setShowAuth(false); fetchInventory(); }
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) alert(error.message);
  };

  // --- LONG-TERM INVENTORY SEARCH & STATS ---
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [inventory, searchTerm]);

  const totalVaultValue = useMemo(() => {
    return inventory.reduce((acc, item) => {
      const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
      const labor = item.labor_at_making || 0;
      const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
      return acc + liveRetail;
    }, 0);
  }, [inventory, prices]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Vault Inventory Report', 14, 20);
    const tableData = filteredInventory.map(item => {
        const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
        const liveRetail = (current.totalMaterials + (item.labor_at_making || 0)) * (item.strategy === 'A' ? (item.multiplier || 3) : 2);
        return [item.name, `$${Number(item.wholesale).toFixed(2)}`, `$${Number(item.retail).toFixed(2)}`, `$${liveRetail.toFixed(2)}`, new Date(item.created_at).toLocaleDateString()];
    });
    autoTable(doc, { startY: 30, head: [['Item', 'W-sale', 'Retail (Orig)', 'Retail (Live)', 'Date']], body: tableData, headStyles: { fillColor: [45, 74, 34] } });
    doc.save('the-vault-report.pdf');
  };

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-10 text-slate-900 font-sans text-left">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white px-4 py-6 md:px-6 rounded-[2rem] border-2 shadow-sm gap-4 mb-6 relative border-[#A5BEAC]">
          <div className="flex flex-col items-center w-full md:w-auto">
            <h1 className="text-2xl font-black uppercase italic tracking-[0.1em] text-slate-900 leading-none">THE VAULT</h1>
            <a href="https://bearsilverandstone.com" target="_blank" rel="noopener noreferrer" className="text-[8px] font-black uppercase tracking-[0.12em] text-stone-400 mt-1 hover:text-[#A5BEAC] transition-colors cursor-pointer">BY BEAR SILVER AND STONE</a>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex items-center justify-center gap-2 order-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">{!user ? 'Vault Locked' : (user.is_anonymous ? 'Guest Mode' : `Vault: ${user.email?.split('@')[0]}`)}</p>
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-[#A5BEAC] animate-pulse' : 'bg-stone-300'}`}></div>
            </div>
            <div className="relative order-2">
              {(!user || user.is_anonymous) ? (
                <button onClick={() => setShowAuth(!showAuth)} className="text-[10px] font-black uppercase bg-slate-900 text-white px-8 py-3 rounded-xl hover:bg-[#A5BEAC] transition shadow-sm">Login / Sign Up</button>
              ) : (
                <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="text-[10px] font-black uppercase bg-stone-100 text-slate-900 px-8 py-3 rounded-xl hover:bg-stone-200 transition">Logout</button>
              )}
              {showAuth && (
                <div className="absolute right-0 mt-4 w-80 bg-white p-6 rounded-3xl border-2 border-[#A5BEAC] shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 mx-auto">
                  <button onClick={() => setShowAuth(false)} className="absolute top-4 right-4 text-stone-300 hover:text-[#A5BEAC] font-black text-sm">✕</button>
                  <h3 className="text-sm font-black uppercase mb-4 text-slate-900 text-center tracking-tight">Vault Access</h3>
                  <button onClick={loginWithGoogle} className="w-full flex items-center justify-center gap-3 bg-white border-2 border-stone-100 py-3 rounded-xl hover:bg-stone-50 transition mb-4 shadow-sm">
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-4 h-4" alt="G" />
                    <span className="text-[10px] font-black uppercase text-slate-700">Continue with Google</span>
                  </button>
                  <form onSubmit={handleAuth} className="space-y-3">
                    <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl text-sm" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type="password" placeholder="Password" className="w-full p-3 border rounded-xl text-sm" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="submit" className="w-full bg-[#A5BEAC] text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-slate-900 transition">Open Vault</button>
                  </form>
                  <div className="mt-6 text-center"><p onClick={() => setIsSignUp(!isSignUp)} className="text-[10px] font-black text-[#A5BEAC] cursor-pointer uppercase underline underline-offset-4">{isSignUp ? 'Login' : 'Sign up'}</p></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TICKER */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(prices).filter(([name]) => ['gold', 'silver', 'platinum', 'palladium'].includes(name)).map(([name, p]) => (
            <div key={name} className="bg-white p-4 rounded-xl border-l-4 border-[#A5BEAC] shadow-sm">
              <p className="text-[10px] font-black uppercase text-stone-400">{name}</p>
              <p className="text-xl font-bold">{p !== null ? `$${Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--.--"}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* CALCULATOR - STICKY POSITIONING */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-xl space-y-5 border-2 border-[#A5BEAC] lg:sticky lg:top-6">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">Jewelry Calculator</h2>
              <input placeholder="Product Name" className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:border-[#A5BEAC]" value={itemName} onChange={e => setItemName(e.target.value)} />
              <div className="p-4 bg-stone-50 rounded-2xl border-2 border-dotted space-y-3">
                <select className="w-full p-3 border rounded-xl font-bold bg-white" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                  <option>Sterling Silver</option><option>10K Gold</option><option>14K Gold</option><option>18K Gold</option><option>22K Gold</option><option>24K Gold</option><option>Platinum 950</option><option>Palladium</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" placeholder="Weight" className="w-full p-3 border rounded-xl" value={tempWeight || ''} onChange={e => setTempWeight(Number(e.target.value))} />
                  <select className="p-3 border rounded-xl text-[10px] font-bold" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>{Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}</select>
                </div>
                <div className="space-y-2">
                  <select className="w-full p-3 border rounded-xl text-[10px] font-bold bg-white" value={useManualPrice ? "manual" : "spot"} onChange={(e) => setUseManualPrice(e.target.value === "manual")}>
                    <option value="spot">Use Live Spot Price</option><option value="manual">Use Manual Input</option>
                  </select>
                  {useManualPrice && <input type="number" placeholder={`Price per ${tempUnit}`} className="w-full p-3 border border-[#A5BEAC] rounded-xl text-sm" value={manualPriceInput} onChange={(e) => setManualPriceInput(e.target.value === '' ? '' : Number(e.target.value))} />}
                </div>
                <button onClick={addMetalToPiece} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#A5BEAC] transition-colors">+ Add Component</button>
                {metalList.map((m, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border border-stone-100 flex justify-between items-center">
                    <span className="text-slate-700">{m.weight}{m.unit} {m.type}</span>
                    <button onClick={() => setMetalList(metalList.filter((_, idx) => idx !== i))} className="text-red-500">×</button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Labor $/hr" className="p-3 border border-stone-200 rounded-xl" value={rate} onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} />
                <input type="number" placeholder="Hours" className="p-3 border border-stone-200 rounded-xl" value={hours} onChange={e => setHours(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <input type="number" placeholder="Stones/Other Costs ($)" className="w-full p-3 border border-stone-200 rounded-xl" value={otherCosts} onChange={e => setOtherCosts(e.target.value === '' ? '' : Number(e.target.value))} />
              <div className="mt-4 flex flex-col items-center gap-4">
                <div className="w-full p-4 rounded-xl bg-stone-100 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-stone-200"><span className="text-stone-500 font-bold uppercase text-[10px]">Materials Total</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).totalMaterials.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center py-2"><span className="text-stone-500 font-bold uppercase text-[10px]">Labor Total ({hours || 0}h)</span><span className="font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).labor.toFixed(2)}</span></div>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-6 w-full">
                  <button onClick={() => setStrategy('A')} className={`group flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 rounded-[2rem] border-2 transition-all ${strategy === 'A' ? 'border-[#2d4a22] bg-stone-50 shadow-md' : 'border-stone-100 bg-white'}`}><div className="text-left mb-4 sm:mb-0"><p className="text-[10px] font-black opacity-40 uppercase">Retail A</p><p className="text-3xl font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).retailA.toFixed(2)}</p></div><div className="text-left sm:text-right space-y-2"><p className="text-[9px] font-bold text-stone-400 uppercase">Wholesale: M + L</p><div className="flex items-center sm:justify-end gap-2"><span className="text-[10px] font-black text-[#2d4a22] uppercase italic whitespace-nowrap">Retail: W ×</span><input type="number" className="w-12 bg-white border-2 border-[#2d4a22] rounded-xl text-xs font-black py-1.5 text-center outline-none" value={retailMultA} onChange={(e) => setRetailMultA(Number(e.target.value))} onClick={(e) => e.stopPropagation()} /></div></div></button>
                  <button onClick={() => setStrategy('B')} className={`group relative flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 rounded-[2rem] border-2 transition-all ${strategy === 'B' ? 'border-[#2d4a22] bg-stone-50 shadow-md' : 'border-stone-100 bg-white'}`}><div className="text-left mb-4 sm:mb-0"><p className="text-[10px] font-black opacity-40 uppercase">Retail B</p><p className="text-3xl font-black text-slate-900">${calculateFullBreakdown(metalList, hours, rate, otherCosts).retailB.toFixed(2)}</p></div><div className="flex flex-col items-start sm:items-end"><div className="flex items-center gap-1 text-[#2d4a22] italic font-black text-[10px] uppercase whitespace-nowrap"><span>Wholesale: (M ×</span><input type="number" className="w-12 bg-white border-2 border-[#2d4a22] rounded-xl text-xs font-black py-1.5 text-center outline-none" value={markupB} onChange={(e) => setMarkupB(Number(e.target.value))} onClick={(e) => e.stopPropagation()} /><span>) + L</span></div><p className="text-[9px] font-bold text-stone-400 uppercase mt-1">Retail: W × 2</p></div></button>
                </div>
                <button onClick={addToInventory} disabled={!token} className={`w-full py-5 rounded-[1.8rem] font-black uppercase tracking-[0.15em] text-sm transition-all ${!token ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-[#A5BEAC] text-white shadow-xl hover:bg-slate-900 active:scale-[0.97]'}`}>Save to Vault</button>
                {!token && <div className="w-full flex justify-center mt-4"><Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} onSuccess={(token) => setToken(token)} options={{ theme: 'light', appearance: 'interaction-only' }} /></div>}
              </div>
            </div>
          </div>

          {/* INVENTORY PANEL - SEARCHABLE & SCROLLABLE */}
          <div className="lg:col-span-7 space-y-4">
             {/* STATS & SEARCH HEADER */}
             <div className="bg-white p-6 rounded-[2rem] border-2 shadow-sm border-[#A5BEAC] space-y-4">
               <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">The Vault Inventory</h2>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{inventory.length} Pieces Stored</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-[#2d4a22] uppercase italic">Total Vault Value (Live)</p>
                    <p className="text-2xl font-black text-slate-900">${pricesLoaded ? totalVaultValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "--.--"}</p>
                  </div>
               </div>
               
               <div className="flex flex-col sm:flex-row gap-4">
                 <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 text-xs">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Search items by name..." 
                      className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl text-xs font-bold outline-none focus:border-[#A5BEAC] transition-all"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                 </div>
                 <button onClick={exportToPDF} disabled={inventory.length === 0} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#A5BEAC] transition-colors whitespace-nowrap">Export PDF</button>
               </div>
            </div>

            {/* SCROLLABLE ITEMS LIST */}
            <div className="space-y-4 overflow-y-auto max-h-[850px] pr-2 custom-scrollbar">
              {loading ? <div className="p-20 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">Opening Vault...</div> :
                filteredInventory.length === 0 ? <div className="bg-white p-12 rounded-[2rem] border-2 border-dotted border-stone-200 text-center text-stone-400 font-bold uppercase text-xs">{searchTerm ? "No matches found." : "Your vault is empty."}</div> :
                  filteredInventory.map(item => {
                    const current = calculateFullBreakdown(item.metals || [], 0, 0, item.other_costs_at_making || 0, item.multiplier, item.markup_b);
                    const labor = item.labor_at_making || 0;
                    const liveWholesale = item.strategy === 'A' ? current.wholesaleA + labor : current.wholesaleB;
                    const liveRetail = item.strategy === 'A' ? (current.totalMaterials + labor) * (item.multiplier || 3) : ((current.totalMaterials * (item.markup_b || 1.8)) + labor) * 2;
                    const priceDiff = liveRetail - item.retail;
                    const isUp = priceDiff >= 0;

                    return (
                      <div key={item.id} className="bg-white rounded-[2rem] border border-stone-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <div className="p-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 text-right sm:text-left">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-xl font-black text-slate-800 truncate">{item.name}</p>
                                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition-opacity duration-500 ${pricesLoaded ? 'opacity-100' : 'opacity-0'} ${isUp ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                    {isUp ? '▲' : '▼'} ${Math.abs(priceDiff).toFixed(2)}
                                </span>
                            </div>
                            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest leading-none mb-3">{new Date(item.created_at).toLocaleDateString()} | Strategy: {item.strategy}</p>
                            <button onClick={() => deleteInventoryItem(item.id, item.name)} className="text-[10px] font-black text-red-300 uppercase hover:text-red-600 transition-colors px-2 py-1 bg-stone-50 rounded-lg">[ Remove Piece ]</button>
                          </div>
                          <div className="flex flex-wrap items-center gap-8 xl:gap-12 shrink-0">
                                <div className="flex gap-6 border-r border-stone-100 pr-8">
                                    <div className="text-right">
                                        <p className="text-[8px] font-black text-stone-300 uppercase tracking-widest mb-1">Prev. Wholesale</p>
                                        <p className="text-sm font-bold text-stone-400">${Number(item.wholesale).toFixed(2)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] font-black text-stone-300 uppercase tracking-widest mb-1">Prev. Retail</p>
                                        <p className="text-sm font-bold text-stone-400">${Number(item.retail).toFixed(2)}</p>
                                    </div>
                                </div>
                                <div className="flex gap-8 items-center text-right">
                                    <div>
                                        <p className="text-[8px] font-black text-[#A5BEAC] uppercase tracking-widest mb-1">Live Wholesale</p>
                                        <p className={`text-lg font-black transition-all ${pricesLoaded ? 'text-slate-600' : 'text-stone-200'}`}>
                                            {pricesLoaded ? `$${liveWholesale.toFixed(2)}` : "--.--"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-[#2d4a22] uppercase tracking-widest mb-1 italic">Live Retail</p>
                                        <p className="text-3xl font-black text-slate-900 transition-all duration-300">
                                            {pricesLoaded ? `$${liveRetail.toFixed(2)}` : "--.--"}
                                        </p>
                                    </div>
                                </div>
                          </div>
                        </div>
                        <details className="group border-t border-stone-50">
                            <summary className="list-none cursor-pointer py-2 text-center text-[8px] font-black uppercase tracking-[0.2em] text-stone-300 hover:text-[#A5BEAC] transition-colors">Breakdown & Snapshot</summary>
                            <div className="p-6 bg-stone-50/50 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase text-stone-400">Metal Composition</h4>
                                        {item.metals?.map((m: any, idx: number) => (<div key={idx} className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1 uppercase"><span>{m.weight}{m.unit} {m.type}</span><span className="text-stone-400">{m.isManual ? 'Manual' : 'Spot'}</span></div>))}
                                        {item.other_costs_at_making > 0 && (<div className="flex justify-between text-[10px] font-bold border-b border-stone-100 pb-1 uppercase"><span>Stones/Other</span><span>${Number(item.other_costs_at_making).toFixed(2)}</span></div>)}
                                    </div>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-2 text-center">
                                            <div className="bg-white p-3 rounded-xl border border-stone-100"><p className="text-[8px] font-black text-stone-400 uppercase">Materials (Orig)</p><p className="text-xs font-black text-slate-700">${(Number(item.materials_at_making || 0) + Number(item.other_costs_at_making || 0)).toFixed(2)}</p></div>
                                            <div className="bg-white p-3 rounded-xl border border-stone-100"><p className="text-[8px] font-black text-stone-400 uppercase">Labor Cost</p><p className="text-xs font-black text-slate-700">${Number(labor).toFixed(2)}</p></div>
                                        </div>
                                        <button onClick={() => syncToMarket(item)} className="w-full py-2 bg-[#2d4a22] text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 transition-all shadow-sm">Sync Vault to Market</button>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-stone-200 text-left">
                                  <h4 className="text-[9px] font-black uppercase text-stone-400 mb-2">Vault Notes</h4>
                                  <textarea className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-xs italic text-slate-600 resize-none h-20 outline-none focus:border-[#A5BEAC] transition-all" placeholder="Add notes..." defaultValue={item.notes || ''} onBlur={(e) => saveNote(item.id, e.target.value)} />
                                </div>
                            </div>
                        </details>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>

        {/* BOTTOM DETAIL SECTIONS */}
        <div className="grid grid-cols-1 gap-6 pt-10 text-left">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-900 underline decoration-[#A5BEAC] decoration-4 underline-offset-8">1. MATERIAL CALCULATION DETAIL</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 text-left">
              <div className="space-y-6">
                <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100"><h3 className="text-xs font-black text-[#A5BEAC] uppercase tracking-widest mb-4">THE LOGIC</h3><div className="font-mono text-sm space-y-2 bg-white p-4 rounded-xl border border-stone-100 text-center"><p className="text-slate-900 font-bold">Cost = (Spot ÷ 31.1035) × Grams × Purity</p></div></div>
                <p className="text-xs text-stone-600 leading-relaxed italic">Spot prices are quoted per Troy Ounce. We divide by 31.1035 to get the price per gram, then multiply by the specific metal purity.</p>
              </div>
              <div className="bg-stone-50 p-6 rounded-2xl space-y-3 border border-stone-100"><h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">PURITY CONSTANTS:</h3><div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-stone-400"><p>24K Gold: 99.9%</p><p>22K Gold: 91.6%</p><p>18K Gold: 75.0%</p><p>14K Gold: 58.3%</p><p>10K Gold: 41.7%</p><p>Sterling Silver: 92.5%</p><p>Plat 950: 95.0%</p><p>Palladium: 95.0%</p></div></div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-900 underline decoration-[#A5BEAC] decoration-4 underline-offset-8">2. PRICE STRATEGY DETAIL</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className={`p-6 rounded-2xl border-2 border-stone-100 bg-stone-50 transition-all`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY A (STANDARD MULTIPLIER)</h3>
                <div className="space-y-2 text-xs text-stone-700">
                  <p><strong className="text-slate-900">Wholesale:</strong> Materials + Labor</p>
                  <p><strong className="text-slate-900">Retail:</strong> Wholesale × {retailMultA}</p>
                </div>
              </div>
              <div className={`p-6 rounded-2xl border-2 border-stone-100 bg-stone-50 transition-all`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY B (MATERIALS MARKUP)</h3>
                <div className="space-y-2 text-xs text-stone-700">
                  <p><strong className="text-slate-900">Wholesale:</strong> (Materials × {markupB}) + Labor</p>
                  <p><strong className="text-slate-900">Retail:</strong> Wholesale × 2</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 py-8 border-t border-stone-200 mt-10">
            <a href="https://bearsilverandstone.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Powered by</span>
              <img src="/icon.png" alt="Bear Silver and Stone" className="w-6 h-6 object-contain" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Bear Silver and Stone</span>
            </a>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #A5BEAC;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #2d4a22;
        }
      `}</style>
    </div>
  );
}