'use client';

import { useEffect, useRef } from 'react';
import type { ValueType, OpType, FormulaToken } from '@/lib/formula-engine';
import { VALUE_LABELS, OP_LABELS } from '@/lib/formula-engine';

const VALUE_BLOCKS: ValueType[] = [
  'metal',
  'labor',
  'other',
  'stoneCost',
  'stoneRetail',
  'overhead',
  'totalMaterials',
  'base',
];

const OP_BLOCKS: OpType[] = ['add', 'subtract', 'multiply', 'divide', 'percentOf'];

interface BlockPickerProps {
  onSelect: (token: FormulaToken) => void;
  onClose?: () => void;
  /** When true, hide the "Base" value block (invalid in base formula slot) */
  excludeBase?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export default function BlockPicker({ onSelect, onClose, excludeBase, anchorRef }: BlockPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  const valueBlocks = excludeBase ? VALUE_BLOCKS.filter((v) => v !== 'base') : VALUE_BLOCKS;

  const handleSelect = (token: FormulaToken) => {
    onSelect(token);
    onClose?.();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside as any);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [onClose, anchorRef]);

  return (
    <div
      ref={pickerRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[200px] p-3 rounded-xl bg-white border-2 border-stone-200 shadow-xl"
    >
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mb-2">Value blocks</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {valueBlocks.map((v) => (
          <button
            key={`val-${v}`}
            type="button"
            onClick={() => handleSelect({ kind: 'value', value: v })}
            className="min-h-[44px] min-w-[44px] px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase border border-stone-200 bg-white text-slate-700 active:border-brand transition-all"
          >
            {VALUE_LABELS[v]}
          </button>
        ))}
      </div>
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mb-2">Operations</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {OP_BLOCKS.map((o) => (
          <button
            key={`op-${o}`}
            type="button"
            onClick={() => handleSelect({ kind: 'op', op: o })}
            className="min-h-[44px] min-w-[44px] px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase border border-stone-200 bg-stone-100 text-stone-600 active:border-brand transition-all"
          >
            {OP_LABELS[o]}
          </button>
        ))}
      </div>
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mb-2">Constant</p>
      <button
        type="button"
        onClick={() => handleSelect({ kind: 'constant', value: 1 })}
        className="min-h-[44px] min-w-[44px] px-2 py-1.5 rounded-lg text-[10px] font-bold border border-stone-200 bg-white text-slate-700 active:border-brand transition-all"
      >
        #
      </button>
    </div>
  );
}
