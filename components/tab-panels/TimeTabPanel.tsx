"use client";

import type { RefObject } from "react";

function entryWorkLocalDay(e: { logged_on?: string | null; created_at: string }): Date {
  if (e.logged_on && /^\d{4}-\d{2}-\d{2}$/.test(e.logged_on)) {
    const [y, mo, d] = e.logged_on.split("-").map(Number);
    return new Date(y, mo - 1, d);
  }
  return new Date(e.created_at);
}

export type TimeTabPanelProps = {
  user: unknown;
  inventory: any[];
  timerStartedAt: number | null;
  setTimerStartedAt: (n: number | null) => void;
  timerPausedElapsed: number;
  setTimerPausedElapsed: (n: number) => void;
  timerElapsedDisplay: string;
  timerElapsedSeconds: number;
  timeSummaryToday: number;
  timeSummaryThisWeek: number;
  timeFilterDateFrom: string;
  setTimeFilterDateFrom: (v: string) => void;
  timeFilterDateTo: string;
  setTimeFilterDateTo: (v: string) => void;
  timeFilterItemDropdownRef: RefObject<HTMLDivElement | null>;
  timeFilterItemId: string;
  setTimeFilterItemId: (v: string) => void;
  timeFilterItemSearch: string;
  setTimeFilterItemSearch: (v: string) => void;
  timeFilterItemDropdownOpen: boolean;
  setTimeFilterItemDropdownOpen: (v: boolean) => void;
  filteredTimeEntries: any[];
  deletingTimeEntryId: string | null;
  onOpenLogTimeHeader: () => void;
  onOpenLogTimeFromStoppedTimer: () => void;
  openEditTimeModal: (e: any) => void;
  deleteTimeEntry: (id: string) => void;
};

