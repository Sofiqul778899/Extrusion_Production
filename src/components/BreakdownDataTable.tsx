import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '../lib/utils';
import { getShiftAndDateForDhaka } from '../lib/utils';
import { ChevronDown, ChevronUp, Clock, CloudUpload } from 'lucide-react';

interface MachineMaster {
  id: string;
  type: string;
  target: number;
  status: 'Running' | 'Idle' | 'Breakdown';
  reason: string;
  numIdle?: number;
  numBreakdown?: number;
  idleTime?: number;
  breakdownTime?: number;
  lastStatusChange?: string;
}

interface MachineLog {
  id?: string;
  machineId: string;
  date: string;
  status: string;
  reason: string;
  durationHrs: number;
  startTime: string;
  endTime: string;
}

export default function BreakdownDataTable({ 
  machines, 
  dateFilter, 
  showToast 
}: { 
  machines: MachineMaster[]; 
  dateFilter: string; 
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void; 
}) {
  const [logs, setLogs] = useState<MachineLog[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [isSyncing, setIsSyncing] = useState(false);

  const syncAllToGoogleSheets = async () => {
    setIsSyncing(true);
    try {
      if (showToast) showToast('Starting breakdown data sync to Google Sheets...', 'info');
      const res = await fetch('/api/sync-all-breakdown-sheets', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast('Successfully synced breakdown logs to Google Sheets.', 'success');
      } else {
        throw new Error(data.error || 'Failed to sync');
      }
    } catch (error: any) {
      console.error(error);
      if (showToast) showToast(error.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetch('/api/machine-logs')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLogs(data);
        }
      })
      .catch(err => console.error("Could not load logs", err));
  }, []);

  const combinedData = useMemo(() => {
    return logs.map(lg => {
      const isCurrent = lg.endTime === 'Ongoing' || lg.endTime === 'Now';
      const durationHrs = isCurrent
        ? Math.max(0, (Date.now() - new Date(lg.startTime).getTime()) / (1000 * 60 * 60))
        : Number(lg.durationHrs || 0);

      return {
        ...lg,
        isCurrent,
        durationHrs
      };
    }).filter(lg => {
      const dateMatch = dateFilter === '' || lg.date === dateFilter;
      const statusMatch = statusFilter === 'All' || lg.status === statusFilter;
      return dateMatch && statusMatch;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [logs, dateFilter, statusFilter]);

  return (
    <div className="w-full">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <option value="All">All Events</option>
            <option value="Idle">Idle</option>
            <option value="Breakdown">Breakdown</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse bg-white shadow-sm border border-slate-100 rounded-xl">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">DATE</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">MACHINE ID</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">TARGET</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">STATUS</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">REASON</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">DURATION (HRS)</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">START TIME</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">END TIME</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {combinedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-500 text-sm">
                  No breakdown or idle events found.
                </td>
              </tr>
            ) : (
              combinedData.map((ev, i) => {
                const mac = machines.find(m => m.id === ev.machineId);
                const target = mac ? mac.target : '--';
                const isCurrent = ev.isCurrent;

                return (
                  <tr key={ev.id || i} className={cn("hover:bg-slate-50/50 transition-colors", isCurrent && "bg-orange-50/30")}>
                    <td className="px-6 py-4 text-sm font-mono text-slate-600">{ev.date}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">{ev.machineId}</td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-500">{target}</td>
                    <td className="px-6 py-4">
                      <span className={cn("px-2 py-1 rounded inline-flex text-xs font-bold tracking-widest", 
                        ev.status === 'Idle' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                      )}>
                        {ev.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{ev.reason}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-700 font-mono text-sm">
                        <Clock size={14} className={isCurrent ? "text-orange-500 animate-pulse" : "text-slate-400"} />
                        {Number(ev.durationHrs).toFixed(3)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono text-right">
                      {new Date(ev.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono text-right">
                      {isCurrent ? <span className="text-orange-500 animate-pulse font-bold">Ongoing</span> : new Date(ev.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
