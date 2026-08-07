import React, { useState, useEffect } from 'react';
import { 
  Factory, 
  BarChart3, 
  Settings, 
  Users, 
  LayoutDashboard, 
  PlusCircle, 
  History,
  AlertCircle,
  Menu,
  Clock,
  TrendingUp,
  Package,
  Layers,
  Container,
  User as UserIcon,
  Hash,
  Ruler,
  Weight,
  MapPin,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Box,
  Activity,
  ChevronDown,
  Database,
  RefreshCw,
  LogOut,
  CalendarDays,
  FileSpreadsheet,
  Search,
  Edit3,
  X,
  Printer,
  QrCode,
  FileUp,
  FolderOpen,
  UploadCloud,
  Trash2,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate, getShiftAndDateForDhaka, normalizeDateString } from './lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import ReportsPage from './components/ReportsPage';
import BreakdownDataTable from './components/BreakdownDataTable';
import PendingOrderPage from './components/PendingOrderPage';

// Types
interface ProductionEntry {
  ProductionDate: string;
  Shift: string;
  ProductionType: string;
  OperatorID: string;
  MachineNo: string;
  Year: string;
  PINumber: string;
  TubeSize: string;
  UOM: string;
  Material: string;
  Micron: string;
  InLinePrint: string;
  FinishedMeter: string;
  FinishedKgs: string;
  RollLocation: string;
  RollID?: string;
  ScrapKgs: string;
  OperatorName: string;
  MachineStatus: string;
  DataUpdateTime?: string;
  Fingerprint?: string;
  EnteredBy?: string;
  ProductionYear?: string;
  ProductionMonth?: string;
  Retailer?: string;
  Customer?: string;
}

interface MachineSummary {
  Date: string;
  MachineNo: string;
  TargetKgs: number;
  TotalRolls: number;
  TotalMeter: number;
  TotalProductionKgs: number;
  MachineStatus: 'Running' | 'Idle' | 'Breakdown' | string;
  BreakdownType: string;
  ReasonOfIdle: string;
  LastUpdateTime: string;
  BreakdownNoOfTimes: number;
  BreakdownDurationMins: number;
  IdleNoOfTimes: number;
  IdleDurationMins: number;
  LastUpdate?: string;
  Reason?: string;
}

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

interface OperatorMaster {
  id: string;
  name: string;
  email: string;
}

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// Mock trend data
const trendData = [
  { time: '08:00', prod: 240 },
  { time: '09:00', prod: 310 },
  { time: '10:00', prod: 450 },
  { time: '11:00', prod: 380 },
  { time: '12:00', prod: 520 },
  { time: '13:00', prod: 480 },
  { time: '14:00', prod: 610 },
  { time: '15:00', prod: 720 },
];