export default function TimeTabPanel({
  user,
  inventory,
  timerStartedAt,
  setTimerStartedAt,
  timerPausedElapsed,
  setTimerPausedElapsed,
  timerElapsedDisplay,
  timerElapsedSeconds,
  timeSummaryToday,
  timeSummaryThisWeek,
  timeFilterDateFrom,
  setTimeFilterDateFrom,
  timeFilterDateTo,
  setTimeFilterDateTo,
  timeFilterItemDropdownRef,
  timeFilterItemId,
  setTimeFilterItemId,
  timeFilterItemSearch,
  setTimeFilterItemSearch,
  timeFilterItemDropdownOpen,
  setTimeFilterItemDropdownOpen,
  filteredTimeEntries,
  deletingTimeEntryId,
  onOpenLogTimeHeader,
  onOpenLogTimeFromStoppedTimer,
  openEditTimeModal,
  deleteTimeEntry,
}: TimeTabPanelProps) {
  return (
    <div className="bg-white rounded-[2.5rem] border-2 border-[#A5BEAC] shadow-sm flex flex-col flex-1 min-h-0 min-h-[50vh] lg:min-h-0 lg:max-h-[calc(100vh-5rem)] overflow-hidden">
      <div className="p-6 border-b border-stone-100 bg-white space-y-4 rounded-t-[2.5rem] shrink-0">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">Time Tracking</h2>
          <button
            type="button"
            onClick={onOpenLogTimeHeader}
            className="px-4 py-2 rounded-xl bg-[#A5BEAC] text-white text-xs font-black uppercase hover:bg-slate-900 transition"
          >
            Log time
          </button>
        </div>
        <p className="text-[10px] text-stone-500">Track time spent on pieces or general shop work.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 max-md:pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] space-y-6">
        {!user ? (
          <div className="text-center py-12 text-stone-400 text-sm font-bold">
            Sign in to track time.
          </div>
        ) : (
          <>
            <div className="bg-stone-50 rounded-2xl border-2 border-[#A5BEAC]/30 p-6 space-y-4">
              <p className="text-[9px] font-black uppercase text-stone-400">Live Timer</p>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl sm:text-5xl font-black tabular-nums ${timerStartedAt ? "text-[#A5BEAC] animate-pulse" : timerPausedElapsed > 0 ? "text-slate-900" : "text-stone-300"}`}>
                    {timerElapsedDisplay}
                  </span>
                  <span className="text-sm font-bold text-stone-400">
                    {(timerElapsedSeconds / 3600).toFixed(2)}h
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                  {!timerStartedAt && timerPausedElapsed === 0 && (
                    <button
                      type="button"
                      onClick={() => setTimerStartedAt(Date.now())}
                      className="px-6 py-3 rounded-xl bg-[#A5BEAC] text-white text-sm font-black uppercase hover:bg-slate-900 transition shadow-lg flex items-center gap-2"
                    >
                      <span className="w-3 h-3 rounded-full bg-white" /> Start
                    </button>
                  )}
                  {timerStartedAt && (
                    <button
                      type="button"
                      onClick={() => {
                        const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000);
                        setTimerPausedElapsed(elapsed);
                        setTimerStartedAt(null);
                      }}
                      className="px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-black uppercase hover:bg-[#A5BEAC] transition shadow-lg"
                    >
                      Stop
                    </button>
                  )}
                  {!timerStartedAt && timerPausedElapsed > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={onOpenLogTimeFromStoppedTimer}
                        className="px-6 py-3 rounded-xl bg-[#A5BEAC] text-white text-sm font-black uppercase hover:bg-slate-900 transition shadow-lg"
                      >
                        Log time
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimerPausedElapsed(0)}
                        className="px-6 py-3 rounded-xl bg-stone-200 text-stone-600 text-sm font-black uppercase hover:bg-stone-300 transition"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTimerStartedAt(Date.now() - timerPausedElapsed * 1000);
                          setTimerPausedElapsed(0);
                        }}
                        className="px-6 py-3 rounded-xl border-2 border-[#A5BEAC] text-[#A5BEAC] text-sm font-black uppercase hover:bg-[#A5BEAC]/10 transition"
                      >
                        Resume
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-stone-500">
                {timerStartedAt ? "Timer running…" : timerPausedElapsed > 0 ? "Stopped. Log it, adjust in the modal, or resume." : "Start the timer when you begin working, stop when you finish."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4">
                <p className="text-[9px] font-black uppercase text-stone-400">Today</p>
                <p className="text-2xl font-black text-slate-900 mt-0.5">{(timeSummaryToday / 60).toFixed(1)}h</p>
              </div>
              <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4">
                <p className="text-[9px] font-black uppercase text-stone-400">This week</p>
                <p className="text-2xl font-black text-slate-900 mt-0.5">{(timeSummaryThisWeek / 60).toFixed(1)}h</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[9px] font-bold text-stone-400 uppercase">Filters</span>
              <input
                type="date"
                value={timeFilterDateFrom}
                onChange={(e) => setTimeFilterDateFrom(e.target.value)}
                className="py-2 px-3 rounded-lg border border-stone-200 text-xs font-bold outline-none focus:border-[#A5BEAC]"
              />
              <span className="text-stone-300">–</span>
              <input
                type="date"
                value={timeFilterDateTo}
                onChange={(e) => setTimeFilterDateTo(e.target.value)}
                className="py-2 px-3 rounded-lg border border-stone-200 text-xs font-bold outline-none focus:border-[#A5BEAC]"
              />
              <div ref={timeFilterItemDropdownRef} className="relative min-w-[140px]">
                <input
                  type="text"
                  placeholder="Filter by piece…"
                  value={
                    timeFilterItemDropdownOpen
                      ? timeFilterItemSearch
                      : timeFilterItemId === "_unassigned"
                        ? "General / unassigned"
                        : timeFilterItemId
                          ? (inventory.find((i: any) => i.id === timeFilterItemId)?.name || "").toUpperCase()
                          : "All pieces"
                  }
                  onChange={(e) => {
                    setTimeFilterItemSearch(e.target.value);
                    setTimeFilterItemDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setTimeFilterItemDropdownOpen(true);
                    setTimeFilterItemSearch(
                      timeFilterItemId && timeFilterItemId !== "_unassigned"
                        ? inventory.find((i: any) => i.id === timeFilterItemId)?.name || ""
                        : ""
                    );
                  }}
                  onBlur={() => setTimeout(() => setTimeFilterItemDropdownOpen(false), 150)}
                  className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs font-bold outline-none focus:border-[#A5BEAC]"
                />
                {timeFilterItemDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg z-50 min-w-[180px]">
                    <button
                      type="button"
                      onClick={() => {
                        setTimeFilterItemId("");
                        setTimeFilterItemSearch("");
                        setTimeFilterItemDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-xs font-bold hover:bg-stone-50 first:rounded-t-xl ${!timeFilterItemId ? "bg-[#A5BEAC]/10 text-[#A5BEAC]" : "text-stone-600"}`}
                    >
                      All pieces
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeFilterItemId("_unassigned");
                        setTimeFilterItemSearch("");
                        setTimeFilterItemDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-xs font-bold hover:bg-stone-50 ${timeFilterItemId === "_unassigned" ? "bg-[#A5BEAC]/10 text-[#A5BEAC]" : "text-stone-600"}`}
                    >
                      General / unassigned
                    </button>
                    {inventory
                      .filter(
                        (i: any) =>
                          !timeFilterItemSearch.trim() ||
                          (i.name || "").toUpperCase().includes(timeFilterItemSearch.trim().toUpperCase())
                      )
                      .map((i: any) => (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => {
                            setTimeFilterItemId(i.id);
                            setTimeFilterItemSearch("");
                            setTimeFilterItemDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 text-xs font-bold hover:bg-stone-50 last:rounded-b-xl ${timeFilterItemId === i.id ? "bg-[#A5BEAC]/10 text-[#A5BEAC]" : "text-stone-800"}`}
                        >
                          {(i.name || "").toUpperCase()}
                        </button>
                      ))}
                    {inventory.filter(
                      (i: any) =>
                        !timeFilterItemSearch.trim() ||
                        (i.name || "").toUpperCase().includes(timeFilterItemSearch.trim().toUpperCase())
                    ).length === 0 && (
                      <div className="px-3 py-4 text-xs text-stone-400 font-bold">No pieces match</div>
                    )}
                  </div>
                )}
              </div>
              {(timeFilterDateFrom || timeFilterDateTo || timeFilterItemId) && (
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilterDateFrom("");
                    setTimeFilterDateTo("");
                    setTimeFilterItemId("");
                    setTimeFilterItemSearch("");
                    setTimeFilterItemDropdownOpen(false);
                  }}
                  className="py-2 px-3 rounded-lg text-[10px] font-black uppercase text-stone-500 hover:text-slate-900 border border-stone-200 hover:border-stone-300 transition"
                >
                  Clear
                </button>
              )}
            </div>

            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 mb-3">Recent entries</h3>
              {filteredTimeEntries.length === 0 ? (
                <p className="text-stone-500 text-sm py-6">No time entries yet. Log time to get started.</p>
              ) : (
                <div className="space-y-2">
                  {filteredTimeEntries.map((e: any) => {
                    const workDay = entryWorkLocalDay(e);
                    const itemName = e.inventory_id
                      ? (inventory.find((i: any) => i.id === e.inventory_id)?.name || "Piece").toUpperCase()
                      : "General";
                    const hrs = (Number(e.duration_minutes) / 60).toFixed(2);
                    const isDeleting = deletingTimeEntryId === e.id;
                    const hasExplicitWorkDate = !!(e.logged_on && /^\d{4}-\d{2}-\d{2}$/.test(e.logged_on));
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl border border-stone-200 bg-white hover:border-[#A5BEAC]/50 transition">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">{itemName}</p>
                          <p className="text-[10px] text-stone-500">
                            {hasExplicitWorkDate ? (
                              <>
                                <span className="font-bold text-stone-600">
                                  {workDay.toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                                <span className="text-stone-400"> · work date</span>
                              </>
                            ) : (
                              <>
                                {workDay.toLocaleDateString()}{" "}
                                {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </>
                            )}
                          </p>
                          {e.note && <p className="text-[10px] text-stone-400 mt-0.5 truncate">{e.note}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-black text-[#A5BEAC]">{hrs}h</span>
                          <button
                            type="button"
                            onClick={() => openEditTimeModal(e)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-[#A5BEAC] transition"
                            title="Edit"
                          >
                            <span className="text-xs">✎</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTimeEntry(e.id)}
                            disabled={isDeleting}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                            title="Delete"
                          >
                            {isDeleting ? <span className="text-[10px] animate-pulse">…</span> : <span className="text-xs">🗑</span>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
