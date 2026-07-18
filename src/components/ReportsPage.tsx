import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileSpreadsheet, Download, Search, Filter, CloudUpload } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ReportsPage({ productionRecords, showToast }: { productionRecords: any[], showToast?: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterType, setFilterType] = useState<'daily' | 'monthly' | 'yearly' | 'shift' | 'date_range'>('daily');
  const [filterValue, setFilterValue] = useState(() => {
    const today = new Date();
    // adjust to local YYYY-MM-DD easily
    const offset = today.getTimezoneOffset();
    const local = new Date(today.getTime() - (offset*60*1000));
    return local.toISOString().split('T')[0];
  });

  const syncAllToGoogleSheets = async () => {
    setIsSyncing(true);
    try {
      if (showToast) showToast('Starting data sync to Google Sheets...', 'info');
      const res = await fetch('/api/sync-all-sheets', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast('Successfully synced all data to Google Sheets.', 'success');
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

  const [filterValueEnd, setFilterValueEnd] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const local = new Date(today.getTime() - (offset*60*1000));
    return local.toISOString().split('T')[0];
  });
  const [shiftValue, setShiftValue] = useState('');

  const filteredRecords = useMemo(() => {
    return productionRecords.filter(record => {
      let match = true;
      if (filterType === 'daily' && filterValue) {
        match = record.ProductionDate === filterValue;
      } else if (filterType === 'monthly' && filterValue) {
        const monthYear = record.ProductionDate.substring(0, 7); // YYYY-MM
        match = monthYear === filterValue;
      } else if (filterType === 'yearly' && filterValue) {
        match = record.ProductionYear === filterValue;
      } else if (filterType === 'shift' && filterValue && shiftValue) {
        match = record.ProductionDate === filterValue && record.Shift === shiftValue;
      } else if (filterType === 'date_range' && filterValue && filterValueEnd) {
        match = record.ProductionDate >= filterValue && record.ProductionDate <= filterValueEnd;
      }
      return match;
    });
  }, [productionRecords, filterType, filterValue, filterValueEnd, shiftValue]);

  const summaryRecords = useMemo(() => {
    const summaryMap = new Map();
    filteredRecords.forEach(record => {
      const key = `${record.ProductionDate}_${record.MachineNo}`;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          Date: record.ProductionDate,
          MachineNo: record.MachineNo,
          FinishedMeter: 0,
          FinishedKG: 0,
          TotalRoll: 0,
          ScrapKG: 0
        });
      }
      const s = summaryMap.get(key);
      s.FinishedMeter += Number(record.FinishedMeter) || 0;
      s.FinishedKG += Number(record.FinishedKgs) || 0;
      s.TotalRoll += 1;
      s.ScrapKG += Number(record.ScrapKgs) || 0;
    });
    return Array.from(summaryMap.values()).sort((a, b) => a.Date.localeCompare(b.Date) || a.MachineNo.localeCompare(b.MachineNo));
  }, [filteredRecords]);

  const exportToExcel = () => {
    if (filteredRecords.length === 0) return;
    
    // Prepare data for export
    const exportData = filteredRecords.map(record => ({
      'Date': record.ProductionDate,
      'Shift': record.Shift,
      'Machine No': record.MachineNo,
      'Operator': record.OperatorName,
      'PINumber': record.PINumber,
      'Finished Meter': record.FinishedMeter,
      'Finished KG': record.FinishedKgs,
      'Scrap KG': record.ScrapKgs,
      'RollID': record.RollID,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `Production_Report_${filterType}_${filterValue}.xlsx`);
  };

  const totalFinishedKgs = filteredRecords.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0);
  const totalScrapKgs = filteredRecords.reduce((acc, curr) => acc + (Number(curr.ScrapKgs) || 0), 0);
  const totalFinishedMeter = filteredRecords.reduce((acc, curr) => acc + (Number(curr.FinishedMeter) || 0), 0);
  const totalRolls = filteredRecords.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-black text-slate-900 uppercase flex items-center gap-2">
            <FileSpreadsheet className="text-brand-primary" />
            Production Reports
          </h3>
          <p className="text-sm text-slate-500 font-medium tracking-tight">Generate and export reports based on daily, monthly, yearly, or shift-wise data.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={syncAllToGoogleSheets}
            disabled={isSyncing}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CloudUpload size={16} className={isSyncing ? "animate-bounce" : ""} />
            {isSyncing ? "Syncing..." : "Sync All to Sheets"}
          </button>
          <button 
            onClick={exportToExcel}
            disabled={filteredRecords.length === 0}
            className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Export to Excel
          </button>
        </div>
      </div>



      <div className="p-4 bg-white rounded-2xl border border-slate-200 flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Report Type</label>
          <select 
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as any);
              setFilterValue('');
              setFilterValueEnd('');
            }}
          >
            <option value="daily">Daily Report</option>
            <option value="monthly">Monthly Report</option>
            <option value="yearly">Yearly Report</option>
            <option value="shift">Shift-Wise Report</option>
            <option value="date_range">Custom Date Range</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {filterType === 'monthly' ? 'Select Month' : filterType === 'yearly' ? 'Select Year' : filterType === 'date_range' ? 'Start Date' : 'Select Date'}
          </label>
          <input 
            type={filterType === 'monthly' ? "month" : filterType === 'yearly' ? "number" : "date"}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={filterType === 'yearly' ? "YYYY" : ""}
          />
        </div>

        {filterType === 'date_range' && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              End Date
            </label>
            <input 
              type="date"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              value={filterValueEnd}
              onChange={(e) => setFilterValueEnd(e.target.value)}
            />
          </div>
        )}

        {filterType === 'shift' && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Shift</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              value={shiftValue}
              onChange={(e) => setShiftValue(e.target.value)}
            >
              <option value="">Select Shift</option>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </div>
        )}

      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-center items-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Finished Meter</span>
             <span className="text-3xl font-black text-slate-900">{totalFinishedMeter.toLocaleString()} <span className="text-sm">m</span></span>
        </div>
        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col justify-center items-center">
             <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Finished (KG)</span>
             <span className="text-3xl font-black text-emerald-700">{totalFinishedKgs.toFixed(2)} <span className="text-sm">KG</span></span>
        </div>
        <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex flex-col justify-center items-center">
             <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1">Total Scrap (KG)</span>
             <span className="text-3xl font-black text-rose-700">{totalScrapKgs.toFixed(2)} <span className="text-sm">KG</span></span>
        </div>
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col justify-center items-center">
             <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Total Rolls</span>
             <span className="text-3xl font-black text-blue-700">{totalRolls}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
             <Search size={16} className="text-slate-400" />
             Report Preview
          </h4>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Machine No</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Finished Meter</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Finished KG</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Roll</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Scrap KG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaryRecords.length > 0 ? (
                  summaryRecords.map((record, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-medium text-slate-700">{record.Date}</td>
                        <td className="p-4 font-bold text-slate-800">{record.MachineNo}</td>
                        <td className="p-4 font-medium text-blue-600">{record.FinishedMeter}</td>
                        <td className="p-4 font-bold text-emerald-600">{record.FinishedKG}</td>
                        <td className="p-4 font-medium text-brand-primary">{record.TotalRoll}</td>
                        <td className="p-4 font-bold text-rose-500">{record.ScrapKG}</td>
                    </tr>
                  ))
              ) : (
                  <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500 text-sm font-medium">
                          No records found for the selected filter.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
