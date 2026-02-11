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

  const a = calculateFullBreakdown(metalList, hours, rate, otherCosts);
  const b = a;
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
    <div className="min-h-screen bg-stone-50 p-4 md:p-10 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER - Updated with Outline */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white px-4 py-6 md:px-6 rounded-[2rem] border-2 shadow-sm gap-4 mb-6 relative" style={{ borderColor: '#A5BEAC' }}>
          <div className="flex flex-col items-center w-full md:w-auto">
            <div className="flex flex-col items-center leading-none">
              <h1 className="text-2xl font-black uppercase italic tracking-[0.1em] text-slate-900 leading-none ml-[0.1em]">
                THE VAULT
              </h1>
              <a href="https://bearsilverandstone.com" target="_blank" rel="noopener noreferrer" className="text-[8px] font-black uppercase tracking-[0.12em] text-stone-400 mt-1 whitespace-nowrap hover:text-[#A5BEAC] transition-colors cursor-pointer">
                BY BEAR SILVER AND STONE
              </a>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex items-center justify-center gap-2 w-full md:w-auto order-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                {!user ? 'Vault Locked' : (user.is_anonymous ? 'Guest' : `User: ${user.email?.split('@')[0]}`)}
              </p>
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-[#A5BEAC] animate-pulse' : 'bg-stone-300'}`}></div>
            </div>

            <div className="relative w-full md:w-auto order-2">
              {(!user || user.is_anonymous) ? (
                <button onClick={() => setShowAuth(!showAuth)} className="w-full md:w-auto text-[10px] font-black uppercase bg-slate-900 text-white px-8 py-3 rounded-xl hover:bg-[#A5BEAC] transition shadow-sm">
                  Login / Sign Up
                </button>
              ) : (
                <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="w-full md:w-auto text-[10px] font-black uppercase bg-stone-100 text-slate-900 px-8 py-3 rounded-xl hover:bg-stone-200 transition">
                  Logout
                </button>
              )}

              {showAuth && (
                <div className="absolute left-0 right-0 md:left-auto md:right-0 mt-4 w-full md:w-80 bg-white p-6 rounded-3xl border-2 border-[#A5BEAC] shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 mx-auto">
                  <h3 className="text-sm font-black uppercase mb-4 text-slate-900 text-center tracking-tight">Vault Access</h3>
                  <button onClick={loginWithGoogle} className="w-full flex items-center justify-center gap-3 bg-white border-2 border-stone-100 py-3 rounded-xl hover:bg-stone-50 transition mb-4 shadow-sm">
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-4 h-4" alt="G" />
                    <span className="text-[10px] font-black uppercase text-slate-700">Continue with Google</span>
                  </button>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-[1px] bg-stone-100 flex-1"></div>
                    <span className="text-[9px] font-bold text-stone-300 uppercase">OR</span>
                    <div className="h-[1px] bg-stone-100 flex-1"></div>
                  </div>
                  <form onSubmit={handleAuth} className="space-y-3">
                    <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl text-sm outline-none focus:border-[#A5BEAC] transition" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type="password" placeholder="Password" className="w-full p-3 border rounded-xl text-sm outline-none focus:border-[#A5BEAC] transition" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="submit" className="w-full bg-[#A5BEAC] text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-slate-900 transition shadow-md">
                      {isSignUp ? 'Create Vault Account' : 'Open The Vault'}
                    </button>
                  </form>
                  <div className="mt-6 text-center">
                    <p onClick={() => setIsSignUp(!isSignUp)} className="text-[10px] font-black text-[#A5BEAC] cursor-pointer uppercase tracking-wider hover:text-slate-900 transition underline underline-offset-4">
                      {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign up'}
                    </p>
                  </div>
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
              <div key={name} className="bg-white p-4 rounded-xl border-l-4 border-[#A5BEAC] shadow-sm text-center lg:text-left">
                <p className="text-[10px] font-black uppercase text-stone-400">{name}</p>
                <p className="text-xl font-bold">{p !== null ? `$${Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--.--"}</p>
              </div>
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            {/* JEWELRY CALCULATOR BOX - Updated with Outline */}
            <div className="bg-white p-8 rounded-[2rem] shadow-xl space-y-5 border-2" style={{ borderColor: '#A5BEAC' }}>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Jewelry Calculator</h2>
              <input placeholder="Product Name" className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:border-[#A5BEAC] transition-all" value={itemName} onChange={e => setItemName(e.target.value)} />
              <div className="p-4 bg-stone-50 rounded-2xl border-2 border-dotted border-stone-300 space-y-3">
                <select className="w-full p-3 border border-stone-200 rounded-xl font-bold bg-white focus:border-[#A5BEAC]" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                  <option>Sterling Silver</option><option>10K Gold</option><option>14K Gold</option><option>18K Gold</option><option>22K Gold</option><option>24K Gold</option><option>Platinum 950</option><option>Palladium</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" placeholder="Weight" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#A5BEAC]" value={tempWeight || ''} onChange={e => setTempWeight(Number(e.target.value))} />
                  <select className="p-3 border border-stone-200 rounded-xl text-[10px] font-bold focus:border-[#A5BEAC]" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>
                    {Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}
                  </select>
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
                <input type="number" placeholder="Labor $/hr" className="p-3 border border-stone-200 rounded-xl focus:border-[#A5BEAC]" value={rate} onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} />
                <input type="number" placeholder="Hours" className="p-3 border border-stone-200 rounded-xl focus:border-[#A5BEAC]" value={hours} onChange={e => setHours(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <input type="number" placeholder="Stones/Other Costs ($)" className="w-full p-3 border border-stone-200 rounded-xl focus:border-[#A5BEAC]" value={otherCosts} onChange={e => setOtherCosts(e.target.value === '' ? '' : Number(e.target.value))} />

              <div className="mt-4 flex flex-col items-center gap-4">
                <div className="w-full p-4 rounded-xl bg-stone-100 border border-stone-200 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-stone-200">
                    <span className="text-stone-500 font-bold uppercase text-[10px]">Materials Total</span>
                    <span className="font-black text-slate-900">${b.totalMaterials.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-stone-500 font-bold uppercase text-[10px]">Labor Total ({hours || 0}h)</span>
                    <span className="font-black text-slate-900">${b.labor.toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 mb-6 w-full">
                  {/* STRATEGY A */}
                  <button
                    onClick={() => setStrategy('A')}
                    className={`group flex items-center justify-between p-5 rounded-[2rem] border-2 transition-all ${strategy === 'A' ? 'border-[#A5BEAC] bg-stone-50 shadow-md' : 'border-stone-100 bg-white hover:border-stone-200'
                      }`}
                  >
                    <div className="text-left">
                      <p className="text-[10px] font-black opacity-40 uppercase tracking-tighter mb-1 text-slate-900">Strategy A</p>
                      <p className="text-3xl font-black text-slate-900">
                        ${a?.retailA ? a.retailA.toFixed(2) : '0.00'}
                      </p>
                    </div>

                    <div className="text-right space-y-2">
                      <p className="text-[9px] font-bold text-stone-400 uppercase">Wholesale: M + L</p>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] font-black text-[#A5BEAC] uppercase italic">Retail: W ×</span>
                        <input
                          type="number"
                          className="w-12 bg-white border-2 border-[#A5BEAC] rounded-xl text-xs font-black text-[#A5BEAC] py-1.5 text-center outline-none focus:ring-2 focus:ring-[#A5BEAC]/20"
                          value={retailMultA}
                          onChange={(e) => setRetailMultA(Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </button>

                  {/* STRATEGY B */}
                  <button
                    onClick={() => setStrategy('B')}
                    className={`group relative flex items-center justify-between p-5 rounded-[2rem] border-2 transition-all ${strategy === 'B' ? 'border-[#A5BEAC] bg-stone-50 shadow-md' : 'border-stone-100 bg-white hover:border-stone-200'
                      }`}
                  >
                    <div className="text-left">
                      <p className="text-[10px] font-black opacity-40 uppercase tracking-tighter mb-1 text-slate-900">Strategy B</p>
                      <p className="text-3xl font-black text-slate-900">
                        ${b?.retailB ? b.retailB.toFixed(2) : '0.00'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <div className="flex items-center gap-1 text-[#A5BEAC] italic font-black text-[10px] uppercase">
                        <span className="whitespace-nowrap">Wholesale: (M ×</span>
                        <input
                          type="number"
                          className="w-10 bg-white border-2 border-[#A5BEAC] rounded-xl text-xs font-black py-1 text-center outline-none focus:ring-2 focus:ring-[#A5BEAC]/20"
                          value={markupB}
                          onChange={(e) => setMarkupB(Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="whitespace-nowrap">) + L</span>
                      </div>
                      <p className="text-[9px] font-bold text-stone-400 uppercase mt-1">Retail: W × 2</p>
                    </div>
                  </button>
                </div>

                {/* UNIFIED SAVE TO VAULT SECTION */}
                <div className="w-full flex flex-col items-center transition-all duration-300">
                  <button
                    onClick={addToInventory}
                    disabled={!token}
                    className={`w-full py-5 rounded-[1.8rem] font-black uppercase tracking-[0.15em] text-sm transition-all ${!token
                        ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                        : 'bg-[#A5BEAC] text-white shadow-xl shadow-[#A5BEAC]/30 hover:bg-slate-900 active:scale-[0.97]'
                      }`}
                  >
                    {token ? "Save to Vault" : "Verifying Human..."}
                  </button>

                  {!token && (
                    <div className="w-full flex justify-center mt-4 h-auto overflow-hidden animate-in fade-in slide-in-from-top-1">
                      <Turnstile
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                        onSuccess={(token) => setToken(token)}
                        options={{ theme: 'light', appearance: 'interaction-only' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            {/* SAVED PIECES BOX - Updated with Outline */}
            <div className="flex justify-between items-center bg-white px-6 py-4 rounded-2xl border-2 shadow-sm" style={{ borderColor: '#A5BEAC' }}>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">Saved Pieces</h2>
              <button onClick={exportToPDF} disabled={inventory.length === 0} className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#A5BEAC] transition-colors">Export PDF</button>
            </div>
            <div className="space-y-4">
              {loading ? <div className="p-20 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">Opening Vault...</div> :
                inventory.length === 0 ? <div className="bg-white p-12 rounded-[2rem] border-2 border-dotted border-stone-200 text-center text-stone-400 font-bold uppercase text-xs">Your vault is empty.</div> :
                  inventory.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm flex justify-between items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <p className="text-xl font-black text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{new Date(item.created_at).toLocaleDateString()}</p>
                        <button onClick={() => deleteInventoryItem(item.id)} className="text-[9px] font-black text-red-300 uppercase hover:text-red-600 transition-colors mt-2">[ Remove ]</button>
                      </div>
                      <div className="flex gap-8 text-right">
                        <div>
                          <p className="text-[9px] font-black text-stone-400 uppercase">Wholesale</p>
                          <p className="text-lg font-black text-slate-600">${Number(item.wholesale).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-[#A5BEAC] uppercase italic">Retail</p>
                          <p className="text-3xl font-black text-slate-900">${Number(item.retail).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 pt-10">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-900 underline decoration-[#A5BEAC] decoration-4 underline-offset-8">
              1. MATERIAL CALCULATION DETAIL
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                  <h3 className="text-xs font-black text-[#A5BEAC] uppercase tracking-widest mb-4">THE LOGIC</h3>
                  <div className="font-mono text-sm space-y-2 bg-white p-4 rounded-xl border border-stone-100 text-center">
                    <p className="text-slate-900 font-bold">Cost = (Spot ÷ 31.1035) × Grams × Purity</p>
                  </div>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed italic">
                  Spot prices are quoted per Troy Ounce. We divide by 31.1035 to get the price per gram, then multiply by the specific metal purity.
                </p>
              </div>
              <div className="bg-stone-50 p-6 rounded-2xl space-y-3 border border-stone-100">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">PURITY CONSTANTS:</h3>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-stone-400">
                  <p>24K Gold: 99.9%</p><p>22K Gold: 91.6%</p>
                  <p>18K Gold: 75.0%</p><p>14K Gold: 58.3%</p>
                  <p>10K Gold: 41.7%</p><p>Sterling Silver: 92.5%</p>
                  <p>Plat 950: 95.0%</p><p>Palladium: 95.0%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-900 underline decoration-[#A5BEAC] decoration-4 underline-offset-8">
              2. PRICE STRATEGY DETAIL
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className={`p-6 rounded-2xl border-2 transition-all ${strategy === 'A' ? 'border-[#A5BEAC] bg-stone-50' : 'bg-stone-50 border-stone-100'}`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY A (STANDARD MULTIPLIER)</h3>
                <div className="space-y-2 text-xs text-stone-700">
                  <p><strong className="text-slate-900">Wholesale:</strong> Materials + Labor</p>
                  <p><strong className="text-slate-900">Retail:</strong> Wholesale × {retailMultA}</p>
                  <div className="mt-4 p-3 bg-white/50 rounded-xl border border-stone-100">
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      <span className="font-black text-[#A5BEAC] uppercase text-[8px] block mb-1">Industry Standard:</span>
                      Standard industry retail markup is typically 2.0 to 3.0 times the wholesale cost.
                    </p>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-2xl border-2 transition-all ${strategy === 'B' ? 'border-[#A5BEAC] bg-stone-50' : 'bg-stone-50 border-stone-100'}`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY B (MATERIALS MARKUP)</h3>
                <div className="space-y-2 text-xs text-stone-700">
                  <p><strong className="text-slate-900">Wholesale:</strong> (Materials × {markupB}) + Labor</p>
                  <p><strong className="text-slate-900">Retail:</strong> Wholesale × 2</p>
                  <div className="mt-4 p-3 bg-white/50 rounded-xl border border-stone-100">
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      <span className="font-black text-[#A5BEAC] uppercase text-[8px] block mb-1">Industry Standard:</span>
                      A production markup of 1.5 to 1.8 is standard to account for metal loss, consumables, and market volatility.
                    </p>
                  </div>
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
    </div>
  );
}