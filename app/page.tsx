"use client";
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// FIXED IMPORT: Added the extra dot to reach the lib folder correctly
import { supabase } from '../lib/supabase';

const UNIT_TO_GRAMS: { [key: string]: number } = {
  "Grams": 1,
  "Pennyweights (dwt)": 1.55517,
  "Troy Ounces": 31.1035,
  "Ounces (std)": 28.3495
};

export default function Home() {
  const [prices, setPrices] = useState({ gold: 0, silver: 0, platinum: 0, palladium: 0, lastUpdated: null });
  const [itemName, setItemName] = useState('');
  const [metalList, setMetalList] = useState<{ type: string, weight: number, unit: string }[]>([]);

  const [tempMetal, setTempMetal] = useState('Sterling Silver');
  const [tempWeight, setTempWeight] = useState(0);
  const [tempUnit, setTempUnit] = useState('Grams');

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
    const { data, error } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
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

  const handleResetPassword = async () => {
    if (!email || email.trim() === "") {
      alert("Please type your email address into the Email field first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) alert(error.message);
    else alert(`Success! Reset link sent to ${email}.`);
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

    // STRATEGY A (Matches Screenshot): Wholesale = Mat + Labor | Retail = Whol * 3
    const wholesaleA = totalMaterials + labor;
    const retailA = wholesaleA * retailMultA;

    // STRATEGY B (Matches Screenshot): Wholesale = (Mat * 1.8) + Labor | Retail = Whol * 2
    const wholesaleB = (totalMaterials * 1.8) + labor; 
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
    if (!itemName || metalList.length === 0) return alert("Missing info");
    if (!user) return alert("Session not ready");
    const newItem = { name: itemName, metals: metalList, wholesale: activeWholesale, retail: activeRetail, strategy: strategy, user_id: user.id };
    const { data, error } = await supabase.from('inventory').insert([newItem]).select();
    if (error) alert(error.message);
    else if (data) { 
        setInventory([data[0], ...inventory]); 
        setItemName(''); setMetalList([]); setHours(''); setOtherCosts(''); 
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
        <div className="flex justify-between items-center bg-white px-6 py-3 rounded-2xl border shadow-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {!user ? 'Vault Locked' : (user.is_anonymous ? 'Guest Vault' : `User: ${user.email || 'Syncing...'}`)}
            </p>
          </div>
          <div className="flex gap-4">
            {(!user || user.is_anonymous) ? (
              <button onClick={() => setShowAuth(!showAuth)} className="text-[10px] font-black uppercase bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                {user?.is_anonymous ? 'Save to Cloud' : 'Login / Sign Up'}
              </button>
            ) : (
              <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="text-[10px] font-black uppercase bg-slate-100 px-4 py-2 rounded-lg hover:bg-slate-200 transition">
                Logout
              </button>
            )}
          </div>
        </div>

        {/* AUTH BOX */}
        {showAuth && (
          <div className="bg-white p-6 rounded-[2rem] border-2 border-blue-600 shadow-xl max-w-sm ml-auto animate-in fade-in zoom-in-95 relative z-50">
            <h3 className="text-sm font-black uppercase mb-4">{isSignUp ? 'Create Account' : 'Login'}</h3>
            <form onSubmit={handleAuth} className="space-y-3">
              <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl text-sm" value={email} onChange={e => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" className="w-full p-3 border rounded-xl text-sm" value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-blue-700 transition">
                {isSignUp ? 'Confirm & Sync Data' : 'Login'}
              </button>
            </form>
            <div className="mt-4 space-y-2 text-center">
              <p onClick={() => { setIsSignUp(!isSignUp); setEmail(''); setPassword(''); }} className="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-blue-600 uppercase">
                {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign up'}
              </p>
              {!isSignUp && (
                <div className="flex justify-center gap-4 border-t pt-2 border-slate-100">
                  <button onClick={handleResetPassword} className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase">Forgot Password?</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TICKER */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(prices).map(([name, p]) => (name !== 'lastUpdated' &&
            <div key={name} className="bg-white p-4 rounded-xl border-l-4 border-blue-600 shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400">{name}</p>
              <p className="text-xl font-bold">${Number(p).toLocaleString()}</p>
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
              <input type="number" placeholder="Other Costs ($)" className="w-full p-3 border rounded-xl" value={otherCosts} onChange={e => setOtherCosts(e.target.value === '' ? '' : Number(e.target.value))} />

              {/* UPDATED STRATEGY BUTTONS */}
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setStrategy('A')} className={`p-4 rounded-2xl border-2 text-left transition-all ${strategy === 'A' ? 'border-blue-600 bg-blue-50' : 'border-slate-100'}`}>
                  <p className="text-[10px] font-black opacity-50 uppercase tracking-tighter">Strategy A</p>
                  <p className="text-xl font-black">${b.retailA.toFixed(2)}</p>
                  <div className="mt-1 space-y-1">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-tight">Wholesale: Materials + Labor</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Retail: Whol ×</span>
                      <input type="number" step="0.1" className="w-10 bg-white border rounded text-[10px] font-black text-blue-600" value={retailMultA} onChange={(e) => setRetailMultA(Number(e.target.value))} onClick={(e) => e.stopPropagation()} />
                    </div>
                  </div>
                </button>
                <button onClick={() => setStrategy('B')} className={`p-4 rounded-2xl border-2 text-left transition-all ${strategy === 'B' ? 'border-blue-600 bg-blue-50' : 'border-slate-100'}`}>
                  <p className="text-[10px] font-black opacity-50 uppercase tracking-tighter">Strategy B</p>
                  <p className="text-xl font-black">${b.retailB.toFixed(2)}</p>
                  <div className="mt-1 space-y-1">
                    <p className="text-[8px] font-bold text-blue-600 uppercase italic tracking-tighter leading-tight">Wholesale: (Mat × 1.8) + Labor</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Retail: Wholesale × 2</p>
                  </div>
                </button>
              </div>

              <button onClick={addToInventory} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all uppercase">Save to Vault</button>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="flex justify-between items-center bg-white px-6 py-4 rounded-2xl border shadow-sm">
              <h2 className="text-lg font-black uppercase tracking-tight">Saved Pieces</h2>
              <button onClick={exportToPDF} disabled={inventory.length === 0} className="px-6 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-green-700 transition">Export PDF</button>
            </div>
            <div className="space-y-4">
              {loading ? <div className="p-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">Opening Vault...</div> :
                inventory.length === 0 ? <div className="bg-white p-12 rounded-[2rem] border-2 border-dotted text-center text-slate-400 font-bold uppercase text-xs">Your vault is empty.</div> :
                  inventory.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 hover:border-blue-200 transition">
                      <div className="flex-1 w-full"><div className="flex justify-between items-start"><p className="text-xl font-black text-slate-800">{item.name}</p><button onClick={() => deleteInventoryItem(item.id)} className="text-[9px] font-black text-red-300 uppercase hover:text-red-600 tracking-tighter">[ Remove ]</button></div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{new Date(item.created_at).toLocaleDateString()}</p></div>
                      <div className="flex gap-8 w-full sm:w-auto text-right">
                        <div><p className="text-[9px] font-black text-slate-400 uppercase">Wholesale</p><p className="text-lg font-black text-slate-600">${Number(item.wholesale).toFixed(2)}</p></div>
                        <div><p className="text-[9px] font-black text-blue-600 uppercase italic">Retail MSRP</p><p className="text-3xl font-black text-slate-900">${Number(item.retail).toFixed(2)}</p></div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* EXPLANATION BOXES (Matches Screenshot 10.39.17) */}
        <div className="grid grid-cols-1 gap-6 pt-10">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-800 underline decoration-blue-500 decoration-4 underline-offset-8">1. MATERIAL CALCULATION DETAIL</h2>
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
                  <p>24K Gold: 99.9%</p><p>22K Gold: 91.6%</p><p>18K Gold: 75.0%</p><p>14K Gold: 58.3%</p><p>10K Gold: 41.7%</p><p>Sterling Silver: 92.5%</p><p>Plat 950: 95.0%</p><p>Palladium: 95.0%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
            <h2 className="text-xl font-black uppercase italic tracking-tighter mb-6 text-slate-800 underline decoration-blue-500 decoration-4 underline-offset-8">2. PRICE STRATEGY DETAIL</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className={`p-6 rounded-2xl border-2 transition-all ${strategy === 'A' ? 'border-blue-600 bg-blue-50' : 'bg-slate-50 border-transparent'}`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY A (STANDARD MULTIPLIER)</h3>
                <div className="space-y-2 text-xs text-slate-700">
                  <p><strong>Wholesale:</strong> Materials + Labor</p>
                  <p><strong>Retail:</strong> Wholesale × {retailMultA}</p>
                </div>
              </div>
              <div className={`p-6 rounded-2xl border-2 transition-all ${strategy === 'B' ? 'border-blue-600 bg-blue-50' : 'bg-slate-50 border-transparent'}`}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">STRATEGY B (MATERIALS MARKUP)</h3>
                <div className="space-y-2 text-xs text-slate-700">
                  <p><strong>Wholesale:</strong> (Materials × 1.8) + Labor</p>
                  <p><strong>Retail:</strong> Wholesale × 2</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}