const formatMachineDuration = (hoursNum: number): string => {
  if (!hoursNum || hoursNum <= 0) return "0s";
  const totalSeconds = Math.round(hoursNum * 3600);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    if (remainingSeconds > 0) {
      return `${totalMinutes}m ${remainingSeconds}s`;
    }
    return `${totalMinutes}m`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes > 0) {
    return `${totalHours}h ${remainingMinutes}m`;
  }
  return `${totalHours}h`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'entry' | 'dashboard' | 'history' | 'machines' | 'master-config' | 'operators' | 'master-production-record' | 'sample-production' | 'breakdown-data' | 'reports'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dashboardDateFilter, setDashboardDateFilter] = useState<string>('');
  const [sampleFilterMode, setSampleFilterMode] = useState<'last10' | 'selected' | 'all'>('last10');
  
  // Calculate Bangladesh shift and operational production date
  const initialShiftInfo = getShiftAndDateForDhaka();

  const [formData, setFormData] = useState<ProductionEntry>({
    ProductionDate: initialShiftInfo.productionDate,
    Shift: initialShiftInfo.shift,
    ProductionType: '',
    OperatorID: '',
    MachineNo: '',
    Year: '',
    PINumber: '',
    TubeSize: '',
    UOM: '',
    Material: '',
    Micron: '',
    InLinePrint: '',
    FinishedMeter: '',
    FinishedKgs: '',
    RollLocation: '',
    ScrapKgs: '',
    OperatorName: '',
    MachineStatus: 'Running'
  });

  const [dashboardData, setDashboardData] = useState<{ summary: MachineSummary[], dailyTotals: any } | null>(null);
  const [machines, setMachines] = useState<MachineMaster[]>([]);
  const [operators, setOperators] = useState<OperatorMaster[]>([]);
  const [productionRecords, setProductionRecords] = useState<ProductionEntry[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [nextRollId, setNextRollId] = useState<string>('');
  const [previousRollId, setPreviousRollId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [masterStore, setMasterStore] = useState<any>({
    shifts: ['Day', 'Night', 'A', 'B', 'C'],
    productionTypes: ['Commercial', 'R&D', 'Trial', 'Sample'],
    uoms: ['Kgs', 'Rolls', 'Meter', 'INCH'],
    materials: ['LDPE', 'HDPE', 'LLDPE', 'PP', 'BOPP'],
    inlinePrintOptions: ['Yes', 'No'],
    years: ['2023', '2024', '2025', '2026', '2027'],
    breakdownReasons: ['Mechanical', 'Electrical', 'Pneumatic', 'Hydraulic', 'Sensor Failure', 'Heater Band Burnout'],
    idleReasons: ['No Material', 'No Operator', 'Power Interruption', 'Core Shortage', 'Routine Clean-up', 'Awaiting Maintenance Handover'],
    machineList: ['M-01', 'M-02', 'M-03', 'M-04', 'M-05']
  });

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, type: string, title: string } | null>(null);
  const [newMasterItem, setNewMasterItem] = useState("");
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [printEntry, setPrintEntry] = useState<any | null>(null);
  const [recordSearchQuery, setRecordSearchQuery] = useState("");
  const [feedSearchQuery, setFeedSearchQuery] = useState("");
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOrderInfo, setPendingOrderInfo] = useState<{
    filename: string;
    uploadedAt: string;
    totalRows?: number;
    webViewLink: string;
    spreadsheetId?: string;
  } | null>(null);
  const [isUploadingPendingOrder, setIsUploadingPendingOrder] = useState(false);
  const [isDeletingPendingOrder, setIsDeletingPendingOrder] = useState(false);

  const fetchPendingOrderInfo = async () => {
    try {
      const res = await fetch("/api/pending-orders/current");
      if (res.ok) {
        const data = await res.json();
        setPendingOrderInfo(data);
      }
    } catch (err) {
      console.error("Error fetching pending order info:", err);
    }
  };

  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [isSavingSheetConfig, setIsSavingSheetConfig] = useState(false);
  const [isTestingSheetConfig, setIsTestingSheetConfig] = useState(false);
  const [isSyncingAllSheets, setIsSyncingAllSheets] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; title?: string; tabs?: string[]; message?: string; error?: string } | null>(null);

  const fetchGoogleSheetSettings = async () => {
    try {
      const emailRes = await fetch('/api/settings/google-service-account');
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        setServiceAccountEmail(emailData.email || '');
      }
      
      const configRes = await fetch('/api/settings/google-sheet-config');
      if (configRes.ok) {
        const configData = await configRes.json();
        setSpreadsheetId(configData.spreadsheetId || '');
      }
    } catch (err) {
      console.error("Error fetching google sheet settings", err);
    }
  };

  const saveGoogleSheetSettings = async () => {
    setIsSavingSheetConfig(true);
    try {
      const res = await fetch('/api/settings/google-sheet-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ spreadsheetId })
      });
      if (res.ok) {
        showToast("Google Sheet ID updated successfully / গুগল শীট আইডি সফলভাবে আপডেট হয়েছে", "success");
      } else {
        showToast("Failed to update Google Sheet ID", "error");
      }
    } catch (err) {
      showToast("Network error", "error");
    } finally {
      setIsSavingSheetConfig(false);
    }
  };

  const testGoogleSheetSettings = async () => {
    setIsTestingSheetConfig(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test-google-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          title: data.title,
          tabs: data.tabs,
          message: data.message
        });
        showToast("Connected to Google Sheets successfully! / গুগল শীটের সাথে সফলভাবে সংযোগ হয়েছে!", "success");
      } else {
        setTestResult({
          success: false,
          error: data.error || "Failed to connect to Google Sheets."
        });
        showToast("Connection failed! Check guidelines below / সংযোগ ব্যর্থ হয়েছে!", "error");
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: "Network error or server timeout. Please double-check spreadsheet permission and ID."
      });
      showToast("Network error during test", "error");
    } finally {
      setIsTestingSheetConfig(false);
    }
  };

  const syncAllSheets = async () => {
    setIsSyncingAllSheets(true);
    try {
      const res = await fetch('/api/sync-all-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Full database resynced to Google Sheets successfully! / গুগল শীটে সম্পূর্ণ ডাটা পুনরায় সফলভাবে সিঙ্ক করা হয়েছে!", "success");
      } else {
        showToast(data.message || "Failed to sync sheets", "error");
      }
    } catch (err: any) {
      showToast("Network error during sync", "error");
    } finally {
      setIsSyncingAllSheets(false);
    }
  };
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const afterPrint = () => setPrintEntry(null);
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === 'breakdown-data' || activeTab === 'machines') {
      fetchMachines();
    }
    if (activeTab === 'master-production-record' || activeTab === 'sample-production' || activeTab === 'reports') {
      fetchProductionRecords();
    }
    if (activeTab === 'pending-order') {
      fetchPendingOrderInfo();
    }
    if (activeTab === 'master-config') {
      fetchGoogleSheetSettings();
    }
  }, [activeTab]);

  const [machineFormData, setMachineFormData] = useState({
    id: '',
    type: '',
    target: ''
  });

  const filterRef = React.useRef(dashboardDateFilter);
  useEffect(() => {
    filterRef.current = dashboardDateFilter;
  }, [dashboardDateFilter]);

  const fetchDateFilter = async () => {
    try {
      const res = await fetch('/api/settings/date-filter');
      const data = await res.json();
      if (res.ok && data.dateFilter) {
        setDashboardDateFilter(data.dateFilter);
        return data.dateFilter;
      }
    } catch (err) {
      console.error("Failed to fetch date filter", err);
    }
    return '';
  };

  const updateDateFilter = async (newDate: string) => {
    setDashboardDateFilter(newDate);
    try {
      await fetch('/api/settings/date-filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dateFilter: newDate })
      });
    } catch (err) {
      console.error("Failed to save date filter", err);
    }
  };

  useEffect(() => {
    const initFetch = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const loadedFilter = await fetchDateFilter();
        await Promise.all([
          fetchDashboard(loadedFilter || undefined),
          fetchMachines(loadedFilter || undefined),
          fetchOperators(),
          fetchRecentEntries(),
          fetchNextRollId(),
          fetchPreviousRollId(),
          fetchMasterStore(),
          fetchPendingOrderInfo()
        ]);
      } catch (err: any) {
        setFetchError("ডিপেনডেন্সি লোড করতে সমস্যা হয়েছে। ডাটাবেস এরর হতে পারে।");
      } finally {
        setIsLoading(false);
      }
    };

    initFetch();

    const interval = setInterval(async () => {
      let filter = filterRef.current;
      try {
        const res = await fetch('/api/settings/date-filter');
        const data = await res.json();
        if (res.ok && data.dateFilter && data.dateFilter !== filterRef.current) {
          setDashboardDateFilter(data.dateFilter);
          filter = data.dateFilter;
        }
      } catch (err: any) {
        console.error("Failed to sync date filter on interval. Error:", err.message);
      }
      fetchDashboard(filter || undefined);
      fetchRecentEntries();
      fetchNextRollId();
      fetchPreviousRollId();
    }, 180000); // 3 minutes interval
    return () => clearInterval(interval);
  }, []);

  const fetchMasterStore = async () => {
    try {
      const res = await fetch('/api/master-store');
      const data = await res.json();
      if (res.ok) {
        const cleanedData = { ...data };
        for (const key of Object.keys(cleanedData)) {
          if (Array.isArray(cleanedData[key])) {
            cleanedData[key] = Array.from(new Set(cleanedData[key]));
          }
        }
        setMasterStore((prev: any) => ({ ...prev, ...cleanedData }));
      }
    } catch (err) {
      console.error("Failed to fetch master store", err);
    }
  };

  const fetchDashboard = async (dateOverride?: string) => {
    try {
      const dhakaShiftInfo = getShiftAndDateForDhaka();
      const dateParam = dateOverride || dashboardDateFilter || dhakaShiftInfo.productionDate;
      console.log(`[fetchDashboard] dateParam: ${dateParam}, dashboardDateFilter: ${dashboardDateFilter}, dhakaShiftInfo:`, dhakaShiftInfo);
      const res = await fetch(`/api/dashboard?date=${dateParam}`);
      const data = await res.json();
      if (res.ok) {
        setDashboardData(data);
      } else {
        console.error("Dashboard API error:", data.error);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard", err);
    }
  };

  // Ensure active tab or dashboardDateFilter triggers dashboard refresh
  useEffect(() => {
    if (activeTab === 'dashboard' || dashboardDateFilter) {
      fetchDashboard();
    }
  }, [activeTab, dashboardDateFilter]);

  const fetchRecentEntries = async () => {
    try {
      const res = await fetch('/api/production/recent');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        // Sort by timestamp descending
        const sorted = [...data].sort((a, b) => new Date(b.EntryTimestamp).getTime() - new Date(a.EntryTimestamp).getTime());
        setRecentEntries(sorted);
      } else {
        console.error("Production API error or non-array data:", data);
        setRecentEntries([]);
      }
    } catch (err) {
      console.error("Failed to fetch recent entries", err);
      setRecentEntries([]);
    }
  };

  const fetchProductionRecords = async () => {
    try {
      const res = await fetch('/api/production');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        const sorted = [...data].sort((a, b) => new Date(b.EntryTimestamp).getTime() - new Date(a.EntryTimestamp).getTime());
        setProductionRecords(sorted);
        console.log("Production records count:", sorted.length);
        if (sorted.length > 0) console.log("First record:", sorted[0]);
      } else {
        setProductionRecords([]);
      }
    } catch (err) {
      console.error("Failed to fetch production records", err);
      setProductionRecords([]);
    }
  };

  const fetchNextRollId = async () => {
    try {
      const res = await fetch('/api/next-roll-id');
      const data = await res.json();
      if (res.ok && data.nextId) {
        setNextRollId(data.nextId);
      }
    } catch (err) {
      console.error("Failed to fetch next roll id", err);
    }
  };

  const fetchPreviousRollId = async () => {
    try {
      const res = await fetch('/api/previous-roll-id');
      const data = await res.json();
      if (res.ok && data.previousId) {
        setPreviousRollId(data.previousId);
      }
    } catch (err) {
      console.error("Failed to fetch previous roll id", err);
    }
  };

  const fetchMachines = async (dateOverride?: string) => {
    try {
      const dhakaShiftInfo = getShiftAndDateForDhaka();
      const dateParam = dateOverride || dashboardDateFilter || dhakaShiftInfo.productionDate;
      const res = await fetch(`/api/machines?date=${dateParam}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setMachines(data);
      } else {
        setMachines([]);
      }
    } catch (err) {
      console.error("Failed to fetch machines", err);
      setMachines([]);
    }
  };

  useEffect(() => {
    if (activeTab === 'breakdown-data' || activeTab === 'machines' || dashboardDateFilter) {
      fetchMachines();
    }
  }, [dashboardDateFilter, activeTab]);

  const fetchOperators = async () => {
    try {
      const res = await fetch('/api/operators');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setOperators(data);
      } else {
        setOperators([]);
      }
    } catch (err) {
      console.error("Failed to fetch operators", err);
      setOperators([]);
    }
  };

  const handleReasonChange = async (m: MachineMaster, newReason: string) => {
    try {
      const parentNow = new Date().toISOString();
      const oldReason = m.reason || '';
      const oldStatus = m.status;

      const updates: Partial<MachineMaster> = {
        reason: newReason,
        lastStatusChange: parentNow
      };

      // 1. If previously it did NOT have a reason (so reason was "" or "NO_ALERTS"):
      //    We are STARTING the downtime now!
      //    We must increment the event counter now.
      if (oldReason === "" || oldReason === "NO_ALERTS") {
        if (oldStatus === 'Idle') {
          updates.numIdle = (m.numIdle || 0) + 1;
        } else if (oldStatus === 'Breakdown') {
          updates.numBreakdown = (m.numBreakdown || 0) + 1;
        }
      } else {
        // Previously DID have a reason, so we are switching from one reason to another.
        // We finalize the previous reason slice!
        if (m.lastStatusChange) {
          const elapsedMs = Date.now() - new Date(m.lastStatusChange).getTime();
          const elapsedHours = Number(Math.max(0, elapsedMs / (1000 * 60 * 60)).toFixed(3)) || 0;
          if (oldStatus === 'Idle') {
            updates.idleTime = Number(((m.idleTime || 0) + elapsedHours).toFixed(3));
          } else if (oldStatus === 'Breakdown') {
            updates.breakdownTime = Number(((m.breakdownTime || 0) + elapsedHours).toFixed(3));
          }
        }
      }

      // Update locally immediately
      setMachines(prev => prev.map(mach => mach.id === m.id ? { ...mach, ...updates } : mach));

      const dhakaShiftInfoLoc = getShiftAndDateForDhaka(new Date(parentNow));
      const updateDateLoc = dashboardDateFilter || dhakaShiftInfoLoc.productionDate;
      const res = await fetch('/api/machines/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, date: updateDateLoc, ...updates })
      });
      if (res.ok) {
        showToast("Reason updated successfully and saved everywhere", 'success');
        fetchMachines();
        fetchDashboard();
      } else {
        showToast("Failed to change reason", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to change reason", 'error');
    }
  };

  const updateMachineStatus = async (id: string, updates: Partial<MachineMaster>) => {
    try {
      const dhakaShiftInfo = getShiftAndDateForDhaka();
      const updateDate = dashboardDateFilter || dhakaShiftInfo.productionDate;
      const res = await fetch('/api/machines/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, date: updateDate, ...updates })
      });
      if (res.ok) {
        showToast("Machine updated successfully", 'success');
        fetchMachines();
        fetchDashboard();
      }
    } catch (err) {
      showToast("Update failed", 'error');
    }
  };

  const handleMachineStateChange = async (m: MachineMaster, newStatus: 'Running' | 'Idle' | 'Breakdown') => {
    try {
      const parentNow = new Date().toISOString();
      const updates: Partial<MachineMaster> = {
        status: newStatus
      };

      const oldStatus = m.status;
      const oldReason = m.reason || '';

      // 1. Calculate elapsed time in previous state if applicable (only if it was active/had a valid reason)
      if (oldStatus === 'Idle' || oldStatus === 'Breakdown') {
        if (oldReason !== "" && oldReason !== "NO_ALERTS" && m.lastStatusChange) {
          const elapsedMs = Date.now() - new Date(m.lastStatusChange).getTime();
          const elapsedHours = Number(Math.max(0, elapsedMs / (1000 * 60 * 60)).toFixed(3)) || 0;
          if (oldStatus === 'Idle') {
            updates.idleTime = Number(((m.idleTime || 0) + elapsedHours).toFixed(3));
          } else if (oldStatus === 'Breakdown') {
            updates.breakdownTime = Number(((m.breakdownTime || 0) + elapsedHours).toFixed(3));
          }
        }
      }

      // 2. Clear reason and do NOT initialize lastStatusChange, nor increment event counter until a reason is chosen
      if (newStatus === 'Idle') {
        updates.reason = "";
        updates.lastStatusChange = "";
      } else if (newStatus === 'Breakdown') {
        updates.reason = "";
        updates.lastStatusChange = "";
      } else if (newStatus === 'Running') {
        updates.reason = 'NO_ALERTS';
        updates.lastStatusChange = parentNow;
      }

      // Update locally immediately for snappy interface feedback
      setMachines(prev => prev.map(mach => mach.id === m.id ? { ...mach, ...updates } : mach));

      const dhakaShiftInfoLoc2 = getShiftAndDateForDhaka(new Date(parentNow));
      const updateDateLoc2 = dashboardDateFilter || dhakaShiftInfoLoc2.productionDate;
      const res = await fetch('/api/machines/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, date: updateDateLoc2, ...updates })
      });
      if (res.ok) {
        showToast(`Machine status set to ${newStatus}`, 'success');
        fetchMachines();
        fetchDashboard();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to change machine status", 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Auto-fill operator name if OperatorID is changed
    if (name === 'OperatorID') {
      const operator = operators.find(o => o.id === value);
      if (operator) {
        setFormData(prev => ({ 
          ...prev, 
          OperatorID: value,
          OperatorName: operator.name 
        }));
        return;
      }
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isFormValid = formData.OperatorID && 
                      formData.FinishedKgs && 
                      formData.Micron && 
                      formData.TubeSize && 
                      formData.FinishedMeter &&
                      formData.PINumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Only check mandatory fields visible to user
    const mandatoryFields = [
      'ProductionType', 'OperatorID', 'MachineNo', 'Year', 'PINumber', 
      'TubeSize', 'UOM', 'Material', 'Micron', 'InLinePrint', 
      'FinishedMeter', 'FinishedKgs', 'ScrapKgs', 'RollLocation'
    ];
    
    const isAnyFieldBlank = mandatoryFields.some(key => {
      const val = (formData as any)[key];
      return val === undefined || val === null || val === '';
    });

    if (isAnyFieldBlank) {
      showToast("Please complete all required fields before saving data.", 'error');
      return;
    }

    setIsLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const productionTypePrefix = formData.ProductionType === 'Sample' ? 'SMPL' : 'MPBL';
      let finalPINumber = formData.PINumber;
      if (!finalPINumber.includes('/')) {
        finalPINumber = `${productionTypePrefix}/${formData.PINumber}/${formData.Year}`;
      } else {
        if (formData.ProductionType === 'Sample') {
          finalPINumber = finalPINumber.replace(/^MPBL\//i, 'SMPL/');
        } else {
          finalPINumber = finalPINumber.replace(/^SMPL\//i, 'MPBL/');
        }
      }

      const res = await fetch('/api/production', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...formData, PINumber: finalPINumber })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Production Entry Saved Successfully", 'success');
        
        fetchDashboard();
        fetchRecentEntries();
        if (activeTab === 'master-production-record' || activeTab === 'sample-production' || activeTab === 'reports') {
          fetchProductionRecords();
        }
        fetchNextRollId();
        fetchPreviousRollId();
        const nextShiftInfo = getShiftAndDateForDhaka();
        // Clear the entire form on successful data transmission
        setFormData({
          ProductionDate: nextShiftInfo.productionDate,
          Shift: nextShiftInfo.shift,
          ProductionType: '',
          OperatorID: '',
          OperatorName: '',
          MachineNo: '',
          Year: '',
          PINumber: '',
          TubeSize: '',
          UOM: '',
          Material: '',
          Micron: '',
          InLinePrint: '',
          FinishedMeter: '',
          FinishedKgs: '',
          ScrapKgs: '',
          RollLocation: '',
          MachineStatus: 'Running'
        });
      } else {
        showToast(data.message || "Error saving entry", 'error');
      }
    } catch (err) {
      showToast("Network error", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !editingEntry.RollID) return;
    
    let updatedPI = editingEntry.PINumber || "";
    if (editingEntry.ProductionType === 'Sample') {
      updatedPI = updatedPI.replace(/^MPBL\//i, 'SMPL/');
    } else {
      updatedPI = updatedPI.replace(/^SMPL\//i, 'MPBL/');
    }

    setIsSavingEdit(true);
    try {
      const res = await fetch('/api/production/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...editingEntry, PINumber: updatedPI })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Entry Updated Successfully", 'success');
        setEditingEntry(null);
        await Promise.all([
          fetchDashboard(),
          fetchRecentEntries()
        ]);
        if (activeTab === 'master-production-record' || activeTab === 'sample-production' || activeTab === 'reports') {
          fetchProductionRecords();
        }
      } else {
        showToast(data.message || "Failed to update entry", 'error');
      }
    } catch (err) {
      showToast("Network error during update", 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Current Dhaka date & shift information
  const dhakaShiftInfo = getShiftAndDateForDhaka();
  const currentProductionDateStr = dashboardDateFilter || dhakaShiftInfo.productionDate; // e.g. "2026-05-22"

  // Filter records belonging to the current operational date
  const todayRecords = dashboardDateFilter 
    ? productionRecords.filter((record: any) => normalizeDateString(record.ProductionDate) === dashboardDateFilter)
    : productionRecords.filter((record: any) => {
        const normalized = normalizeDateString(record.ProductionDate);
        if (normalized !== currentProductionDateStr && record.Shift === 'Day') {
            console.log("Date mismatch:", record.ProductionDate, "->", normalized, "vs", currentProductionDateStr);
        }
        return normalized === currentProductionDateStr;
      });


  // Day shift records for the current operational date
  const todayDayRecords = todayRecords.filter((record: any) => record.Shift === 'Day');
  
  // Night shift records for the current operational date
  const todayNightRecords = todayRecords.filter((record: any) => record.Shift === 'Night');

  // Other shifts (e.g. A, B, C) if any records exist
  const todayOtherRecords = todayRecords.filter((record: any) => record.Shift !== 'Day' && record.Shift !== 'Night');

  // Today calculations
  const todayTotalKgs = todayRecords.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0);
  const todayTotalRolls = todayRecords.length;
  const todayTotalMeter = todayRecords.reduce((acc, curr) => acc + (Number(curr.FinishedMeter) || 0), 0);
  const todayTotalScrap = todayRecords.reduce((acc, curr) => acc + (Number(curr.ScrapKgs) || 0), 0);

  const allTimeTotalKgs = productionRecords.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0);
  const totalTarget = machines.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
  const efficiency = totalTarget > 0 ? ((todayTotalKgs / totalTarget) * 100).toFixed(1) : "0.0";

  // Day shift calculations
  const todayDayTotalKgs = todayDayRecords.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0);
  const todayDayTotalRolls = todayDayRecords.length;
  const todayDayTotalMeter = todayDayRecords.reduce((acc, curr) => acc + (Number(curr.FinishedMeter) || 0), 0);
  const todayDayTotalScrap = todayDayRecords.reduce((acc, curr) => acc + (Number(curr.ScrapKgs) || 0), 0);

  // Night shift calculations
  const todayNightTotalKgs = todayNightRecords.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0);
  const todayNightTotalRolls = todayNightRecords.length;
  const todayNightTotalMeter = todayNightRecords.reduce((acc, curr) => acc + (Number(curr.FinishedMeter) || 0), 0);
  const todayNightTotalScrap = todayNightRecords.reduce((acc, curr) => acc + (Number(curr.ScrapKgs) || 0), 0);

  const filteredRecords = productionRecords.filter((record: any) => {
    const filterDate = dashboardDateFilter || getShiftAndDateForDhaka().productionDate;
    if (filterDate && normalizeDateString(record.ProductionDate) !== filterDate) return false;
    if (!recordSearchQuery) return true;
    const q = recordSearchQuery.toLowerCase().trim();
    return (
      (record.RollID || "").toLowerCase().includes(q) ||
      (record.OperatorName || "").toLowerCase().includes(q) ||
      (record.OperatorID || "").toLowerCase().includes(q) ||
      (record.MachineNo || "").toLowerCase().includes(q) ||
      (record.PINumber || "").toString().toLowerCase().includes(q) ||
      (record.Material || "").toLowerCase().includes(q) ||
      (record.ProductionDate || "").toLowerCase().includes(q) ||
      (record.RollLocation || "").toLowerCase().includes(q) ||
      (record.ProductionType || "").toLowerCase().includes(q)
    );
  }).sort((a: any, b: any) => {
    if (!recordSearchQuery) return 0;
    const q = recordSearchQuery.toLowerCase().trim();
    // Prioritize if RollID, OperatorName, MachineNo, etc starts with query
    const aStarts = [
        a.RollID, a.OperatorName, a.OperatorID, a.MachineNo, a.PINumber?.toString(), a.Material, a.RollLocation, a.ProductionType
    ].some(val => String(val || "").toLowerCase().startsWith(q));
    
    const bStarts = [
        b.RollID, b.OperatorName, b.OperatorID, b.MachineNo, b.PINumber?.toString(), b.Material, b.RollLocation, b.ProductionType
    ].some(val => String(val || "").toLowerCase().startsWith(q));

    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    // Secondary sort: prioritize earlier matches within the searched strings
    const aMinIndex = Math.min(
        ...[a.RollID, a.OperatorName, a.OperatorID, a.MachineNo, a.PINumber?.toString(), a.Material, a.RollLocation, a.ProductionType]
        .map(val => String(val || "").toLowerCase().indexOf(q))
        .filter(idx => idx !== -1)
    );
    const bMinIndex = Math.min(
        ...[b.RollID, b.OperatorName, b.OperatorID, b.MachineNo, b.PINumber?.toString(), b.Material, b.RollLocation, b.ProductionType]
        .map(val => String(val || "").toLowerCase().indexOf(q))
        .filter(idx => idx !== -1)
    );

    if (aMinIndex >= 0 && bMinIndex >= 0 && aMinIndex !== bMinIndex) return aMinIndex - bMinIndex;

    return 0;
  });

  const filteredSampleRecords = React.useMemo(() => {
    return productionRecords.filter((record: any) => {
      if (record.ProductionType !== 'Sample') return false;

      const recordDateStr = normalizeDateString(record.ProductionDate);
      const baseDateStr = dashboardDateFilter || getShiftAndDateForDhaka().productionDate;

      if (sampleFilterMode === 'selected') {
        if (recordDateStr !== baseDateStr) return false;
      } else if (sampleFilterMode === 'last10') {
        const recordTime = new Date(recordDateStr).getTime();
        const baseTime = new Date(baseDateStr).getTime();
        if (!isNaN(recordTime) && !isNaN(baseTime)) {
          const diffTime = baseTime - recordTime;
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          if (diffDays < -1 || diffDays > 9) return false;
        } else {
          return false;
        }
      }

      if (!recordSearchQuery) return true;
      const q = recordSearchQuery.toLowerCase().trim();
      return (
        (record.RollID || "").toLowerCase().includes(q) ||
        (record.OperatorName || "").toLowerCase().includes(q) ||
        (record.OperatorID || "").toLowerCase().includes(q) ||
        (record.MachineNo || "").toLowerCase().includes(q) ||
        (record.PINumber || "").toString().toLowerCase().includes(q) ||
        (record.Material || "").toLowerCase().includes(q) ||
        (record.ProductionDate || "").toLowerCase().includes(q) ||
        (record.RollLocation || "").toLowerCase().includes(q)
      );
    }).sort((a: any, b: any) => {
      const dateA = new Date(normalizeDateString(a.ProductionDate)).getTime();
      const dateB = new Date(normalizeDateString(b.ProductionDate)).getTime();
      if (dateA !== dateB) {
        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
      }
      const timeA = new Date(a.EntryTimestamp || 0).getTime();
      const timeB = new Date(b.EntryTimestamp || 0).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  }, [productionRecords, sampleFilterMode, dashboardDateFilter, recordSearchQuery]);

  const filteredFeed = recentEntries.filter((entry: any) => {
    if (!feedSearchQuery) return true;
    const q = feedSearchQuery.toLowerCase().trim();
    return (
      (entry.RollID || "").toLowerCase().includes(q) ||
      (entry.OperatorID || "").toLowerCase().includes(q) ||
      (entry.OperatorName || "").toLowerCase().includes(q) ||
      (entry.MachineNo || "").toLowerCase().includes(q) ||
      (entry.Material || "").toLowerCase().includes(q) ||
      (entry.RollLocation || "").toLowerCase().includes(q) ||
      (entry.ProductionType || "").toLowerCase().includes(q) ||
      (entry.Shift || "").toLowerCase().includes(q)
    );
  }).sort((a: any, b: any) => {
    if (!feedSearchQuery) return 0;
    const q = feedSearchQuery.toLowerCase().trim();
    const aStarts = [
        a.RollID, a.OperatorName, a.OperatorID, a.MachineNo, a.Material, a.RollLocation, a.ProductionType, a.Shift
    ].some(val => String(val || "").toLowerCase().startsWith(q));
    
    const bStarts = [
        b.RollID, b.OperatorName, b.OperatorID, b.MachineNo, b.Material, b.RollLocation, b.ProductionType, b.Shift
    ].some(val => String(val || "").toLowerCase().startsWith(q));

    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    // Secondary sort: prioritize earlier matches within the searched strings
    const aMinIndex = Math.min(
        ...[a.RollID, a.OperatorName, a.OperatorID, a.MachineNo, a.Material, a.RollLocation, a.ProductionType, a.Shift]
        .map(val => String(val || "").toLowerCase().indexOf(q))
        .filter(idx => idx !== -1)
    );
    const bMinIndex = Math.min(
        ...[b.RollID, b.OperatorName, b.OperatorID, b.MachineNo, b.Material, b.RollLocation, b.ProductionType, b.Shift]
        .map(val => String(val || "").toLowerCase().indexOf(q))
        .filter(idx => idx !== -1)
    );

    if (aMinIndex >= 0 && bMinIndex >= 0 && aMinIndex !== bMinIndex) return aMinIndex - bMinIndex;

    return 0;
  });

  const displayedFeed = feedSearchQuery ? filteredFeed : filteredFeed.slice(0, 7);
  const metricsFeed = recentEntries.slice(0, 7);

  return (
    <>
      {printEntry && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 print:bg-transparent print:p-0">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full print:p-0 print:shadow-none print:rounded-none">
            <h2 className="text-lg font-bold text-slate-800 mb-4 print:hidden flex items-center justify-between">
              Sticker Preview
              <button 
                type="button" 
                onClick={() => setPrintEntry(null)} 
                className="p-2 bg-slate-100/50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                title="Close Window"
              >
                <X size={16} />
              </button>
            </h2>

            <div className="w-[3in] h-[2in] p-2 bg-white m-0 text-black mx-auto overflow-hidden text-center relative border border-slate-200 print:border-none flex flex-col justify-between" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <div className="flex justify-between items-stretch gap-2 h-full">
                {/* Left side: QR Code and Roll ID */}
                <div className="flex flex-col items-center justify-center w-[45%] border-[2px] border-black p-1 h-full bg-white relative">
                  <QRCodeSVG value={printEntry.RollID} size={70} level="H" />
                  <span className="text-sm font-black mt-2 leading-none tracking-tighter text-center pt-2 border-t-[2px] border-black w-full absolute bottom-1.5">{printEntry.RollID}</span>
                </div>
                {/* Right side: Information */}
                <div className="w-[55%] flex flex-col justify-between h-full space-y-1">
                  <div className="flex justify-between items-end border-[2px] border-black p-[5px] bg-slate-50 border-b-[3px]">
                     <div className="flex flex-col text-left">
                        <span className="text-[7px] font-bold uppercase text-slate-500 leading-none mb-[3px] tracking-widest font-mono">Weight</span>
                        <span className="text-xl font-black leading-none tracking-tighter">{printEntry.FinishedKgs}<span className="text-[10px] font-bold ml-0.5">KG</span></span>
                     </div>
                     <div className="flex flex-col text-right">
                        <span className="text-[7px] font-bold uppercase text-slate-500 leading-none mb-[3px] tracking-widest font-mono">Length</span>
                        <span className="text-xl font-black leading-none tracking-tighter">{printEntry.FinishedMeter}<span className="text-[10px] font-bold ml-0.5">m</span></span>
                     </div>
                  </div>
                  <div className="flex justify-between items-start border-[2px] border-black p-1">
                     <div className="flex flex-col text-left">
                        <span className="text-[7px] font-bold uppercase text-slate-500 leading-[8px] tracking-widest font-mono">Machine</span>
                        <span className="text-xs font-black leading-tight uppercase truncate max-w-[65px]">{printEntry.MachineNo}</span>
                     </div>
                     <div className="flex flex-col text-right">
                        <span className="text-[7px] font-bold uppercase text-slate-500 leading-[8px] tracking-widest font-mono">Material</span>
                        <span className="text-xs font-black leading-tight uppercase truncate max-w-[65px]">{printEntry.Material}</span>
                     </div>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 text-left border-[2px] border-black p-1 bg-white font-mono object-contain flex-col justify-between flex-1">
                    <div className="flex justify-between border-b border-gray-300 pb-0.5">
                      <span className="text-[7px] font-bold uppercase text-slate-500">PI/Yr:</span>
                      <span className="text-[8px] font-black text-black uppercase">{printEntry.PINumber} / {printEntry.Year}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-300 pb-0.5">
                      <span className="text-[7px] font-bold uppercase text-slate-500">Opr:</span>
                      <span className="text-[8px] font-bold text-black uppercase truncate max-w-[90px]">{printEntry.OperatorID} - {printEntry.OperatorName?.split(" ")[0]}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[7px] font-bold uppercase text-slate-500">Date/Shift:</span>
                      <span className="text-[8px] font-bold text-black uppercase whitespace-nowrap">{new Date(printEntry.EntryTimestamp).toLocaleDateString()} {printEntry.Shift}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 print:hidden">
                <button 
                  type="button"
                  onClick={() => {
                     if (window.self !== window.top) {
                         alert("⚠️ The AI Studio Preview blocks direct printing.\n\nTo print this sticker, please open the application in a new browser tab.\n\nLook for the ↗ (diagonal arrow) icon at the top right of the Google AI Studio screen and click it.");
                         return;
                     }
                     window.print();
                  }}
                  className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20"
                >
                  <Printer size={18} />
                  Print Sticker Now
                </button>
            </div>
            
            {window.self !== window.top && (
               <p className="text-[10px] text-rose-500 font-bold mt-4 text-center print:hidden border border-rose-100 bg-rose-50 p-2 rounded-lg">
                 Note: If the print window does not appear, your browser might be blocking it in this preview window. Please open the app in a new tab using the <span className="text-slate-800 font-black px-1 border border-slate-200 bg-white rounded mx-1 pb-0.5">&nearr;</span> icon at the top right of the screen.
               </p>
            )}
          </div>
        </div>
      )}
      <div className={cn("min-h-screen flex text-slate-800 industrial-grid", printEntry ? "print:hidden" : "")}>
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-white border-r border-brand-border flex flex-col z-50 overflow-hidden sticky top-0 h-screen sidebar-glow transition-all duration-300",
          isSidebarOpen ? "w-64" : "w-20"
        )}
        onMouseEnter={() => setIsSidebarOpen(true)}
        onMouseLeave={() => setIsSidebarOpen(false)}
      >
        <div className={cn("p-6 border-b border-brand-border flex items-center gap-3 transition-all", !isSidebarOpen && "sm:px-0 sm:justify-center p-4")}>
          <div className="shrink-0 w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center shadow-lg shadow-brand-primary/20 relative">
            <Factory className="text-white" size={20} />
          </div>
          {isSidebarOpen && (
            <div className="whitespace-nowrap">
              <h1 className="font-display font-black text-xl leading-none tracking-tighter text-brand-primary">MAINETTI</h1>
              <p className="text-[8px] text-slate-400 uppercase tracking-[0.3em] font-black mt-1">Industrial Systems</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
          <SidebarLink 
            icon={<LayoutDashboard size={18} />} 
            label="DASHBOARD" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            isOpen={isSidebarOpen}
          />
          <SidebarLink 
            icon={<Layers size={18} />} 
            label="TARGET & MACHINES" 
            active={activeTab === 'machines'}
            onClick={() => setActiveTab('machines')}
            isOpen={isSidebarOpen}
          />
          <SidebarLink 
            icon={<PlusCircle size={18} />} 
            label="ENTRY PORTAL" 
            active={activeTab === 'entry'} 
            onClick={() => setActiveTab('entry')} 
            isOpen={isSidebarOpen}
          />
          <SidebarLink 
            icon={<History size={18} />} 
            label="LOGBOOK" 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            isOpen={isSidebarOpen}
          />
          <SidebarLink 
            icon={<AlertTriangle size={18} />} 
            label="BREAKDOWN DATA" 
            active={activeTab === 'breakdown-data'} 
            onClick={() => setActiveTab('breakdown-data')} 
            isOpen={isSidebarOpen}
          />
          <SidebarLink 
            icon={<FileSpreadsheet size={18} />} 
            label="REPORTS" 
            active={activeTab === 'reports'} 
            onClick={() => setActiveTab('reports')} 
            isOpen={isSidebarOpen}
          />
          <div className="pt-6 pb-2">
            {isSidebarOpen && <p className="px-4 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 whitespace-nowrap">MASTER DATA</p>}
            <SidebarLink 
              icon={<Settings size={18} />} 
              label="MASTER TABLES" 
              active={activeTab === 'master-config'}
              onClick={() => setActiveTab('master-config')}
              isOpen={isSidebarOpen}
            />
            <SidebarLink 
              icon={<Database size={18} />} 
              label="PRODUCTION RECORD" 
              active={activeTab === 'master-production-record'}
              onClick={() => setActiveTab('master-production-record')}
              isOpen={isSidebarOpen}
            />
            <SidebarLink 
              icon={<Database size={18} />} 
              label="SAMPLE PRODUCTION" 
              active={activeTab === 'sample-production'}
              onClick={() => setActiveTab('sample-production')}
              isOpen={isSidebarOpen}
            />
            <SidebarLink 
              icon={<Users size={18} />} 
              label="OPERATORS" 
              active={activeTab === 'operators'}
              onClick={() => setActiveTab('operators')}
              isOpen={isSidebarOpen}
            />
            <SidebarLink 
              icon={<FileUp size={18} />} 
              label="PENDING ORDER" 
              active={activeTab === 'pending-order'}
              onClick={() => setActiveTab('pending-order')}
              isOpen={isSidebarOpen}
            />
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-brand-border flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm shadow-slate-100/50">
          <div className="flex items-center gap-5">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              onMouseEnter={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <h2 className="font-display font-black text-xl tracking-tight text-slate-900 uppercase">
              {activeTab === 'dashboard' ? 'Real-Time Operations' : 
               activeTab === 'machines' ? 'Target & Machines' : 
               activeTab === 'entry' ? 'Production Entry' : 
               activeTab === 'history' ? 'Operation Logs' : 
               activeTab === 'master-config' ? 'Master Data Table' : 
               activeTab === 'operators' ? 'Operator Management' : 
               activeTab === 'breakdown-data' ? 'Breakdown Data' : 
               activeTab === 'pending-order' ? 'Pending Order' : 
               activeTab === 'master-production-record' ? 'Production Record' : 
               activeTab === 'sample-production' ? 'Sample Production' : 'System Setup'}
            </h2>
            <div className="h-4 w-[1px] bg-slate-200" />
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-mono font-bold uppercase">
              <Clock size={14} className="text-brand-primary" />
              <input 
                type="date"
                value={dashboardDateFilter || currentProductionDateStr}
                onChange={(e) => updateDateFilter(e.target.value)}
                className="bg-transparent border-none p-0 tracking-widest text-[#94a3b8] focus:ring-0 cursor-pointer"
                style={{ WebkitAppearance: 'none' }}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden xl:flex items-center gap-8">
              <MetricHead label="DAILY KG (COMBINED)" value={`${todayTotalKgs.toFixed(1)}`} unit="KG" color="text-brand-primary animate-pulse" />
              <MetricHead label="TARGET KG (TODAY)" value={`${totalTarget.toFixed(1)}`} unit="KG" />
              <MetricHead label="EFFICIENCY" value={efficiency} unit="%" color="text-brand-success" />
              <MetricHead label="ACTIVE" value={`${machines.filter(m => m.status === 'Running').length}/${machines.length}`} unit="MACHINES" />
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-all relative group shadow-sm">
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-brand-danger rounded-full border border-white" />
                <AlertCircle size={18} />
              </button>
            </div>
          </div>
        </header>

        <section className="flex-1 p-4 overflow-y-auto">
          {fetchError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-500">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-rose-900">কানেকশন এরর</p>
                  <p className="text-xs text-rose-600">{fetchError}</p>
                </div>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-rose-200 active:scale-95"
              >
                রিফ্রেশ করুন
              </button>
            </div>
          )}

          {isLoading && (
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <p className="text-sm font-bold text-indigo-900">ডাটাবেস কানেক্ট হচ্ছে...</p>
                <p className="text-xs text-indigo-600">অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন।</p>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div className="col-span-full p-2 bg-yellow-100 text-yellow-800 text-xs font-mono rounded">
                      Debug: Total Records: {productionRecords.length}, Today Records: {todayRecords.length}, Date: {currentProductionDateStr}
                   </div>
                   <StatCard 
                    title="Daily Combined Output" 
                    value={todayTotalKgs.toFixed(1)} 
                    unit="KGS" 
                    trend={`${todayDayTotalKgs.toFixed(0)}k Day + ${todayNightTotalKgs.toFixed(0)}k Night`} 
                    icon={<TrendingUp className="text-emerald-400" />} 
                  />
                   <StatCard 
                    title="Daily Finished Rolls" 
                    value={`${todayTotalRolls}`} 
                    unit="ROLLS" 
                    trend={`${todayDayTotalRolls} Day + ${todayNightTotalRolls} Night`} 
                    icon={<Package className="text-blue-400" />} 
                  />
                   <StatCard 
                    title="Daily Total Meterage" 
                    value={todayTotalMeter.toLocaleString()} 
                    unit="METER" 
                    trend={`${todayDayTotalMeter.toLocaleString()} Day + ${todayNightTotalMeter.toLocaleString()} Night`} 
                    icon={<Ruler className="text-amber-400" />} 
                  />
                   <StatCard 
                    title="Daily Waste/Scrap" 
                    value={todayTotalScrap.toFixed(1)} 
                    unit="KGS" 
                    trend={`${todayDayTotalScrap.toFixed(1)} Day + ${todayNightTotalScrap.toFixed(1)} Night`} 
                    icon={<CheckCircle2 className="text-emerald-400" />} 
                  />
                </div>

                {/* Daily Shift Combined Summary Breakdown */}
                <div className="glass-panel p-6 border-brand-primary/10 bg-gradient-to-br from-slate-50/50 to-indigo-50/5 rounded-2xl relative overflow-hidden shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3 pb-4 border-b border-slate-100">
                    <div className="space-y-1">
                      <h4 className="font-display font-bold text-base flex items-center gap-2 text-slate-800">
                        <CalendarDays size={18} className="text-brand-primary" />
                        Shift-wise Combine Summary
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                        Bangladesh Stand. Time | Operational Date: <span className="text-brand-primary font-bold">{new Date(currentProductionDateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span> (08 AM - 08 AM)
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono">Status:</div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Synchronized
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Day Shift Combined Card (08:00 AM to 08:00 PM) */}
                    <div className="bg-gradient-to-br from-white to-amber-50/10 border border-slate-100 hover:border-amber-100 shadow-sm rounded-xl p-5 relative transition-all duration-300">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[9px] font-black tracking-widest uppercase text-amber-600 bg-amber-50 border border-amber-105 px-2.5 py-0.5 rounded-lg font-mono">
                          Day Shift (08:00 AM - 08:00 PM)
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                          <Clock size={16} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center md:text-left">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Output Kgs</p>
                          <p className="text-xl font-mono font-black text-slate-800">{todayDayTotalKgs.toFixed(1)}k</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Finished Rolls</p>
                          <p className="text-xl font-mono font-black text-slate-800">{todayDayTotalRolls}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scrap Loss</p>
                          <p className="text-xl font-mono font-black text-rose-500">{todayDayTotalScrap.toFixed(2)}k</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                        <span>Day shift meterage:</span>
                        <span className="font-mono font-bold text-slate-700">{todayDayTotalMeter.toLocaleString()} m</span>
                      </div>
                    </div>

                    {/* Night Shift Combined Card (08:00 PM to 08:00 AM) */}
                    <div className="bg-gradient-to-br from-white to-indigo-50/10 border border-slate-100 hover:border-indigo-100 shadow-sm rounded-xl p-5 relative transition-all duration-300">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[9px] font-black tracking-widest uppercase text-indigo-700 bg-indigo-50 border border-indigo-105 px-2.5 py-0.5 rounded-lg font-mono">
                          Night Shift (08:00 PM - 08:00 AM)
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
                          <Clock size={16} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center md:text-left">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Output Kgs</p>
                          <p className="text-xl font-mono font-black text-slate-800">{todayNightTotalKgs.toFixed(1)}k</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Finished Rolls</p>
                          <p className="text-xl font-mono font-black text-slate-800">{todayNightTotalRolls}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scrap Loss</p>
                          <p className="text-xl font-mono font-black text-rose-500">{todayNightTotalScrap.toFixed(2)}k</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                        <span>Night shift meterage:</span>
                        <span className="font-mono font-bold text-slate-700">{todayNightTotalMeter.toLocaleString()} m</span>
                      </div>
                    </div>
                  </div>

                  {/* Combined Day + Night Total Stats */}
                  <div className="mt-6 bg-white border border-slate-100 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-200">
                        <TrendingUp size={20} />
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">Combined Operational Total</h5>
                        <p className="text-[10px] font-bold text-slate-400">Sum of Day Shift output and Night Shift output combined</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 justify-center">
                      <div className="text-center sm:text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase mr-1">Combine Output</span>
                        <div className="text-lg font-mono font-black text-slate-900">{todayTotalKgs.toFixed(1)} Kg</div>
                      </div>
                      <div className="h-8 w-[1px] bg-slate-100 hidden sm:block" />
                      <div className="text-center sm:text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase mr-1">Combine Rolls</span>
                        <div className="text-lg font-mono font-black text-slate-900">{todayTotalRolls} Rolls</div>
                      </div>
                      <div className="h-8 w-[1px] bg-slate-100 hidden sm:block" />
                      <div className="text-center sm:text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase mr-1">Combine Scrap</span>
                        <div className="text-lg font-mono font-black text-rose-500">{todayTotalScrap.toFixed(2)} Kg</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Machine Monitoring */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                      <Layers size={20} className="text-slate-400" />
                      Machine-wise Live Summary
                    </h3>
                    <div className="flex gap-2">
                      <StatusLegend color="bg-emerald-500" label="Running" />
                      <StatusLegend color="bg-amber-500" label="Idle" />
                      <StatusLegend color="bg-rose-500" label="Breakdown" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {dashboardData?.summary.map((machine) => (
                      <MachineCard key={machine.MachineNo} machine={machine} />
                    ))}
                  </div>

                  {/* Dashboard Table */}
                  <div className="hidden bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-8">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Dashboard Table</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-center border-b-2 border-slate-800">
                            <th className="px-3 py-3 border-r border-slate-300 bg-red-600 text-white font-bold w-24">Date</th>
                            <th className="px-3 py-3 border-r border-slate-300 bg-red-600 text-white font-bold w-24">Machine No</th>
                            <th className="px-3 py-3 border-r border-amber-500/30 bg-amber-200 text-amber-900 font-bold">Target Kgs</th>
                            <th className="px-3 py-3 border-r border-amber-500/30 bg-amber-200 text-amber-900 font-bold">Total Rolls</th>
                            <th className="px-3 py-3 border-r border-amber-500/30 bg-amber-200 text-amber-900 font-bold">Total Meter</th>
                            <th className="px-3 py-3 border-r border-amber-500/30 bg-amber-200 text-amber-900 font-bold">Total<br/>Production Kgs</th>
                            <th className="px-3 py-3 border-r border-amber-500/30 bg-amber-200 text-amber-900 font-bold">Machine Status</th>
                            <th className="px-3 py-3 border-r border-amber-500/30 bg-amber-200 text-amber-900 font-bold">Breakdown Type</th>
                            <th className="px-3 py-3 border-r border-slate-300 bg-amber-200 text-amber-900 font-bold">Reason of Idle</th>
                            <th className="px-3 py-3 border-r border-slate-300 bg-red-600 text-white font-bold">Last Update Time</th>
                            <th className="px-3 py-3 border-r border-slate-300 bg-red-600 text-white font-bold">Breakdown No of<br/>Times</th>
                            <th className="px-3 py-3 bg-red-600 text-white font-bold">Breakdown<br/>Duration (Mins)</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs text-slate-700 text-center font-medium">
                          {dashboardData?.summary.map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2.5 border-r border-slate-200 bg-white">
                                {row.Date ? new Date(row.Date).toLocaleDateString('en-GB') : '-'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-slate-200 bg-white font-bold text-slate-900">{row.MachineNo}</td>
                              <td className="px-3 py-2.5 border-r border-amber-100 bg-amber-50/30">{row.TargetKgs}</td>
                              <td className="px-3 py-2.5 border-r border-amber-100 bg-amber-50/30">{row.TotalRolls}</td>
                              <td className="px-3 py-2.5 border-r border-amber-100 bg-amber-50/30">{row.TotalMeter}</td>
                              <td className="px-3 py-2.5 border-r border-amber-100 bg-amber-50/30">
                                {row.TotalProductionKgs > 0 ? row.TotalProductionKgs.toFixed(1) : '0'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-amber-100 bg-amber-50/30">
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                  row.MachineStatus === 'Running' ? 'bg-emerald-100 text-emerald-700' :
                                  row.MachineStatus === 'Breakdown' ? 'bg-red-100 text-red-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  {row.MachineStatus}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 border-r border-amber-100 bg-amber-50/30 text-[10px]">
                                {row.BreakdownType || '-'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-slate-200 bg-amber-50/30 text-[10px]">
                                {row.ReasonOfIdle || '-'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-slate-200 bg-white">
                                {row.LastUpdateTime && row.LastUpdateTime !== 'N/A' ? new Date(row.LastUpdateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-slate-200 bg-white">{row.BreakdownNoOfTimes || 0}</td>
                              <td className="px-3 py-2.5 bg-white text-brand-danger font-bold">{row.BreakdownDurationMins || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Performance Chart */}
                <div className="glass-panel p-6">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="font-display font-semibold text-lg">Production Velocity</h3>
                      <p className="text-slate-500 text-sm">Hourly output across all machines (Kgs)</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500" />
                        <span className="text-xs text-slate-400">Target Output</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                        <span className="text-xs text-slate-400">Actual Production</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis 
                          dataKey="time" 
                          stroke="#94a3b8" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          dy={10}
                        />
                        <YAxis 
                          stroke="#94a3b8" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(value) => `${value}kg`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#0284c7', fontWeight: 'bold' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="prod" 
                          stroke="#0284c7" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorProd)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'entry' && (
              <motion.div 
                key="entry"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Form */}
                  <div className="xl:col-span-8 glass-panel p-6 border-slate-100">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {/* Form Header (As per Sch 1) */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 mb-4 gap-6">
                        <div className="flex-1">
                          <BangladeshLiveWatch />
                        </div>

                        {/* Moved Inputs: Production Date and Shift */}
                        <div className="flex flex-wrap items-center gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                          <div className="min-w-[160px]">
                            <label className="block text-[9px] font-black text-brand-primary uppercase tracking-widest mb-1 ml-1">PRODUCTION DATE</label>
                            <div className="relative">
                              <input 
                                type="date" 
                                name="ProductionDate"
                                value={formData.ProductionDate}
                                onChange={handleInputChange}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const form = e.currentTarget.closest('form');
                                    if (form) {
                                      const focusable = getFocusableElements(form);
                                      const index = focusable.indexOf(e.currentTarget);
                                      if (index > -1 && index < focusable.length - 1) {
                                        const nextElement = focusable[index + 1];
                                        nextElement.focus();
                                        if (nextElement instanceof HTMLInputElement && nextElement.type !== 'date') {
                                          nextElement.select();
                                        }
                                      }
                                    }
                                  }
                                }}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/10 focus:scale-[1.01] transition-all"
                              />
                            </div>
                          </div>
                          <div className="min-w-[100px]">
                            <label className="block text-[9px] font-black text-brand-primary uppercase tracking-widest mb-1 ml-1">SHIFT</label>
                            <select 
                              name="Shift"
                              value={formData.Shift}
                              onChange={handleInputChange}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const form = e.currentTarget.closest('form');
                                  if (form) {
                                    const focusable = getFocusableElements(form);
                                    const index = focusable.indexOf(e.currentTarget);
                                    if (index > -1 && index < focusable.length - 1) {
                                      const nextElement = focusable[index + 1];
                                      nextElement.focus();
                                      if (nextElement instanceof HTMLInputElement && nextElement.type !== 'date') {
                                        nextElement.select();
                                      }
                                    }
                                  }
                                }
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/10 focus:scale-[1.01] transition-all appearance-none"
                            >
                              {masterStore.shifts.map((s: string) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="bg-brand-primary/5 border border-brand-primary/10 px-4 py-2 rounded-xl">
                            <p className="text-[10px] text-brand-primary uppercase tracking-widest font-black mb-0.5">PREV_ROLL_ID</p>
                            <p className="font-mono text-base font-black text-brand-primary leading-tight">{previousRollId || '----'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Main Form Body */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                        <SelectField label="Production Type" name="ProductionType" value={formData.ProductionType} onChange={handleInputChange} options={masterStore.productionTypes} icon={<Package size={14} />} placeholder="Type Here" clearable={false} />
                        <div className="relative">
                          <InputField label="Operator ID" name="OperatorID" type="number" value={formData.OperatorID} onChange={handleInputChange} icon={<Hash size={14} />} placeholder="Type Here" required />
                          <div className="hidden">
                            <InputField label="Operator Name" name="OperatorName" value={formData.OperatorName} onChange={handleInputChange} icon={<UserIcon size={14} />} placeholder="Name" />
                          </div>
                        </div>
                        <SelectField label="Machine No" name="MachineNo" value={formData.MachineNo} onChange={handleInputChange} options={masterStore.machineList && masterStore.machineList.length > 0 ? masterStore.machineList : machines.map(m => m.id)} icon={<Container size={14} />} placeholder="Type Here" />
                        
                        <SelectField label="Year" name="Year" value={formData.Year} onChange={handleInputChange} options={masterStore.years} icon={<CalendarIcon size={14} />} placeholder="Type Here" clearable={false} />
                        <InputField label="PI Number" name="PINumber" value={formData.PINumber} onChange={handleInputChange} icon={<Hash size={14} />} placeholder="Type Here" />
                        <InputField label="Tube Size" name="TubeSize" type="text" value={formData.TubeSize} onChange={handleInputChange} icon={<Ruler size={14} />} placeholder="Type Here" />
                        
                        <SelectField label="UOM" name="UOM" value={formData.UOM} onChange={handleInputChange} options={masterStore.uoms} icon={<Ruler size={14} />} placeholder="Type Here" />
                        <SelectField label="Raw Material" name="Material" value={formData.Material} onChange={handleInputChange} options={masterStore.materials} icon={<Layers size={14} />} placeholder="Type Here" />
                        <InputField label="Micron" name="Micron" type="number" value={formData.Micron} onChange={handleInputChange} icon={<Box size={14} />} placeholder="Type Here" />
                        
                        <SelectField label="In-Line Print" name="InLinePrint" value={formData.InLinePrint} onChange={handleInputChange} options={masterStore.inlinePrintOptions} icon={<CheckCircle2 size={14} />} placeholder="Type Here" />
                        <InputField label="Finished Meter" name="FinishedMeter" type="number" value={formData.FinishedMeter} onChange={handleInputChange} icon={<Ruler size={14} />} placeholder="Type Here" />
                        <InputField label="Finished KG" name="FinishedKgs" type="number" step="0.01" value={formData.FinishedKgs} onChange={handleInputChange} icon={<Weight size={14} />} placeholder="Type Here" required />
                        
                        <InputField label="Waste (KG)" name="ScrapKgs" type="number" step="0.01" value={formData.ScrapKgs} onChange={handleInputChange} icon={<AlertTriangle size={14} />} placeholder="Type Here" />
                        <InputField label="Roll Location" name="RollLocation" value={formData.RollLocation} onChange={handleInputChange} icon={<MapPin size={14} />} placeholder="Type Here" />
                        <div />
                      </div>

                      {/* Form Footer */}
                      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                        <div className="min-h-[60px] flex items-center">
                          <div className="bg-brand-primary/5 border border-brand-primary/10 px-5 py-2.5 rounded-xl">
                            <p className="text-[10px] text-brand-primary uppercase tracking-widest font-black mb-1 leading-none">CURRENT_ROLL_ID</p>
                            <p className="font-mono text-2xl font-black text-brand-primary leading-none">
                              {formData.RollLocation ? nextRollId : '-------'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            type="button" 
                            onClick={() => setActiveTab('dashboard')}
                            className="px-6 py-2.5 rounded-xl text-slate-400 hover:text-slate-600 transition-colors text-xs font-black uppercase tracking-[0.2em]"
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit" 
                            disabled={isLoading}
                            className={cn(
                              "px-10 py-3 rounded-xl bg-brand-primary text-white font-black shadow-xl shadow-brand-primary/10 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-3 text-xs uppercase tracking-[0.2em]",
                              "disabled:opacity-50 group"
                            )}
                          >
                            {isLoading ? (
                              <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                              <>
                                <TrendingUp size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                Save Data
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Right Column: High-Density Feed */}
                  <div className="xl:col-span-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} className="text-brand-primary" />
                        Live Feed
                      </h3>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                          <input
                            type="text"
                            placeholder="Search feed..."
                            value={feedSearchQuery}
                            onChange={(e) => setFeedSearchQuery(e.target.value)}
                            className="bg-slate-50 border border-slate-200 focus:border-brand-primary focus:bg-white rounded-lg pl-7 pr-6 py-1.5 text-[10px] text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-semibold max-w-[130px] md:max-w-[150px]"
                          />
                          {feedSearchQuery && (
                            <button
                              onClick={() => setFeedSearchQuery("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 focus:outline-none"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] font-mono text-slate-400 shrink-0">SESSION_SYNC: OK</p>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                      {displayedFeed.length === 0 ? (
                        <div className="glass-panel p-10 flex flex-col items-center text-center space-y-3 opacity-40">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Clock size={24} />
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-wider">Awaiting Stream</p>
                          {feedSearchQuery && (
                            <p className="text-[9px] font-medium text-slate-400 mt-1">No matching logs found</p>
                          )}
                        </div>
                      ) : (
                        displayedFeed.map((entry, idx) => (
                          <motion.div 
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={entry.RollID || idx}
                            className={cn(
                              "glass-panel p-4 border-slate-100 border-l-4 group transition-all",
                              idx === 0 ? "border-l-brand-primary bg-brand-primary/[0.01]" : "border-l-slate-200"
                            )}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <p className="font-mono text-xs font-black text-slate-900 tracking-tighter">{entry.RollID}</p>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{entry.MachineNo}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col items-end">
                                  <p className="text-[10px] font-bold text-brand-primary">{entry.FinishedKgs} kg</p>
                                  <p className="text-[10px] font-bold text-blue-500">{entry.FinishedMeter} m</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setPrintEntry({ ...entry })}
                                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-indigo-500 transition-all flex items-center justify-center cursor-pointer shadow-sm border border-transparent hover:border-slate-200 bg-white"
                                    title="Print Sticker"
                                  >
                                    <Printer size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingEntry({ ...entry })}
                                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-brand-primary transition-all flex items-center justify-center cursor-pointer shadow-sm border border-transparent hover:border-slate-200 bg-white"
                                    title="Edit entry"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between opacity-70 group-hover:opacity-100 transition-opacity">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                  <UserIcon size={10} />
                                  {entry.OperatorID}
                                </div>
                                <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                  <Box size={10} />
                                  {entry.Material}
                                </div>
                              </div>
                              <p className="text-[9px] font-mono text-slate-400">{new Date(entry.EntryTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-inner">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp size={14} className="text-emerald-600" />
                        <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Shift Metrics</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-0.5">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Yield Sum</p>
                          <p className="text-sm font-mono font-bold text-slate-800">
                            {metricsFeed.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0).toFixed(1)}k
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Avg Waste</p>
                          <p className="text-sm font-mono font-bold text-rose-600">
                            {(metricsFeed.reduce((acc, curr) => acc + (Number(curr.ScrapKgs) || 0), 0) / (metricsFeed.length || 1)).toFixed(2)}k
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'master-config' && (
              <motion.div 
                key="master-config"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="space-y-10"
              >
                {/* Reference Tables Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                        <BarChart3 size={18} />
                      </div>
                      <h3 className="text-lg font-display font-bold text-slate-900 uppercase tracking-tight">Reference Tables</h3>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {Object.keys(masterStore).map((key) => (
                      <div key={key} className="glass-panel p-6 space-y-4 hover:shadow-lg transition-all duration-300">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest leading-none">{key.replace(/([A-Z])/g, ' $1').toUpperCase().trim()}</h3>
                            <button 
                              onClick={() => {
                                setModalConfig({ 
                                  isOpen: true, 
                                  type: key, 
                                  title: `Add ${key.replace(/([A-Z])/g, ' $1').replace(/^\w/, c => c.toUpperCase()).trim()}` 
                                });
                              }}
                              className="p-1 w-6 h-6 flex items-center justify-center rounded-lg bg-brand-primary text-white hover:scale-110 active:scale-95 transition-all shadow-md shadow-brand-primary/20"
                            >
                              <PlusCircle size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {masterStore[key].map((item: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 group hover:border-brand-primary/30 transition-all">
                                  {item}
                                  <button 
                                    onClick={async () => {
                                      const updated = { ...masterStore, [key]: masterStore[key].filter((_: any, i: number) => i !== idx) };
                                      setMasterStore(updated);
                                      await fetch('/api/master-store', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(updated)
                                      });
                                      showToast("Item removed", 'success');
                                    }}
                                    className="text-slate-300 hover:text-rose-500 transition-colors"
                                  >
                                    <XCircle size={12} />
                                  </button>
                              </div>
                            ))}
                          </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Machine Master Entry Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <Layers size={18} />
                    </div>
                    <h3 className="text-lg font-display font-bold text-slate-900 uppercase tracking-tight">Machine Master Registry</h3>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    {/* Add Machine Form */}
                    <div className="xl:col-span-4 glass-panel p-6 border-slate-200 shadow-xl shadow-slate-200/20">
                      <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
                        <PlusCircle size={16} className="text-brand-primary" />
                        <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Register New Asset</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MACHINE ID</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Ext-20-LD800"
                            value={machineFormData.id}
                            onChange={(e) => setMachineFormData(prev => ({ ...prev, id: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MACHINE TYPE</label>
                          <input 
                            type="text" 
                            placeholder="e.g. LD800"
                            value={machineFormData.type}
                            onChange={(e) => setMachineFormData(prev => ({ ...prev, type: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 transition-all"
                          />
                        </div>
                        
                        <button 
                          onClick={async () => {
                            if (!machineFormData.id || !machineFormData.type) {
                              showToast("ID and Type are required", 'error');
                              return;
                            }
                            try {
                              const res = await fetch('/api/machines', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(machineFormData)
                              });
                              if (res.ok) {
                                showToast("Machine registered successfully", 'success');
                                setMachineFormData({ id: '', type: '', target: '' });
                                fetchMachines();
                              } else {
                                const err = await res.json();
                                showToast(err.message, 'error');
                              }
                            } catch (err) {
                              showToast("Network error", 'error');
                            }
                          }}
                          className="w-full py-3 bg-brand-primary text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-brand-primary/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 group"
                        >
                          <PlusCircle size={14} className="group-hover:rotate-90 transition-transform" />
                          Commit Registry
                        </button>
                      </div>
                    </div>

                    {/* Machine List Summary */}
                    <div className="xl:col-span-8 glass-panel overflow-hidden border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">IDENTIFIER</th>
                              <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">TYPE</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {machines.slice(-5).reverse().map((m) => (
                              <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <p className="text-xs font-bold text-slate-900">{m.id}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{m.type}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-center">
                        <button 
                          onClick={() => setActiveTab('machines')}
                          className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] hover:underline"
                        >
                          View Full Hardware Registry
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-8 bg-brand-primary/[0.02] border-brand-primary/10 flex items-start gap-6">
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                    <AlertCircle size={24} />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Master Data Integrity Protocol</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                      These tables serve as the authoritative root for all operational parameters. 
                      Changes instantly synchronize across all client nodes and analytical modules. 
                      Exercise caution when removing items as it may affect historical log validation. 
                      Machine identifiers should follow the standard hierarchy (Section-Node-Spec) for optimal database indexing.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'machines' && (
              <motion.div 
                key="machines"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="glass-panel shadow-md border-slate-100">
                   <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                       <thead>
                         <tr className="border-b border-slate-100 bg-slate-50/50">
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">MACHINE ID</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">TARGET (KG)</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CURRENT STATE</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">REASON</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">NUMBER OF IDLE</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">NUMBER OF BREAKDOWN</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">IDLE TIME</th>
                           <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">BREAKDOWN TIME</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                         {machines.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-8 py-5">
                                <p className="font-bold text-slate-900 tracking-tight">{m.id}</p>
                                <p className="text-[10px] text-slate-400 font-mono tracking-tighter">NODE-00{m.id.split('-')[1] || 'X'}</p>
                              </td>
                              <td className="px-8 py-5">
                                <input 
                                  type="number" 
                                  defaultValue={m.target || ""}
                                  placeholder="Input Target"
                                  onBlur={(e) => updateMachineStatus(m.id, { target: e.target.value ? Number(e.target.value) : 0 })}
                                  className="w-32 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 transition-all font-mono text-slate-700 placeholder:text-slate-400 placeholder:font-sans placeholder:text-[10px]"
                                />
                              </td>
                              <td className="px-8 py-5">
                                <div className="relative">
                                  <select 
                                    value={m.status}
                                    onChange={(e) => handleMachineStateChange(m, e.target.value as any)}
                                    className={cn(
                                      "w-44 bg-slate-50 border rounded-xl px-4 py-2 text-[10px] font-bold transition-all appearance-none cursor-pointer tracking-widest shadow-sm",
                                      m.status === 'Running' ? 'border-brand-success/20 text-brand-success' : 
                                      m.status === 'Idle' ? 'border-brand-warning/20 text-brand-warning' : 'border-brand-danger/20 text-brand-danger'
                                    )}
                                  >
                                    <option value="Running">RUNNING</option>
                                    <option value="Idle">IDLE</option>
                                    <option value="Breakdown">BREAKDOWN</option>
                                  </select>
                                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30" />
                                </div>
                              </td>
                              <td className="px-8 py-5">
                                <div className="relative min-w-[200px]">
                                  <select 
                                    value={m.reason || ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleReasonChange(m, val);
                                    }}
                                    disabled={m.status === 'Running'}
                                    className={cn(
                                      "w-full bg-slate-50 border rounded-xl px-4 py-2 text-xs transition-all appearance-none cursor-pointer font-medium pr-10 shadow-sm",
                                      m.status === 'Running' 
                                        ? 'opacity-35 cursor-not-allowed border-slate-200 text-slate-400' 
                                        : 'opacity-100 hover:border-slate-300 focus:border-brand-primary/50 border-slate-200 text-slate-700'
                                    )}
                                  >
                                    {m.status === 'Running' ? (
                                      <option value="NO_ALERTS">NO_ALERTS</option>
                                    ) : m.status === 'Idle' ? (
                                      <>
                                        <option value="" disabled>Select Reason</option>
                                        {m.reason && m.reason !== "" && masterStore.idleReasons && !masterStore.idleReasons.includes(m.reason) && (
                                          <option value={m.reason}>{m.reason}</option>
                                        )}
                                        {(masterStore.idleReasons || []).map((reasonOpt: string) => (
                                          <option key={reasonOpt} value={reasonOpt}>{reasonOpt}</option>
                                        ))}
                                      </>
                                    ) : (
                                      <>
                                        <option value="" disabled>Select Reason</option>
                                        {m.reason && m.reason !== "" && masterStore.breakdownReasons && !masterStore.breakdownReasons.includes(m.reason) && (
                                          <option value={m.reason}>{m.reason}</option>
                                        )}
                                        {(masterStore.breakdownReasons || []).map((reasonOpt: string) => (
                                          <option key={reasonOpt} value={reasonOpt}>{reasonOpt}</option>
                                        ))}
                                      </>
                                    )}
                                  </select>
                                  {m.status !== 'Running' && (
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30" />
                                  )}
                                </div>
                              </td>
                             <td className="px-8 py-5">
                               <input 
                                 type="number" 
                                 value={m.numIdle ?? 0}
                                 onChange={(e) => {
                                   const val = Number(e.target.value) || 0;
                                   setMachines(prev => prev.map(mach => mach.id === m.id ? { ...mach, numIdle: val } : mach));
                                 }}
                                 onBlur={(e) => updateMachineStatus(m.id, { numIdle: Number(e.target.value) || 0 })}
                                 className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-center font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                               />
                             </td>
                             <td className="px-8 py-5">
                               <input 
                                 type="number" 
                                 value={m.numBreakdown ?? 0}
                                 onChange={(e) => {
                                   const val = Number(e.target.value) || 0;
                                   setMachines(prev => prev.map(mach => mach.id === m.id ? { ...mach, numBreakdown: val } : mach));
                                 }}
                                 onBlur={(e) => updateMachineStatus(m.id, { numBreakdown: Number(e.target.value) || 0 })}
                                 className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-center font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                               />
                             </td>
                             <td className="px-8 py-5">
                               {(() => {
                                 let displayingTime = m.idleTime ?? 0;
                                 let isActive = false;
                                 if (m.status === 'Idle' && m.lastStatusChange) {
                                   isActive = true;
                                   const elapsedMs = Date.now() - new Date(m.lastStatusChange).getTime();
                                   const elapsedHours = elapsedMs / (1000 * 60 * 60);
                                   displayingTime += elapsedHours;
                                 }
                                 return (
                                   <div className="flex items-center gap-1.5">
                                     <div className={cn(
                                       "px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 min-w-[100px] justify-center border shadow-sm",
                                       isActive 
                                         ? "bg-amber-50 text-amber-600 border-amber-200 ring-2 ring-amber-100/50" 
                                         : "bg-slate-50 text-slate-600 border-slate-200/80"
                                     )}>
                                       {isActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                       <span>{formatMachineDuration(displayingTime)}</span>
                                     </div>
                                   </div>
                                 );
                               })()}
                             </td>
                             <td className="px-8 py-5">
                               {(() => {
                                 let displayingTime = m.breakdownTime ?? 0;
                                 let isActive = false;
                                 if (m.status === 'Breakdown' && m.lastStatusChange) {
                                   isActive = true;
                                   const elapsedMs = Date.now() - new Date(m.lastStatusChange).getTime();
                                   const elapsedHours = elapsedMs / (1000 * 60 * 60);
                                   displayingTime += elapsedHours;
                                 }
                                 return (
                                   <div className="flex items-center gap-1.5">
                                     <div className={cn(
                                       "px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 min-w-[100px] justify-center border shadow-sm",
                                       isActive 
                                         ? "bg-rose-50 text-rose-600 border-rose-200 ring-2 ring-rose-100/50" 
                                         : "bg-slate-50 text-slate-600 border-slate-200/80"
                                     )}>
                                       {isActive && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
                                       <span>{formatMachineDuration(displayingTime)}</span>
                                     </div>
                                   </div>
                                 );
                               })()}
                             </td>
                           </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                   <h3 className="text-xl font-display font-bold flex items-center gap-3 text-slate-900">
                     <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center text-brand-primary border border-brand-primary/10">
                       <History size={22} />
                     </div>
                     Factory Operational Logs
                   </h3>
                   <div className="flex gap-4">
                     <button className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm">CSV-EXPORT</button>
                     <button className="px-6 py-2.5 rounded-xl bg-brand-primary text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-brand-primary/20 hover:scale-[1.02] transition-transform">REPORT_GENERATOR</button>
                   </div>
                </div>

                <div className="glass-panel border-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">BATCH_ID</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">TIMESTAMP</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">RESOURCE</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">OPERATOR</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CLASS</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">YIELD (KG)</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">VALIDITY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredRecords.length === 0 ? (
                           <tr>
                              <td colSpan={7} className="px-8 py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No operational logs found for selected date</td>
                           </tr>
                        ) : filteredRecords.map((record: any, i: number) => (
                           <tr key={record.RollID || i} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                             <td className="px-8 py-5">
                               <p className="font-mono text-xs text-brand-primary font-bold tracking-widest">{record.RollID}</p>
                             </td>
                             <td className="px-8 py-5">
                               <p className="text-sm font-bold text-slate-700 uppercase">{record.ProductionDate}</p>
                               <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{record.DataUpdateTime || 'N/A'}</p>
                             </td>
                             <td className="px-8 py-5">
                               <span className="px-3 py-1 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-500 font-mono">{record.MachineNo}</span>
                             </td>
                             <td className="px-8 py-5">
                               <p className="text-xs font-bold text-slate-700">{record.OperatorID}</p>
                               <p className="text-[10px] text-slate-500">{record.OperatorName}</p>
                             </td>
                             <td className="px-8 py-5 text-[10px] font-bold text-slate-400 tracking-widest">{record.ProductionType?.toUpperCase() || 'PRODUCTION'}</td>
                             <td className="px-8 py-5 text-right font-mono font-bold text-sm text-slate-900">{record.FinishedKgs}</td>
                             <td className="px-8 py-5">
                               <div className="flex justify-center">
                                 <div className="w-2.5 h-2.5 bg-brand-success rounded-full shadow-[0_0_12px_rgba(5,150,105,0.2)]" />
                               </div>
                             </td>
                           </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-100">
                        <tr>
                           <td colSpan={7} className="p-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              RECORDS_STREAM: <span className="text-slate-900 font-mono">{filteredRecords.length} / {productionRecords.length} ENTRIES</span>
                           </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'operators' && (
              <motion.div 
                key="operators"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <Users size={22} />
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-black text-slate-900 uppercase">Operator Master Table</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Personnel authority and authentication records</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  {/* Operator Form */}
                  <div className="xl:col-span-4 glass-panel p-6 border-slate-200">
                     <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-6 pb-2 border-b border-slate-100">
                       Register / Update Operator
                     </h4>
                     <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">OPERATOR ID</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 500"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 transition-all"
                            id="op-id-input"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">FULL NAME</label>
                          <input 
                            type="text" 
                            placeholder="e.g. John Doe"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 transition-all"
                            id="op-name-input"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">EMAIL ADDRESS</label>
                          <input 
                            type="email" 
                            placeholder="john@mainetti.com"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 transition-all"
                            id="op-email-input"
                          />
                        </div>

                        <button 
                          onClick={async () => {
                            const idInput = document.getElementById('op-id-input') as HTMLInputElement;
                            const nameInput = document.getElementById('op-name-input') as HTMLInputElement;
                            const emailInput = document.getElementById('op-email-input') as HTMLInputElement;
                            
                            if (!idInput?.value || !nameInput?.value) {
                              showToast("ID and Name are required", 'error');
                              return;
                            }

                            try {
                              const res = await fetch('/api/operators', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  id: idInput.value,
                                  name: nameInput.value,
                                  email: emailInput.value
                                })
                              });
                              if (res.ok) {
                                showToast("Operator record updated", 'success');
                                idInput.value = '';
                                nameInput.value = '';
                                emailInput.value = '';
                                fetchOperators();
                              }
                            } catch (err) {
                              showToast("Network failure", 'error');
                            }
                          }}
                          className="w-full py-3 bg-brand-primary text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-brand-primary/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 group"
                        >
                          <Users size={14} className="group-hover:scale-110 transition-transform" />
                          Save Personnel Data
                        </button>
                     </div>
                  </div>

                  {/* Operator List */}
                  <div className="xl:col-span-8 glass-panel overflow-hidden border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">OPERATOR ID</th>
                            <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">OPERATOR NAME</th>
                            <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">EMAIL ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {operators.map((op) => (
                            <tr key={op.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => {
                              const idInput = document.getElementById('op-id-input') as HTMLInputElement;
                              const nameInput = document.getElementById('op-name-input') as HTMLInputElement;
                              const emailInput = document.getElementById('op-email-input') as HTMLInputElement;
                              if (idInput) idInput.value = op.id;
                              if (nameInput) nameInput.value = op.name;
                              if (emailInput) emailInput.value = op.email;
                            }}>
                              <td className="px-6 py-4">
                                <span className="font-mono text-xs font-black text-brand-primary">{op.id}</span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-bold text-slate-900">{op.name}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-[10px] font-medium text-slate-400">{op.email || 'N/A'}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'pending-order' && (
              <motion.div 
                key="pending-order"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <PendingOrderPage 
                  pendingOrderInfo={pendingOrderInfo}
                  setPendingOrderInfo={setPendingOrderInfo}
                  showToast={showToast}
                  fetchPendingOrderInfo={fetchPendingOrderInfo}
                />
              </motion.div>
            )}
            {activeTab === 'breakdown-data' && (
              <motion.div 
                key="breakdown-data"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-display font-black text-slate-900 uppercase">Breakdown Data</h3>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Machine downtime and operational interruptions</p>
                  </div>
                </div>
                <BreakdownDataTable machines={machines} dateFilter={dashboardDateFilter || getShiftAndDateForDhaka().productionDate} showToast={showToast} />
              </motion.div>
            )}
            {activeTab === 'master-production-record' && (
              <motion.div 
                key="master-records"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <Database size={22} />
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-black text-slate-900 uppercase">Production Record</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Full historical database of all manufacturing cycles</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      id="excel-upload" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            const data = new Uint8Array(event.target?.result as ArrayBuffer);
                            const XLSX = await import('xlsx');
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheet];
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
                            
                            if (jsonData.length === 0) {
                              showToast("No data found in file", "error");
                              return;
                            }
                            
                            // Map the headers from excel to the schema
                            const mappedData = jsonData.map((row: any) => ({
                              ProductionDate: row['Production Date'] || row['ProductionDate'] || '',
                              Shift: row['Shift'] || '',
                              ProductionType: row['Production Type'] || row['ProductionType'] || '',
                              OperatorID: row['Operator ID'] || row['OperatorID'] || '',
                              MachineNo: row['Machine no'] || row['MachineNo'] || '',
                              Year: row['Year'] || '',
                              PINumber: row['PI NUMBER'] || row['PINumber'] || row['PI Number'] || '',
                              TubeSize: row['Tube Size'] || row['TubeSize'] || '',
                              UOM: row['UOM'] || '',
                              Material: row['Material'] || '',
                              Micron: row['Micron'] || '',
                              InLinePrint: row['InLine Print'] || row['InLinePrint'] || '',
                              FinishedMeter: row['Finished Meter'] || row['FinishedMeter'] || '0',
                              FinishedKgs: row['Finished Kgs'] || row['FinishedKgs'] || '0',
                              RollLocation: row['Roll Location'] || row['RollLocation'] || '',
                              RollID: row['Roll ID'] || row['RollID'] || '',
                              DataUpdateTime: row['Data Update Time'] || row['DataUpdateTime'] || new Date().toLocaleString(),
                              Fingerprint: row['Fingerprint'] || Math.random().toString(36).substring(2, 10).toUpperCase(),
                              EnteredBy: row['Entered By'] || row['EnteredBy'] || 'Imported Data',
                              OperatorName: row['Operator Name'] || row['Opeator Name'] || row['OperatorName'] || '',
                              ScrapKgs: row['Scrap Kgs'] || row['ScrapKgs'] || '0',
                              ProductionYear: row['Production Year'] || row['ProductionYear'] || '',
                              ProductionMonth: row['Production Month'] || row['ProductionMonth'] || '',
                              MachineStatus: row['MachineStatus'] || 'Running'
                            }));

                            // Extract already existing Roll IDs to skip them
                            const existingRollIds = new Set(productionRecords.map(r => r.RollID).filter(Boolean));
                            
                            const newRecordsToUpload = mappedData.filter(d => 
                              !d.RollID || !existingRollIds.has(String(d.RollID).trim())
                            );

                            if (newRecordsToUpload.length === 0) {
                              showToast("No new records to upload. All data already exists in the system.", "success");
                              e.target.value = '';
                              return;
                            }

                            try {
                              showToast(`Found ${newRecordsToUpload.length} new records to upload...`, "success");
                              const chunkSize = 500;
                              let uploadedCount = 0;
                              
                              for (let i = 0; i < newRecordsToUpload.length; i += chunkSize) {
                                const chunk = newRecordsToUpload.slice(i, i + chunkSize);
                                const res = await fetch('/api/production/bulk', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(chunk)
                                });
                                if (!res.ok) throw new Error("Failed to import data chunk");
                                
                                uploadedCount += chunk.length;
                                showToast(`Progress: ${uploadedCount} / ${newRecordsToUpload.length} records...`, "success");
                              }

                              showToast(`All ${newRecordsToUpload.length} new records imported successfully!`, 'success');
                              await fetchProductionRecords();
                              e.target.value = ''; // Reset input
                            } catch (err) {
                              console.error(err);
                              showToast("Failed to upload to server", 'error');
                            }
                          };
                          reader.readAsArrayBuffer(file);
                        } catch (err) {
                          console.error('Error reading excel file:', err);
                          showToast("Failed to read file", 'error');
                        }
                      }}
                    />
                    <label 
                      htmlFor="excel-upload"
                      className="cursor-pointer px-4 py-2 bg-white border border-brand-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-primary hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2"
                    >
                      <Database size={14} />
                      Import Excel
                    </label>
                    <button 
                      onClick={() => {
                        const headersOrder = [
                          'EntryTimestamp', 'RollID', 'ProductionDate', 'Shift', 'ProductionType', 
                          'OperatorID', 'OperatorName', 'MachineNo', 'Year', 'PINumber', 
                          'TubeSize', 'UOM', 'Material', 'Micron', 'InLinePrint', 
                          'FinishedMeter', 'FinishedKgs', 'ScrapKgs', 'RollLocation', 
                          'Retailer', 'Customer', 'DataUpdateTime', 'Fingerprint', 
                          'EnteredBy', 'ProductionYear', 'ProductionMonth'
                        ];

                        const formattedData = filteredRecords.map((record: any) => {
                          const row: any = {};
                          headersOrder.forEach(key => {
                            row[key] = record[key] || '';
                          });
                          return row;
                        });

                        const ws = XLSX.utils.json_to_sheet(formattedData, { header: headersOrder });
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "ProductionRecords");
                        XLSX.writeFile(wb, "ProductionRecords.xlsx");
                      }}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <FileSpreadsheet size={14} />
                      Export Excel
                    </button>
                    <button 
                      onClick={() => fetchProductionRecords()}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <RefreshCw size={14} />
                      Sync Data
                    </button>
                  </div>
                </div>

                {/* Search field for old database entries */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full flex-1">
                    <div className="relative w-full md:max-w-md">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        type="text"
                        placeholder="Search records by Roll ID, Operator, Machine, PI, Material..."
                        value={recordSearchQuery}
                        onChange={(e) => setRecordSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all font-semibold"
                      />
                      {recordSearchQuery && (
                        <button 
                          onClick={() => setRecordSearchQuery("")}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-wider"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="relative flex items-center">
                      <div className="absolute left-3.5 text-slate-400">
                        <CalendarDays size={14} />
                      </div>
                      <input 
                        type="date"
                        value={dashboardDateFilter || currentProductionDateStr}
                        onChange={(e) => updateDateFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all w-[160px]"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-wider shrink-0">
                    Showing <span className="text-brand-primary font-mono">{filteredRecords.length}</span> of <span className="font-mono">{productionRecords.length}</span> records
                  </div>
                </div>

                {/* Google Sheets Sync Card */}
                <div className="glass-panel overflow-hidden border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[2300px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-sm text-center">Action</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Entry Timestamp</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Roll ID</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Date</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Shift</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Type</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Operator ID</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Operator Name</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Machine No</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Year</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">PI Number</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Tube Size</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">UOM</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Material</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Micron</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">InLine Print</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Finished Meter</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Finished KG</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Scrap Kgs</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Roll Location</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Retailer</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Customer</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Data Update Time</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Fingerprint</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Entered By</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Year</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Month</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredRecords.map((record, idx) => (
                          <tr key={record.RollID || idx} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-4 py-3 text-center sticky left-0 bg-white group-hover:bg-slate-50/80 z-10 border-r border-slate-200 shadow-sm whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setPrintEntry({ ...record })}
                                className="mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-500 text-indigo-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:shadow-indigo-500/20"
                                title="Print Sticker"
                              >
                                <Printer size={11} />
                                Print
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingEntry({ ...record })}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:shadow-brand-primary/20"
                                title="Edit entry"
                              >
                                <Edit3 size={11} />
                                Edit
                              </button>
                            </td>
                            <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{record.EntryTimestamp}</td>
                            <td className="px-4 py-3"><span className="font-mono text-[11px] font-black text-brand-primary">{record.RollID}</span></td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-700">{record.ProductionDate}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Shift}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.ProductionType}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.OperatorID}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-900">{record.OperatorName}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-900">{record.MachineNo}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Year}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.PINumber || 'N/A'}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.TubeSize} mm</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.UOM}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Material}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Micron}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.InLinePrint}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-900">{record.FinishedMeter} M</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-brand-primary">{record.FinishedKgs} KG</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-rose-500 font-bold">{record.ScrapKgs} KG</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.RollLocation}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-800 bg-slate-50/40">{record.Retailer || 'N/A'}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-800 bg-slate-50/40">{record.Customer || 'N/A'}</td>
                            <td className="px-4 py-3 text-[10px] font-mono font-medium text-slate-400">{record.DataUpdateTime}</td>
                            <td className="px-4 py-3 text-[10px] font-mono text-slate-400">{record.Fingerprint}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-500">{record.EnteredBy}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-600">{record.ProductionYear}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-600">{record.ProductionMonth}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'sample-production' && (
              <motion.div 
                key="sample-records"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <Database size={22} />
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-black text-slate-900 uppercase">Sample Production</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Full historical database of all sample manufacturing cycles</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls, .csv" 
                      id="excel-upload-sample" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            const data = new Uint8Array(event.target?.result as ArrayBuffer);
                            const XLSX = await import('xlsx');
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheet];
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
                            
                            if (jsonData.length === 0) {
                              showToast("No data found in file", "error");
                              return;
                            }
                            
                            const mappedData = jsonData.map((row: any) => ({
                              ProductionDate: row['Production Date'] || row['ProductionDate'] || '',
                              Shift: row['Shift'] || '',
                              ProductionType: 'Sample',
                              OperatorID: row['Operator ID'] || row['OperatorID'] || '',
                              MachineNo: row['Machine no'] || row['MachineNo'] || '',
                              Year: row['Year'] || '',
                              PINumber: row['PI NUMBER'] || row['PINumber'] || row['PI Number'] || '',
                              TubeSize: row['Tube Size'] || row['TubeSize'] || '',
                              UOM: row['UOM'] || '',
                              Material: row['Material'] || '',
                              Micron: row['Micron'] || '',
                              InLinePrint: row['InLine Print'] || row['InLinePrint'] || '',
                              FinishedMeter: row['Finished Meter'] || row['FinishedMeter'] || '0',
                              FinishedKgs: row['Finished Kgs'] || row['FinishedKgs'] || '0',
                              RollLocation: row['Roll Location'] || row['RollLocation'] || '',
                              RollID: row['Roll ID'] || row['RollID'] || '',
                              DataUpdateTime: row['Data Update Time'] || row['DataUpdateTime'] || new Date().toLocaleString(),
                              Fingerprint: row['Fingerprint'] || Math.random().toString(36).substring(2, 10).toUpperCase(),
                              EnteredBy: row['Entered By'] || row['EnteredBy'] || 'Imported Data',
                              OperatorName: row['Operator Name'] || row['Opeator Name'] || row['OperatorName'] || '',
                              ScrapKgs: row['Scrap Kgs'] || row['ScrapKgs'] || '0',
                              ProductionYear: row['Production Year'] || row['ProductionYear'] || '',
                              ProductionMonth: row['Production Month'] || row['ProductionMonth'] || '',
                              MachineStatus: row['MachineStatus'] || 'Running'
                            }));

                            const existingRollIds = new Set(productionRecords.map(r => r.RollID).filter(Boolean));
                            const newRecordsToUpload = mappedData.filter(d => 
                              !d.RollID || !existingRollIds.has(String(d.RollID).trim())
                            );

                            if (newRecordsToUpload.length === 0) {
                              showToast("No new records to upload. All data already exists in the system.", "success");
                              e.target.value = '';
                              return;
                            }

                            try {
                              showToast(`Found ${newRecordsToUpload.length} new records to upload...`, "success");
                              const chunkSize = 500;
                              let uploadedCount = 0;
                              
                              for (let i = 0; i < newRecordsToUpload.length; i += chunkSize) {
                                const chunk = newRecordsToUpload.slice(i, i + chunkSize);
                                const res = await fetch('/api/production/bulk', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(chunk)
                                });
                                if (!res.ok) throw new Error("Failed to import data chunk");
                                
                                uploadedCount += chunk.length;
                                showToast(`Progress: ${uploadedCount} / ${newRecordsToUpload.length} records...`, "success");
                              }

                              showToast(`All ${newRecordsToUpload.length} new sample records imported successfully!`, 'success');
                              await fetchProductionRecords();
                              e.target.value = '';
                            } catch (err) {
                              console.error(err);
                              showToast("Failed to upload to server", 'error');
                            }
                          };
                          reader.readAsArrayBuffer(file);
                        } catch (err) {
                          console.error('Error reading excel file:', err);
                          showToast("Failed to read file", 'error');
                        }
                      }}
                    />
                    <label 
                      htmlFor="excel-upload-sample"
                      className="cursor-pointer px-4 py-2 bg-white border border-brand-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-primary hover:bg-brand-primary hover:text-white transition-all flex items-center gap-2"
                    >
                      <Database size={14} />
                      Import Excel
                    </label>
                    <button 
                      onClick={() => {
                        const headersOrder = [
                          'EntryTimestamp', 'RollID', 'ProductionDate', 'Shift', 'ProductionType', 
                          'OperatorID', 'OperatorName', 'MachineNo', 'Year', 'PINumber', 
                          'TubeSize', 'UOM', 'Material', 'Micron', 'InLinePrint', 
                          'FinishedMeter', 'FinishedKgs', 'ScrapKgs', 'RollLocation', 
                          'Retailer', 'Customer', 'DataUpdateTime', 'Fingerprint', 
                          'EnteredBy', 'ProductionYear', 'ProductionMonth'
                        ];

                        const formattedData = filteredSampleRecords.map((record: any) => {
                          const row: any = {};
                          headersOrder.forEach(key => {
                            row[key] = record[key] || '';
                          });
                          return row;
                        });

                        const ws = XLSX.utils.json_to_sheet(formattedData, { header: headersOrder });
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "SampleProductionRecords");
                        XLSX.writeFile(wb, "SampleProductionRecords.xlsx");
                      }}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <FileSpreadsheet size={14} />
                      Export Excel
                    </button>
                  </div>
                </div>

                {/* Search field & Filter Toggles for sample entries */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full flex-1">
                    <div className="relative w-full md:max-w-xs">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        type="text"
                        placeholder="Search sample records..."
                        value={recordSearchQuery}
                        onChange={(e) => setRecordSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all font-semibold"
                      />
                      {recordSearchQuery && (
                        <button 
                          onClick={() => setRecordSearchQuery("")}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-wider"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Filter Mode Buttons */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 shrink-0 self-stretch sm:self-auto justify-between">
                      <button
                        onClick={() => setSampleFilterMode('last10')}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                          sampleFilterMode === 'last10' 
                            ? 'bg-white text-brand-primary shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Last 10 Days
                      </button>
                      <button
                        onClick={() => setSampleFilterMode('selected')}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                          sampleFilterMode === 'selected' 
                            ? 'bg-white text-brand-primary shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Selected Date
                      </button>
                      <button
                        onClick={() => setSampleFilterMode('all')}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                          sampleFilterMode === 'all' 
                            ? 'bg-white text-brand-primary shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        All Time
                      </button>
                    </div>

                    {/* Conditional Date Picker */}
                    {sampleFilterMode === 'selected' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative flex items-center shrink-0"
                      >
                        <div className="absolute left-3.5 text-slate-400">
                          <CalendarDays size={14} />
                        </div>
                        <input 
                          type="date"
                          value={dashboardDateFilter || currentProductionDateStr}
                          onChange={(e) => updateDateFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all w-[150px]"
                        />
                      </motion.div>
                    )}

                    {/* Date Range Indication */}
                    {sampleFilterMode === 'last10' && (
                      <div className="text-[10px] text-slate-500 font-black tracking-wider uppercase bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 shrink-0">
                        Range: {(() => {
                          const baseDateStr = dashboardDateFilter || getShiftAndDateForDhaka().productionDate;
                          const base = new Date(baseDateStr);
                          const start = new Date(base.getTime() - 9 * 24 * 60 * 60 * 1000);
                          const formatDateStr = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                          return `${formatDateStr(start)} - ${formatDateStr(base)}`;
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-wider shrink-0">
                    Showing <span className="text-brand-primary font-mono">{filteredSampleRecords.length}</span> of <span className="font-mono">{productionRecords.filter((r: any) => r.ProductionType === 'Sample').length}</span> records
                  </div>
                </div>

                {/* Sample Records Table (Excludes Actions & Sync per User Intent) */}
                <div className="glass-panel overflow-hidden border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[2100px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Entry Timestamp</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Roll ID</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Date</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Shift</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Type</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Operator ID</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Operator Name</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Machine No</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Year</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">PI Number</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Tube Size</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">UOM</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Material</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Micron</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">InLine Print</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Finished Meter</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Finished KG</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Scrap Kgs</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Roll Location</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Retailer</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Customer</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Data Update Time</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Fingerprint</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Entered By</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Year</th>
                          <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Production Month</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredSampleRecords.map((record, idx) => (
                          <tr key={record.RollID || idx} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{record.EntryTimestamp}</td>
                            <td className="px-4 py-3"><span className="font-mono text-[11px] font-black text-brand-primary">{record.RollID}</span></td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-700">{record.ProductionDate}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Shift}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.ProductionType}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.OperatorID}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-900">{record.OperatorName}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-900">{record.MachineNo}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Year}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.PINumber || 'N/A'}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.TubeSize} mm</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.UOM}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Material}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.Micron}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.InLinePrint}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-900">{record.FinishedMeter} M</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-brand-primary">{record.FinishedKgs} KG</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-rose-500 font-bold">{record.ScrapKgs} KG</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-900">{record.RollLocation}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-800 bg-slate-50/40">{record.Retailer || 'N/A'}</td>
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-800 bg-slate-50/40">{record.Customer || 'N/A'}</td>
                            <td className="px-4 py-3 text-[10px] font-mono font-medium text-slate-400">{record.DataUpdateTime}</td>
                            <td className="px-4 py-3 text-[10px] font-mono text-slate-400">{record.Fingerprint}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-500">{record.EnteredBy}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-600">{record.ProductionYear}</td>
                            <td className="px-4 py-3 text-[11px] font-medium text-slate-600">{record.ProductionMonth}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ReportsPage productionRecords={productionRecords} showToast={showToast} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Master Item Modal */}
      <AnimatePresence>
        {modalConfig && modalConfig.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalConfig(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <PlusCircle size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight">{modalConfig.title}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Adding Reference Entry</p>
                    </div>
                  </div>
                  <button onClick={() => setModalConfig(null)} className="text-slate-300 hover:text-slate-500 transition-colors">
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">VALUE / LABEL</label>
                    <input 
                      type="text" 
                      autoFocus
                      placeholder="Enter value..."
                      value={newMasterItem}
                      onChange={(e) => setNewMasterItem(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          if (!newMasterItem) return;
                          const key = modalConfig.type;
                          const updated = { ...masterStore, [key]: Array.from(new Set([...masterStore[key], newMasterItem])) };
                          setMasterStore(updated);
                          await fetch('/api/master-store', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updated)
                          });
                          showToast("Entry saved successfully", 'success');
                          setNewMasterItem("");
                          setModalConfig(null);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/5 transition-all"
                    />
                  </div>
                  
                    <button 
                      onClick={async () => {
                        if (!newMasterItem) return;
                        const key = modalConfig.type;
                        const updated = { ...masterStore, [key]: Array.from(new Set([...masterStore[key], newMasterItem])) };
                        setMasterStore(updated);
                        await fetch('/api/master-store', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(updated)
                        });
                        showToast("Entry saved successfully", 'success');
                        setNewMasterItem("");
                        setModalConfig(null);
                      }}
                      className="w-full py-4 bg-brand-primary text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-brand-primary/20 hover:brightness-110 transition-all"
                    >
                      Commit Entry
                    </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Entry Modal */}
      <AnimatePresence>
        {editingEntry && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingEntry(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-3xl text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-display font-black text-slate-900 uppercase">Correct Entry Error</h3>
                    <p className="font-mono text-[11px] font-black tracking-tight text-brand-primary">ROLL ID: {editingEntry.RollID}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleUpdateEntry} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[60vh] text-left">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    
                    {/* Production Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production Date</label>
                      <input 
                        type="date" 
                        required
                        value={editingEntry.ProductionDate || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, ProductionDate: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      />
                    </div>

                    {/* Shift */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Shift</label>
                      <select 
                        required
                        value={editingEntry.Shift || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, Shift: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      >
                        <option value="">Select Shift</option>
                        {editingEntry.Shift && !masterStore.shifts.includes(editingEntry.Shift) && (
                          <option value={editingEntry.Shift}>{editingEntry.Shift}</option>
                        )}
                        {masterStore.shifts.map((s: string) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Production Type */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production Type</label>
                      <select 
                        required
                        value={editingEntry.ProductionType || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, ProductionType: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      >
                        <option value="">Select Type</option>
                        {editingEntry.ProductionType && !masterStore.productionTypes.includes(editingEntry.ProductionType) && (
                          <option value={editingEntry.ProductionType}>{editingEntry.ProductionType}</option>
                        )}
                        {masterStore.productionTypes.map((t: string) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    {/* Operator ID */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator</label>
                      <select 
                        required
                        value={editingEntry.OperatorID || ""} 
                        onChange={(e) => {
                          const opId = e.target.value;
                          const op = operators.find(o => o.id === opId);
                          setEditingEntry({ 
                            ...editingEntry, 
                            OperatorID: opId, 
                            OperatorName: op ? op.name : editingEntry.OperatorName 
                          });
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      >
                        <option value="">Select Operator</option>
                        {editingEntry.OperatorID && !operators.some((op: any) => op.id === editingEntry.OperatorID) && (
                          <option value={editingEntry.OperatorID}>{editingEntry.OperatorID} ({editingEntry.OperatorName || 'Unknown Operator'})</option>
                        )}
                        {operators.map((op: any) => <option key={op.id} value={op.id}>{op.id} ({op.name})</option>)}
                      </select>
                    </div>

                    {/* Machine No */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Machine No</label>
                      <select 
                        required
                        value={editingEntry.MachineNo || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, MachineNo: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary"
                      >
                        <option value="">Select Machine</option>
                        {editingEntry.MachineNo && !(masterStore.machineList || []).includes(editingEntry.MachineNo) && (
                          <option value={editingEntry.MachineNo}>{editingEntry.MachineNo}</option>
                        )}
                        {(masterStore.machineList && masterStore.machineList.length > 0 ? masterStore.machineList : machines.map((m: any) => m.id)).map((m: string) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    {/* Year */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Year</label>
                      <select 
                        required
                        value={editingEntry.Year || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, Year: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none"
                      >
                        <option value="">Select Year</option>
                        {editingEntry.Year && !masterStore.years.includes(editingEntry.Year) && (
                          <option value={editingEntry.Year}>{editingEntry.Year}</option>
                        )}
                        {masterStore.years.map((y: string) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>

                    {/* PI Number */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PI Number</label>
                      <input 
                        type="text" 
                        required
                        value={editingEntry.PINumber || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, PINumber: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      />
                    </div>

                    {/* Tube Size */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tube Size (mm)</label>
                      <input 
                        type="text" 
                        required
                        value={editingEntry.TubeSize || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, TubeSize: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      />
                    </div>

                    {/* UOM */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">UOM</label>
                      <select 
                        required
                        value={editingEntry.UOM || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, UOM: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20"
                      >
                        <option value="">Select UOM</option>
                        {editingEntry.UOM && !masterStore.uoms.includes(editingEntry.UOM) && (
                          <option value={editingEntry.UOM}>{editingEntry.UOM}</option>
                        )}
                        {masterStore.uoms.map((u: string) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>

                    {/* Material */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Raw Material</label>
                      <select 
                        required
                        value={editingEntry.Material || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, Material: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary"
                      >
                        <option value="">Select Material</option>
                        {editingEntry.Material && !masterStore.materials.includes(editingEntry.Material) && (
                          <option value={editingEntry.Material}>{editingEntry.Material}</option>
                        )}
                        {masterStore.materials.map((m: string) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    {/* Micron */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Micron</label>
                      <input 
                        type="number" 
                        required
                        value={editingEntry.Micron || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, Micron: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      />
                    </div>

                    {/* InLine Print */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In-Line Print</label>
                      <select 
                        required
                        value={editingEntry.InLinePrint || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, InLinePrint: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20"
                      >
                        <option value="">Select InLine Print</option>
                        {editingEntry.InLinePrint && !masterStore.inlinePrintOptions.includes(editingEntry.InLinePrint) && (
                          <option value={editingEntry.InLinePrint}>{editingEntry.InLinePrint}</option>
                        )}
                        {masterStore.inlinePrintOptions.map((o: string) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    {/* Finished Meter */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Finished Meter</label>
                      <input 
                        type="number" 
                        required
                        value={editingEntry.FinishedMeter || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, FinishedMeter: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Finished Kgs */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Finished KG</label>
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        value={editingEntry.FinishedKgs || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, FinishedKgs: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all font-bold text-brand-primary"
                      />
                    </div>

                    {/* Scrap Kgs */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-rose-500">Waste Scrap (KG)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        value={editingEntry.ScrapKgs || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, ScrapKgs: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all text-rose-500 font-bold"
                      />
                    </div>

                    {/* Roll Location */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll Location</label>
                      <input 
                        type="text" 
                        required
                        value={editingEntry.RollLocation || ""} 
                        onChange={(e) => setEditingEntry({ ...editingEntry, RollLocation: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/5 transition-all"
                      />
                    </div>

                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-3xl">
                  <button 
                    type="button" 
                    onClick={() => setEditingEntry(null)}
                    className="px-5 py-2.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors text-xs font-black uppercase tracking-widest cursor-pointer"
                  >
                    Discard Changes
                  </button>
                  <button 
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-8 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] shadow-xl shadow-brand-primary/10 hover:brightness-110 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    {isSavingEdit ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Save Changes</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className={cn(
              "px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border",
              toast.type === 'success' ? "bg-emerald-500 text-slate-950 border-emerald-400" : "bg-rose-500 text-white border-rose-400"
            )}>
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <span className="font-bold">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

// Sub-components
function SidebarLink({ icon, label, active, onClick, isOpen = true }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, isOpen?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center px-5 py-3.5 rounded-2xl transition-all group relative overflow-hidden",
        isOpen ? "gap-4" : "justify-center",
        active 
          ? "bg-brand-primary/5 text-brand-primary font-bold shadow-sm" 
          : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
      )}
      title={!isOpen ? label : undefined}
    >
      {active && (
        <motion.div 
          layoutId="sidebar-active"
          className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-primary rounded-r-full"
        />
      )}
      <span className={cn("transition-colors duration-300 shrink-0", active ? "text-brand-primary" : "group-hover:text-brand-primary")}>
        {icon}
      </span>
      {isOpen && (
        <span className="text-[11px] font-bold tracking-widest uppercase whitespace-nowrap">{label}</span>
      )}
    </button>
  );
}

function MetricHead({ label, value, unit, color = "text-slate-900" }: { label: string, value: string, unit: string, color?: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold mb-1">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-lg font-mono font-bold leading-none", color)}>{value}</span>
        <span className="text-[10px] font-bold text-slate-300 font-mono">{unit}</span>
      </div>
    </div>
  );
}

function StatCard({ title, value, unit, trend, icon }: { title: string, value: string, unit: string, trend: string, icon: React.ReactNode }) {
  return (
    <div className="glass-panel p-8 group hover:border-brand-primary/20 transition-all duration-300 panel-glow relative shadow-sm border-slate-100">
      <div className="flex justify-between items-start mb-6">
        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-sm shadow-slate-200/50">
          {icon}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">{unit}</p>
        </div>
      </div>
      <div className="space-y-1">
        <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">{title}</h4>
        <div className="flex items-baseline gap-2">
          <p className="text-4xl font-display font-bold text-slate-900 tracking-tighter transition-all">{value}</p>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-2">
        <div className="px-2 py-0.5 rounded-md bg-emerald-500/5 border border-emerald-500/10 text-[9px] font-bold text-brand-success uppercase tracking-wider">
          {trend}
        </div>
      </div>
    </div>
  );
}

function MachineCard({ machine }: { machine: MachineSummary, key?: string | number }) {
  const statusColors = {
    Running: 'text-brand-success border-brand-success/10 bg-brand-success/5',
    Idle: 'text-brand-warning border-brand-warning/10 bg-brand-warning/5',
    Breakdown: 'text-brand-danger border-brand-danger/10 bg-brand-danger/5'
  };

  const statusGlow = {
    Running: 'status-running-glow',
    Idle: 'status-idle-glow',
    Breakdown: 'status-breakdown-glow'
  };

  return (
    <div className="glass-panel p-6 group hover:border-brand-primary/20 transition-all duration-500 relative panel-glow shadow-sm border-slate-100">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-lg font-display font-bold text-slate-900 tracking-tight">{machine.MachineNo}</h4>
            <div className={cn(
              "status-indicator",
              statusGlow[machine.MachineStatus as keyof typeof statusGlow] || statusGlow.Idle,
              machine.MachineStatus === 'Running' ? 'bg-brand-success' : machine.MachineStatus === 'Idle' ? 'bg-brand-warning' : 'bg-brand-danger'
            )} />
          </div>
          <div className={cn(
            "inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border",
            statusColors[machine.MachineStatus as keyof typeof statusColors] || statusColors.Idle
          )}>
            {machine.MachineStatus}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">REFRESHED</p>
          <p className="text-[10px] font-mono text-slate-400">
            {machine.LastUpdate === 'N/A' ? 'OFFLINE' : new Date(machine.LastUpdate).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {machine.Reason && machine.Reason !== 'NO_ALERTS' && machine.Reason.trim() !== '' && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-orange-50 border border-orange-100 flex items-center gap-2">
          <AlertTriangle size={12} className="text-brand-warning" />
          <p className="text-[10px] font-medium text-brand-warning italic line-clamp-1">
            {machine.Reason}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 border-y border-slate-100 py-4 mb-4">
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.1em] mb-1">PROD</p>
          <p className="text-sm font-mono font-bold text-slate-700">{machine.TotalProductionKgs}<span className="text-[10px] ml-1 opacity-40">KG</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.1em] mb-1">SPEED</p>
          <p className="text-sm font-mono font-bold text-slate-700">{machine.TotalMeter}<span className="text-[10px] ml-1 opacity-40">M</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.1em] mb-1">BATCH</p>
          <p className="text-sm font-mono font-bold text-slate-700">{machine.TotalRolls}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-end">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">QUOTA PROGRESS</span>
          <span className="text-[10px] font-mono font-bold text-brand-primary leading-none">
            {Math.round((machine.TotalProductionKgs / machine.TargetKgs) * 100)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((machine.TotalProductionKgs / machine.TargetKgs) * 100, 100)}%` }}
            className={cn(
              "h-full transition-all duration-1000",
              machine.MachineStatus === 'Running' ? 'bg-brand-primary' : 'bg-slate-300'
            )}
          />
        </div>
      </div>
    </div>
  );
}

