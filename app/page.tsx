"use client";
import { useState, useEffect } from 'react';
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
  const [metalList, setMetalList] = useState<{ type: string, weight: number, unit: string }[]>([]);
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [tempMetal, setTempMetal] = useState('Sterling Silver');
  const [tempWeight, setTempWeight] = useState(0);
  const [tempUnit, setTempUnit] = useState('Ounces (std)');
  const [token, setToken] = useState<string | null>(null);
  const [hours, setHours] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [otherCosts, setOtherCosts] = useState<number | ''>('');
  const [strategy, setStrategy] = useState<'A' | 'B'>('A');
  const [retailMultA, setRetailMultA] = useState(3);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
        if (priceData.gold) setPrices(priceData);
      } catch (e) {
        console.error("Price fetch failed", e);
      }
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
    const currentUserId = session?.user?.id;
    if (!currentUserId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from('inventory')
      .select('*')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false });
    if (!error && data) setInventory(data);
    setLoading(false);
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    let result;
    if (isSignUp) {
      result = await supabase.auth.signUp({ email, password, options: { data: { is_converted_from_anonymous: true } } });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }
    if (result.error) alert(result.error.message);
    else {
      alert(isSignUp ? "Account created! Check email for verification." : "Logged in!");
      setShowAuth(false);
      fetchInventory();
    }
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) alert(error.message);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) alert(error.message);
    else setResetSent(true);
  };

  const calculateFullBreakdown = (metals: any[], h: any, r: any, o: any) => {
    let rawMaterialCost = 0;
    const numH = Number(h) || 0;
    const numR = Number(r) || 0;
    const numO = Number(o) || 0;
    metals.forEach(m => {
      let spot = 0;
      if (m.type.includes('Gold')) spot = prices.gold;
      else if (m.type.includes('Silver')) spot = prices.silver;
      else if (m.type.includes('Platinum')) spot = prices.platinum;
      else if (m.type.includes('Palladium')) spot = prices.palladium;
      const purities: any = {
        '10K Gold': 0.417, '14K Gold': 0.583, '18K Gold': 0.750,
        '22K Gold': 0.916, '24K Gold': 0.999, 'Sterling Silver': 0.925,
        'Platinum 950': 0.950, 'Palladium': 0.950
      };
      const purity = purities[m.type] || 1.0;
      rawMaterialCost += (spot / 31.1035) * (m.weight * UNIT_TO_GRAMS[m.unit]) * purity;
    });
    const totalMaterials = rawMaterialCost + numO;
    const labor = numH * numR;
    const wholesaleA = totalMaterials + labor;
    const retailA = wholesaleA * retailMultA;
    const wholesaleB = (totalMaterials * markupB) + labor;
    const retailB = wholesaleB * 2;
    return { wholesaleA, retailA, wholesaleB, retailB, totalMaterials, labor };
  };

  const b = calculateFullBreakdown(metalList, hours, rate, otherCosts);
  const activeRetail = strategy === 'A' ? b.retailA : b.retailB;
  const activeWholesale = strategy === 'A' ? b.wholesaleA : b.wholesaleB;

  const addMetalToPiece = () => {
    if (tempWeight <= 0) return;
    setMetalList([...metalList, { type: tempMetal, weight: tempWeight, unit: tempUnit }]);
    setTempWeight(0);
  };

  const deleteInventoryItem = async (id: string) => {
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (!error) setInventory(inventory.filter(item => item.id !== id));
  };

  const addToInventory = async () => {
    if (!token) return alert("Please verify you are human first!");
    if (!itemName || metalList.length === 0) return alert("Missing info");
    if (!user) return alert("Session not ready");
    const newItem = {
      name: itemName,
      metals: metalList,
      wholesale: activeWholesale,
      retail: activeRetail,
      strategy: strategy,
      multiplier: retailMultA,
      user_id: user.id
    };
    const { data, error } = await supabase.from('inventory').insert([newItem]).select();
    if (error) {
      console.error("DB Error:", error);
      alert(error.message);
    } else if (data) {
      setInventory([data[0], ...inventory]);
      setItemName('');
      setMetalList([]);
      setHours('');
      setRate('');
      setOtherCosts('');
      setToken(null);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Inventory Report', 14, 20);
    const tableData = inventory.map(item => [item.name, `$${Number(item.wholesale).toFixed(2)}`, `$${Number(item.retail).toFixed(2)}`, new Date(item.created_at).toLocaleDateString()]);
    autoTable(doc, { startY: 30, head: [['Item', 'Wholesale', 'Retail', 'Date']], body: tableData });
    doc.save('inventory.pdf');
  };

  return (
    
    <div className="min-h-screen bg-slate-100 p-4 md:p-10 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
<div className="flex flex-col md:flex-row justify-between items-center bg-white px-4 py-4 md:px-6 rounded-[2rem] border shadow-sm gap-4 mb-6">
  
  {/* LEFT: THE VAULT BRANDING */}
  <div className="flex items-center gap-2 md:order-1">
    <img 
      src="/icon.png" 
      alt="Bear Silver and Stone" 
      className="w-6 h-6 object-contain"
    />
    <div className="flex flex-col items-start leading-none">
      <h1 className="text-xl font-black uppercase italic tracking-tighter text-slate-900">
        The Vault
      </h1>
      <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400">
        by Bear Silver and Stone
      </span>
    </div>
  </div>

  {/* RIGHT: STATUS & AUTH SECTION */}
  <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto md:order-2">
    
    {/* STATUS (GUEST/USER) - Switched to right side */}
    <div className="flex items-center gap-2 order-1 md:order-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {!user ? 'Vault Locked' : (user.is_anonymous ? 'Guest' : `User: ${user.email?.split('@')[0]}`)}
      </p>
      <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
    </div>

    {/* AUTH BUTTON */}
    <div className="relative w-full md:w-auto order-2 md:order-2">
      {(!user || user.is_anonymous) ? (
        <button 
          onClick={() => setShowAuth(!showAuth)} 
          className="w-full md:w-auto text-[10px] font-black uppercase bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition shadow-sm"
        >
          Login / Sign Up
        </button>
      ) : (
        <button 
          onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} 
          className="w-full md:w-auto text-[10px] font-black uppercase bg-slate-100 px-6 py-2.5 rounded-xl hover:bg-slate-200 transition"
        >
          Logout
        </button>
      )}

      {/* AUTH DROPDOWN */}
      {showAuth && (
        <div className="absolute right-0 left-0 md:left-auto mt-4 w-full md:w-80 bg-white p-6 rounded-3xl border-2 border-blue-600 shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2">
          {/* ... Your existing Auth form logic ... */}
        </div>
      )}
    </div>
  </div>
</div>

        {/* TICKER */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(prices)
            .filter(([name]) => !['success', 'updated_at', 'lastUpdated', 'id'].includes(name))
            .map(([name, p]) => (
              <div key={name} className="bg-white p-4 rounded-xl border-l-4 border-blue-600 shadow-sm text-center lg:text-left">
                <p className="text-[10px] font-black uppercase text-slate-400">{name}</p>
                <p className="text-xl font-bold">{p !== null ? `$${Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--.--"}</p>
              </div>
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-xl space-y-5">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">Jewelry Calculator</h2>
              <input placeholder="Product Name" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" value={itemName} onChange={e => setItemName(e.target.value)} />
              <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dotted border-slate-300 space-y-3">
                <select className="w-full p-3 border rounded-xl font-bold bg-white" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                  <option>Sterling Silver</option><option>10K Gold</option><option>14K Gold</option><option>18K Gold</option><option>22K Gold</option><option>24K Gold</option><option>Platinum 950</option><option>Palladium</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" placeholder="Weight" className="w-full p-3 border rounded-xl" value={tempWeight || ''} onChange={e => setTempWeight(Number(e.target.value))} />
                  <select className="p-3 border rounded-xl text-[10px] font-bold" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>
                    {Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <button onClick={addMetalToPiece} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest">+ Add Component</button>
                {metalList.map((m, i) => (
                  <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border flex justify-between items-center">
                    <span>{m.weight}{m.unit} {m.type}</span>
                    <button onClick={() => setMetalList(metalList.filter((_, idx) => idx !== i))} className="text-red-500 text-lg">×</button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Labor $/hr" className="p-3 border rounded-xl" value={rate} onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} />
                <input type="number" placeholder="Hours" className="p-3 border rounded-xl" value={hours} onChange={e => setHours(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <input type="number" placeholder="Stones/Other Costs ($)" className="w-full p-3 border rounded-xl" value={otherCosts} onChange={e => setOtherCosts(e.target.value === '' ? '' : Number(e.target.value))} />

              <div className="mt-4 flex flex-col items-center gap-4">
                <div className="w-full p-4 rounded-xl bg-stone-100 border border-stone-200 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-stone-200">
                    <span className="text-stone-600">Materials Total</span>
                    <span className="font-medium text-stone-800">${b.totalMaterials.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-stone-600">Labor Total ({hours || 0}h @ ${rate || 0}/hr)</span>
                    <span className="font-medium text-stone-800">${b.labor.toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-stretch w-full">
                  <button onClick={() => setStrategy('A')} className={`flex flex-col p-4 rounded-2xl border-2 text-left ${strategy === 'A' ? 'border-blue-600 bg-blue-50' : 'border-slate-100'}`}>
                    <p className="text-[10px] font-black opacity-50 uppercase tracking-tighter mb-1">Strategy A</p>
                    <p className="text-xl font-black mb-3">${b.retailA.toFixed(2)}</p>
                    <div className="mt-auto space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Wholesale: Materials + Labor</p>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Retail: Wholesale ×</span>
                        <input type="number" step="0.1" className="w-10 bg-white border rounded text-[10px] font-black text-blue-600 px-1" value={retailMultA} onChange={(e) => setRetailMultA(Number(e.target.value))} onClick={(e) => e.stopPropagation()} />
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setStrategy('B')}
                    className={`flex flex-col p-4 rounded-2xl border-2 text-left ${strategy === 'B' ? 'border-blue-600 bg-blue-50' : 'border-slate-100'}`}
                  >
                    <p className="text-[10px] font-black opacity-50 uppercase tracking-tighter mb-1">Strategy B</p>
                    <p className="text-xl font-black mb-3">${b.retailB.toFixed(2)}</p>
                    <div className="mt-auto space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold text-blue-600 uppercase italic">Wholesale: (M ×</span>
                        <input
                          type="number"
                          step="0.1"
                          className="w-10 bg-white border rounded text-[10px] font-black text-blue-600 px-1"
                          value={markupB}
                          onChange={(e) => setMarkupB(Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[8px] font-bold text-blue-600 uppercase italic">) + L</span>
                      </div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">Retail: Wholesale × 2</p>
                    </div>
                  </button>
                </div>

                {/* THE SINGLE AUTO-EXPANDING CONTAINER */}
                <div className="bg-stone-50 p-4 rounded-2xl w-full flex flex-col items-center border transition-all duration-300">
                  <button
                    onClick={addToInventory}
                    disabled={!token}
                    className={`w-full p-4 rounded-xl font-black uppercase transition-all shadow-md ${!token ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'}`}
                  >
                    {token ? "Save to Vault" : "Verifying Human..."}
                  </button>
                  <div className={`w-full flex justify-center h-auto overflow-hidden ${!token ? 'mt-4' : 'mt-0'}`}>
                    <Turnstile
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                      onSuccess={(token) => setToken(token)}
                      options={{ theme: 'light', appearance: 'interaction-only' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="flex justify-between items-center bg-white px-6 py-4 rounded-2xl border shadow-sm">
              <h2 className="text-lg font-black uppercase tracking-tight">Saved Pieces</h2>
              <button onClick={exportToPDF} disabled={inventory.length === 0} className="px-6 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase">Export PDF</button>
            </div>
            <div className="space-y-4">
              {loading ? <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Opening Vault...</div> :
                inventory.length === 0 ? <div className="bg-white p-12 rounded-[2rem] border-2 border-dotted text-center text-slate-400 font-bold uppercase text-xs">Your vault is empty.</div> :
                  inventory.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-[2rem] border shadow-sm flex justify-between items-center gap-4">
                      <div className="flex-1">
                        <p className="text-xl font-black text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(item.created_at).toLocaleDateString()}</p>
                        <button onClick={() => deleteInventoryItem(item.id)} className="text-[9px] font-black text-red-300 uppercase hover:text-red-600">[ Remove ]</button>
                      </div>
                      <div className="flex gap-8 text-right">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">Wholesale</p>
                          <p className="text-lg font-black text-slate-600">${Number(item.wholesale).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-blue-600 uppercase italic">Retail</p>
                          <p className="text-3xl font-black text-slate-900">${Number(item.retail).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* EXPLANATION BOXES */}
        <div className="grid grid-cols-1 gap-6 pt-10">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-800 underline decoration-blue-500 decoration-4 underline-offset-8">
              1. MATERIAL CALCULATION DETAIL
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-4">THE LOGIC</h3>
                  <div className="font-mono text-sm space-y-2 bg-white p-4 rounded-xl border border-slate-200 text-center">
                    <p className="text-blue-900 font-bold">Cost = (Spot ÷ 31.1035) × Grams × Purity</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed italic">
                  Spot prices are quoted per Troy Ounce. We divide by 31.1035 to get the price per gram, then multiply by the specific metal purity.
                </p>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">PURITY CONSTANTS:</h3>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
                  <p>24K Gold: 99.9%</p><p>22K Gold: 91.6%</p>
                  <p>18K Gold: 75.0%</p><p>14K Gold: 58.3%</p>
                  <p>10K Gold: 41.7%</p><p>Sterling Silver: 92.5%</p>
                  <p>Plat 950: 95.0%</p><p>Palladium: 95.0%</p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. PRICE STRATEGY DETAIL */}
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-800 underline decoration-blue-500 decoration-4 underline-offset-8">
              2. PRICE STRATEGY DETAIL
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* STRATEGY A DETAIL */}
              <div className={`p-6 rounded-2xl border-2 transition-all ${strategy === 'A' ? 'border-blue-600 bg-blue-50' : 'bg-slate-50 border-transparent'}`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY A (STANDARD MULTIPLIER)</h3>
                <div className="space-y-2 text-xs text-slate-700">
                  <p><strong>Wholesale:</strong> Materials + Labor</p>
                  <p><strong>Retail:</strong> Wholesale × {retailMultA}</p>

                  {/* Added Industry Benchmark Text */}
                  <div className="mt-4 p-3 bg-white/50 rounded-xl border border-blue-100">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      <span className="font-black text-blue-600 uppercase text-[8px] block mb-1">Industry Standard:</span>
                      Standard industry retail markup is typically 2.0 to 3.0 times the wholesale cost.
                    </p>
                  </div>
                </div>
              </div>

              {/* STRATEGY B DETAIL */}
              <div className={`p-6 rounded-2xl border-2 transition-all ${strategy === 'B' ? 'border-blue-600 bg-blue-50' : 'bg-slate-50 border-transparent'}`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY B (MATERIALS MARKUP)</h3>
                <div className="space-y-2 text-xs text-slate-700">
                  <p><strong>Wholesale:</strong> (Materials × {markupB}) + Labor</p>
                  <p><strong>Retail:</strong> Wholesale × 2</p>

                  {/* Added Industry Benchmark Text */}
                  <div className="mt-4 p-3 bg-white/50 rounded-xl border border-blue-100">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      <span className="font-black text-blue-600 uppercase text-[8px] block mb-1">Industry Standard:</span>
                      A production markup of 1.5 to 1.8 is standard to account for metal loss, consumables, and market volatility.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
          {/* FOOTER LOGO SECTION */}
          <div className="flex flex-col items-center justify-center gap-2 py-8 border-t border-slate-200 mt-10">
            <a
              href="https://bearsilverandstone.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Powered by
              </span>
              <img
                src="/icon.png"
                alt="Bear Silver and Stone"
                className="w-6 h-6 object-contain"
              />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">
                Bear Silver and Stone
              </span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}