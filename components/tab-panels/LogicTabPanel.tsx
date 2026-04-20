"use client";

export type LogicTabPanelProps = {
  retailMultA: number;
  markupB: number;
  onCreateFormula: () => void;
};

/**
 * Static educational content; lazy-loaded so first paint skips this chunk.
 */
export default function LogicTabPanel({ retailMultA, markupB, onCreateFormula }: LogicTabPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-8 pt-6 mt-0 md:pt-4 px-4 md:px-6 lg:px-8 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8 min-w-0">
      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-brand min-h-[400px] md:min-h-0 min-w-0">
        <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-brand decoration-4 underline-offset-8">1. MATERIAL CALCULATION DETAIL</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 text-left">
          <div className="space-y-6 min-w-0">
            <div className="bg-stone-50 p-6 md:p-8 rounded-[2rem] border border-stone-100 text-left">
              <h3 className="text-xs font-black text-brand uppercase tracking-widest mb-6">THE LOGIC</h3>
              <div className="font-mono text-sm bg-white p-6 rounded-2xl border border-stone-100 text-center shadow-sm">
                <p className="text-slate-900 font-bold break-words">Cost = (Spot ÷ 31.1035) × Grams × Purity</p>
              </div>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed italic px-2 pb-2 overflow-visible">Spot prices are quoted per Troy Ounce. We divide by 31.1035 to get the price per gram, then multiply by the specific metal purity.</p>
          </div>
          <div className="bg-stone-50 p-6 md:p-8 rounded-[2rem] border border-stone-100 text-left min-w-0">
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

      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-brand min-h-[400px] md:min-h-0 min-w-0">
        <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-brand decoration-4 underline-offset-8">2. ADVANCED PRICING LOGIC</h2>
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

      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border-2 border-brand min-h-[400px] md:min-h-0 min-w-0">
        <h2 className="text-xl font-black uppercase italic tracking-tighter mb-8 text-slate-900 text-left underline decoration-brand decoration-4 underline-offset-8">3. PRICE FORMULA DETAIL</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 text-left">
          <div className="p-6 md:p-8 rounded-[2rem] border border-stone-100 bg-stone-50 transition-all flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">FORMULA A (STANDARD MULTIPLIER)</h3>
              <p className="text-[10px] text-stone-500 leading-relaxed mb-4">Uses a basic markup of 2–3× on your total cost (metal, labor, overhead). Industry standard for straightforward pricing.</p>
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
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">FORMULA B (MATERIALS MARKUP)</h3>
              <p className="text-[10px] text-stone-500 leading-relaxed mb-4">Prioritizes materials: metal + other costs get a markup (typically 1.5–2×), then labor and overhead are added. Industry standard for material-focused pieces.</p>
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

          <div className="p-6 md:p-8 rounded-[2rem] border-2 border-brand bg-brand/5 transition-all flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black text-brand uppercase tracking-widest mb-2">CUSTOM FORMULAS</h3>
              <p className="text-[10px] text-stone-500 leading-relaxed mb-4">Build your own pricing logic. You define three formulas that work together to calculate your prices.</p>
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center font-black text-xs shrink-0 mt-0.5">B</div>
                  <div className="flex-1">
                    <span className="text-xs font-bold text-stone-400 block mb-1">Base Cost</span>
                    <span className="text-xs text-slate-900 break-words">Your materials + labor + overhead. Combine values with +, −, ×, ÷.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center font-black text-xs shrink-0 mt-0.5">W</div>
                  <div className="flex-1">
                    <span className="text-xs font-bold text-stone-400 block mb-1">Wholesale</span>
                    <span className="text-xs text-slate-900 break-words">Typically Base + Stone cost, or your own markup.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center font-black text-xs shrink-0 mt-0.5">R</div>
                  <div className="flex-1">
                    <span className="text-xs font-bold text-stone-400 block mb-1">Retail</span>
                    <span className="text-xs text-slate-900 break-words">Final price. Can use Base, multipliers, and stone retail.</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onCreateFormula}
                className="w-full py-3 rounded-xl text-[10px] font-black uppercase bg-brand text-white hover:bg-slate-900 transition shadow-sm"
              >
                Create a formula →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
