"use client";
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase'; // Make sure your lib/supabase.ts exists!

const UNIT_TO_GRAMS: { [key: string]: number } = {
  "Grams": 1,
  "Pennyweights (dwt)": 1.55517,
  "Troy Ounces": 31.1035,
  "Ounces (std)": 28.3495
};

export default function Home() {
  // Added lastUpdated to the state
  const [prices, setPrices] = useState({ gold: 0, silver: 0, platinum: 0, palladium: 0, lastUpdated: null });
  const [itemName, setItemName] = useState('');
  const [metalList, setMetalList] = useState<{type: string, weight: number, unit: string}[]>([]);
  
  const [tempMetal, setTempMetal] = useState('Sterling Silver');
  const [tempWeight, setTempWeight] = useState(0);
  const [tempUnit, setTempUnit] = useState('Grams');

  const [hours, setHours] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>(''); 
  const [otherCosts, setOtherCosts] = useState<number | ''>('');
  
  const [strategy, setStrategy] = useState<'A' | 'B'>('A'); 
  const [retailMultA, setRetailMultA] = useState(3);
  const markupB = 1.8; 
  const retailMultB = 2;

  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Metal Prices & Inventory from Supabase on load
  useEffect(() => {
    async function fetchData() {
      // Fetch Live Prices
      try {
        const res = await fetch('/api/gold-price');
        const data = await res.json();
        if (data.gold) setPrices(data);
      } catch (e) { console.error("Price fetch failed", e); }

      // Fetch Inventory from Supabase
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) console.error("DB Fetch Error:", error);
      else if (data) setInventory(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  const addMetalToPiece = () => {
    if (tempWeight <= 0) return;
    setMetalList([...metalList, { type: tempMetal, weight: tempWeight, unit: tempUnit }]);
    setTempWeight(0);
  };

  // 2. Delete from Supabase
  const deleteInventoryItem = async (id: string) => {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) {
      alert("Error deleting item");
    } else {
      setInventory(inventory.filter(item => item.id !== id));
    }
  };

  const calculateFullBreakdown = (metals: any[], h: any, r: any, o: any) => {
    let rawMaterialCost = 0;
    const numH = Number(h) || 0;
    const numR = Number(r) || 0;
    const numO = Number(o) || 0;

    metals.forEach(m => {
      let spot = 0;
      let purity = 1.0;
      
      if (m.type.includes('Gold')) spot = prices.gold;
      else if (m.type.includes('Silver')) spot = prices.silver;
      else if (m.type.includes('Platinum')) spot = prices.platinum;
      else if (m.type.includes('Palladium')) spot = prices.palladium;

      if (m.type === '10K Gold') purity = 0.417;
      else if (m.type === '14K Gold') purity = 0.583;
      else if (m.type === '18K Gold') purity = 0.750;
      else if (m.type === '22K Gold') purity = 0.916;
      else if (m.type === '24K Gold') purity = 0.999;
      else if (m.type === 'Sterling Silver') purity = 0.925;
      else if (m.type === 'Platinum 950') purity = 0.950;
      else if (m.type === 'Palladium') purity = 0.950;

      rawMaterialCost += (spot / 31.1035) * (m.weight * UNIT_TO_GRAMS[m.unit]) * purity;
    });

    const totalMaterials = rawMaterialCost + numO;
    const labor = numH * numR;
    const wholesaleA = totalMaterials + labor;
    const retailA = wholesaleA * retailMultA;
    const wholesaleB = (totalMaterials * markupB) + labor;
    const retailB = wholesaleB * retailMultB;

    return { wholesaleA, retailA, wholesaleB, retailB, totalMaterials, labor };
  };

  const b = calculateFullBreakdown(metalList, hours, rate, otherCosts);
  const activeRetail = strategy === 'A' ? b.retailA : b.retailB;
  const activeWholesale = strategy === 'A' ? b.wholesaleA : b.wholesaleB;

  // 3. Save to Supabase
  const addToInventory = async () => {
    if (!itemName || metalList.length === 0) return alert("Missing info");

    const newItem = {
      name: itemName,
      metals: metalList,
      wholesale: activeWholesale,
      retail: activeRetail,
      strategy: strategy,
      multiplier: retailMultA,
      labor_rate: Number(rate) || 0,
      labor_hours: Number(hours) || 0,
      other_costs: Number(otherCosts) || 0
    };

    const { data, error } = await supabase
      .from('inventory')
      .insert([newItem])
      .select();

    if (error) {
      console.error(error);
      alert("Database error: " + error.message);
    } else if (data) {
      setInventory([data[0], ...inventory]);
      setItemName(''); setMetalList([]); setHours(''); setOtherCosts('');
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Inventory Report', 14, 20);
    const tableData = inventory.map(item => [
      item.name,
      `$${Number(item.wholesale).toFixed(2)}`,
      `$${Number(item.retail).toFixed(2)}`,
      new Date(item.created_at).toLocaleDateString()
    ]);
    autoTable(doc, { startY: 30, head: [['Item', 'Wholesale', 'Retail', 'Date']], body: tableData });
    doc.save('inventory.pdf');
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* TOP BAR: METAL PRICES */}
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {Object.entries(prices).map(([name, p]) => {
              if (name === 'lastUpdated') return null; // Don't render the timestamp as a card
              return (
                <div key={name} className="bg-white p-3 md:p-4 rounded-xl border-l-4 border-blue-600 shadow-sm">
                  <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400">{name}</p>
                  <p className="text-lg md:text-xl font-bold">${Number(p).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
          
          {/* THE NEW LAST SYNCED LABEL */}
          {prices.lastUpdated && (
            <p className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-widest text-right">
              Last synced: {new Date(prices.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* MAIN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          
          {/* CALCULATOR COLUMN */}
          <div className="lg:col-span-5 bg-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] shadow-xl space-y-5">
            <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter">Calculator</h2>
            <input placeholder="Product Name" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-blue-500" value={itemName} onChange={e => setItemName(e.target.value)} />
            
            <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dotted border-slate-300 space-y-3">
              <select className="w-full p-3 border rounded-xl font-bold bg-white outline-none" value={tempMetal} onChange={e => setTempMetal(e.target.value)}>
                <option>Sterling Silver</option>
                <option>10K Gold</option><option>14K Gold</option><option>18K Gold</option>
                <option>22K Gold</option><option>24K Gold</option>
                <option>Platinum 950</option><option>Palladium</option>
              </select>
              <div className="flex gap-2">
                <input type="number" placeholder="Weight" className="w-full p-3 border rounded-xl outline-none" value={tempWeight || ''} onChange={e => setTempWeight(Number(e.target.value))} />
                <select className="p-3 border rounded-xl text-[10px] font-bold outline-none" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>
                  {Object.keys(UNIT_TO_GRAMS).map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <button onClick={addMetalToPiece} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs hover:bg-black transition">+ ADD METAL</button>
              {metalList.map((m, i) => (
                <div key={i} className="text-[10px] font-bold bg-white p-2 rounded border flex justify-between items-center">
                   <span>{m.weight}{m.unit} {m.type}</span>
                   <button onClick={() => setMetalList(metalList.filter((_, idx) => idx !== i))} className="text-red-500 text-lg">×</button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input type="number" placeholder="Labor $/hr" className="p-3 border rounded-xl outline-none" value={rate} onChange={e => setRate(e.target.value === '' ? '' : Number(e.target.value))} />
              <input type="number" placeholder="Hours" className="p-3 border rounded-xl outline-none" value={hours} onChange={e => setHours(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <input type="number" placeholder="Other Costs ($)" className="w-full p-3 border rounded-xl outline-none" value={otherCosts} onChange={e => setOtherCosts(e.target.value === '' ? '' : Number(e.target.value))} />

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setStrategy('A')} className={`p-4 rounded-2xl border-2 text-left relative transition-all ${strategy === 'A' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}>
                <p className="text-[10px] font-black">STRATEGY A</p>
                <p className="text-lg md:text-xl font-black">${b.retailA.toFixed(2)}</p>
                <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Mult: x</span>
                    <input 
                        type="number" step="0.1"
                        className="w-10 bg-white border border-slate-200 rounded px-1 text-[10px] font-black text-blue-600"
                        value={retailMultA}
                        onChange={(e) => setRetailMultA(Number(e.target.value))}
                    />
                </div>
              </button>
              <button onClick={() => setStrategy('B')} className={`p-4 rounded-2xl border-2 text-left transition-all ${strategy === 'B' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}>
                <p className="text-[10px] font-black">STRATEGY B</p>
                <p className="text-lg md:text-xl font-black">${b.retailB.toFixed(2)}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Mat x1.8 | Ret x2</p>
              </button>
            </div>
            <button onClick={addToInventory} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-blue-700 transition active:scale-95">SAVE TO DATABASE</button>
          </div>

          {/* INVENTORY COLUMN */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
              <h2 className="text-xl font-black uppercase tracking-tight">Inventory</h2>
              <button 
                onClick={exportToPDF}
                disabled={inventory.length === 0}
                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase transition w-full sm:w-auto ${
                  inventory.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300' : 'bg-green-600 text-white hover:bg-green-700 shadow-md active:scale-95'
                }`}
              >
                Download PDF Report
              </button>
            </div>
            
            {loading ? (
              <div className="p-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest">Connecting to Database...</div>
            ) : inventory.length === 0 ? (
              <div className="bg-white p-12 rounded-[1.5rem] md:rounded-[2rem] border-2 border-dotted text-center text-slate-400 font-bold">No items saved in database yet.</div>
            ) : (
              inventory.map(item => (
                <div key={item.id} className="bg-white p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
                  <div className="w-full sm:w-auto">
                    <p className="text-lg md:text-xl font-black">{item.name}</p>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {new Date(item.created_at).toLocaleString()} | Strategy {item.strategy}
                    </p>
                    <button onClick={() => deleteInventoryItem(item.id)} className="mt-2 text-[9px] font-bold text-red-400 uppercase hover:text-red-600 transition">[ Delete ]</button>
                  </div>
                  <div className="w-full sm:text-right">
                    <p className="text-[9px] md:text-[10px] font-black text-blue-600 uppercase">Retail Price</p>
                    <p className="text-2xl md:text-3xl font-black text-slate-900">${Number(item.retail).toFixed(2)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Wholesale: ${Number(item.wholesale).toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}