function StatusLegend({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-100 shadow-sm">
      <div className={cn("w-2 h-2 rounded-full", color)} />
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

function getFocusableElements(form: HTMLFormElement) {
  return Array.from(
    form.querySelectorAll('input:not([type="hidden"]), select')
  ).filter((el: any) => {
    return el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled;
  }) as HTMLElement[];
}

function InputField({ label, name, icon, ...props }: any) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentInput = e.currentTarget;
      const form = currentInput.closest('form');
      if (form) {
        const focusable = getFocusableElements(form);
        const index = focusable.indexOf(currentInput);
        if (index > -1 && index < focusable.length - 1) {
          const nextElement = focusable[index + 1];
          nextElement.focus();
          if (nextElement instanceof HTMLInputElement && nextElement.type !== 'date') {
            nextElement.select();
          }
        }
      }
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-[9px] font-black text-brand-primary uppercase tracking-widest flex items-center gap-1.5 ml-1">
        {icon}
        {label}
      </label>
      <input 
        name={name}
        onKeyDown={handleKeyDown}
        {...props}
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-200 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/10 focus:scale-[1.01] transition-all font-medium h-[34px]"
      />
    </div>
  );
}

function SelectField({ label, name, icon, options = [], placeholder, value, onChange, clearable = true, ...props }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Update searchQuery when value changes (e.g. cleared after form submit)
  useEffect(() => {
    setSearchQuery(value || '');
  }, [value]);

  const query = searchQuery.toLowerCase().trim();
  const filteredOptions = Array.from(new Set(options || [])).filter((opt: any) =>
    opt ? String(opt).toLowerCase().includes(query) : false
  ).sort((a: any, b: any) => {
    const aStr = String(a).toLowerCase();
    const bStr = String(b).toLowerCase();
    const aStarts = aStr.startsWith(query);
    const bStarts = bStr.startsWith(query);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    // Prioritize earlier matches if it doesn't strictly start with the query
    const aIndex = aStr.indexOf(query);
    const bIndex = bStr.indexOf(query);
    if (aIndex !== bIndex) return aIndex - bIndex;
    
    return 0;
  });

  // Reset focused index when query or filtered options change
  useEffect(() => {
    setFocusedIndex(0);
  }, [searchQuery, isOpen, options]);

  const handleSelect = (opt: string) => {
    if (onChange) {
      onChange({ target: { name, value: opt } });
    }
    setIsOpen(false);
    setSearchQuery(opt);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) {
      onChange({ target: { name, value: '' } });
    }
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        setFocusedIndex(0);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const currentInput = e.currentTarget;
        const form = currentInput.closest('form');
        if (form) {
          const focusable = getFocusableElements(form);
          const index = focusable.indexOf(currentInput);
          if (index > -1 && index < focusable.length - 1) {
            const nextElement = focusable[index + 1];
            nextElement.focus();
            if (nextElement instanceof HTMLInputElement && nextElement.type !== 'date') {
              nextElement.select();
            }
          }
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        const nextIndex = prev + 1;
        return nextIndex < filteredOptions.length ? nextIndex : 0;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        const nextIndex = prev - 1;
        return nextIndex >= 0 ? nextIndex : filteredOptions.length - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        const indexToSelect = (focusedIndex >= 0 && focusedIndex < filteredOptions.length) ? focusedIndex : 0;
        const selectedValue = filteredOptions[indexToSelect];
        handleSelect(selectedValue as string);
        
        // Auto-navigate to next field
        setTimeout(() => {
          if (dropdownRef.current) {
            const currentInput = dropdownRef.current.querySelector('input');
            if (currentInput) {
              const form = currentInput.closest('form');
              if (form) {
                const focusable = getFocusableElements(form);
                const index = focusable.indexOf(currentInput);
                if (index > -1 && index < focusable.length - 1) {
                  const nextElement = focusable[index + 1];
                  nextElement.focus();
                  if (nextElement instanceof HTMLInputElement && nextElement.type !== 'date') {
                    nextElement.select();
                  }
                }
              }
            }
          }
        }, 50);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="space-y-1 relative" ref={dropdownRef}>
      <label className="text-[9px] font-black text-brand-primary uppercase tracking-widest flex items-center gap-1.5 ml-1">
        {icon}
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder || "Type Here"}
          value={isOpen ? searchQuery : (value || '')}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchQuery('');
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-primary/20 focus:border-brand-primary focus:bg-brand-primary/10 focus:scale-[1.01] transition-all font-medium h-[34px] cursor-text"
        />
        
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400">
          {clearable && value && (
            <button
              type="button"
              onClick={handleClear}
              className="hover:text-rose-500 focus:outline-none p-0.5"
            >
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsOpen(!isOpen);
              if (!isOpen) setSearchQuery('');
            }}
            className="focus:outline-none hover:text-slate-600 p-0.5"
          >
            <ChevronDown size={12} className={cn("transition-transform duration-200", isOpen && "rotate-180")} />
          </button>
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-48 flex flex-col animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Options List */}
            <div className="overflow-y-auto py-1 max-h-48 divide-y divide-slate-50">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400 text-center italic font-semibold">
                  No options found
                </div>
              ) : (
                filteredOptions.map((opt: string, index: number) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs font-semibold transition-colors cursor-pointer block truncate",
                      focusedIndex === index 
                        ? "bg-brand-primary/5 text-brand-primary font-bold" 
                        : (value === opt ? "bg-slate-50 text-brand-primary font-black" : "text-slate-700")
                    )}
                  >
                    {opt}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BangladeshLiveWatch() {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = timeFormatter.format(time);
  const formattedDate = dateFormatter.format(time);

  return (
    <div className="inline-flex items-center gap-3 bg-slate-50 border border-slate-150 rounded-xl px-4 py-2 hover:border-brand-primary/20 transition-all duration-300">
      <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0 relative">
        <Clock size={16} className="animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 flex items-center gap-1.5">
          Bangladesh Standard Time
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
        </span>
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="font-mono text-sm font-black text-slate-900 tracking-tight leading-none">
            {formattedTime}
          </span>
          <span className="text-[8px] font-black text-brand-primary uppercase font-mono tracking-widest leading-none">
            BST
          </span>
        </div>
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1 leading-none">
          {formattedDate}
        </span>
      </div>
    </div>
  );
}

