import React, { useState, useRef } from 'react';
import { 
  FileUp, 
  FileSpreadsheet, 
  Trash2, 
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Layers
} from 'lucide-react';

interface PendingOrderInfo {
  filename: string;
  uploadedAt: string;
  totalRows?: number;
  webViewLink: string;
  spreadsheetId?: string;
}

interface PendingOrderPageProps {
  pendingOrderInfo: PendingOrderInfo | null;
  setPendingOrderInfo: (info: PendingOrderInfo | null) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  fetchPendingOrderInfo: () => Promise<void>;
}

export default function PendingOrderPage({
  pendingOrderInfo,
  setPendingOrderInfo,
  showToast,
  fetchPendingOrderInfo
}: PendingOrderPageProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processAndUploadFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndUploadFile(file);
    }
  };

  const processAndUploadFile = (file: File) => {
    const fileType = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isValidExcel = ['.xlsx', '.xls', '.csv'].includes(fileType);
    
    if (!isValidExcel) {
      showToast("দয়া করে Excel (.xlsx, .xls) অথবা .csv ফাইল আপলোড করুন।", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Content = event.target?.result as string;
      setIsUploading(true);
      try {
        const res = await fetch("/api/pending-orders/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Content,
            filename: file.name
          })
        });

        if (res.ok) {
          const result = await res.json();
          setPendingOrderInfo(result);
          showToast(`"${file.name}" পেন্ডিং অর্ডার ডাটাবেসে সফলভাবে আপডেট হয়েছে!`, "success");
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.details 
            ? `${errData.error}: ${errData.details}` 
            : (errData.error || "ডাটাবেসে ফাইল আপলোড করতে ব্যর্থ হয়েছে।");
          showToast(errMsg, "error");
        }
      } catch (err: any) {
        showToast("আপলোড এরর: " + err.message, "error");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      showToast("ফাইল পড়তে সমস্যা হয়েছে।", "error");
    };

    reader.readAsDataURL(file);
  };

  const handleClearFile = async () => {
    if (!window.confirm("আপনি কি নিশ্চিতভাবে ডাটাবেস থেকে এই পেন্ডিং অর্ডারগুলোর ডাটা ক্লিয়ার করতে চান?")) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch("/api/pending-orders/current", {
        method: "DELETE"
      });
      if (res.ok) {
        setPendingOrderInfo(null);
        showToast("ডাটাবেস থেকে পেন্ডিং অর্ডারের ডাটা সফলভাবে ক্লিয়ার হয়েছে!", "success");
      } else {
        showToast("ডাটা ক্লিয়ার করতে ব্যর্থ হয়েছে।", "error");
      }
    } catch (err: any) {
      showToast("এরর: " + err.message, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchPendingOrderInfo();
      showToast("মেটাডাটা রিফ্রেশ করা হয়েছে।", "success");
    } catch (e) {
      showToast("রিফ্রেশ করা যায়নি।", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatDateString = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        timeZone: 'Asia/Dhaka',
        dateStyle: 'medium',
        timeStyle: 'medium'
      });
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6" id="pending_order_widget">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Upload Zone (Left/Full) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-brand-border rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-brand-border flex items-center gap-2">
              <FileUp className="text-brand-primary" size={20} />
              <h3 className="font-display font-black text-slate-800 uppercase tracking-tight text-sm">Upload New Sheet</h3>
            </div>
            
            <div className="p-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                  isDragOver 
                    ? "border-brand-primary bg-brand-primary/5 scale-[0.99] shadow-inner" 
                    : "border-slate-300 hover:border-brand-primary bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden" 
                />
                
                {isUploading ? (
                  <div className="space-y-4 py-6">
                    <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto text-brand-primary">
                      <RefreshCw size={32} className="animate-spin text-brand-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-wider">Parsing &amp; Saving to Database...</p>
                      <p className="text-xs text-slate-500 mt-1">Please wait while the server writes the rows to the database...</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 hover:text-brand-primary transition-colors">
                      <UploadCloud size={32} className="text-slate-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-wide">
                        Drag &amp; Drop Excel / CSV file
                      </p>
                      <p className="text-xs text-slate-500">
                        or <span className="text-brand-primary font-bold underline">browse your computer</span>
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                      Supported extensions: .xlsx, .xls, .csv
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Current Active File Info (Right) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-brand-border rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="text-amber-500" size={20} />
                <h3 className="font-display font-black text-slate-800 uppercase tracking-tight text-sm">Database Connection</h3>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  title="Refresh status from Database"
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
                </button>
                {pendingOrderInfo ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                    <CheckCircle2 size={10} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <AlertCircle size={10} /> No Records
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {pendingOrderInfo ? (
                <div className="space-y-6">
                  {/* Info card */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3 relative overflow-hidden">
                    <div className="absolute right-2 top-2 text-slate-200 opacity-20">
                      <FileSpreadsheet size={80} />
                    </div>
                    
                    <div className="space-y-1 relative">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">LAST IMPORTED FILE</p>
                      <p className="text-sm font-bold text-slate-800 break-words">{pendingOrderInfo.filename}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 relative border-t border-slate-200/50">
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Clock size={8} /> IMPORT TIME
                        </p>
                        <p className="text-xs font-semibold text-slate-700">{formatDateString(pendingOrderInfo.uploadedAt)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          TOTAL DATA ROWS
                        </p>
                        <p className="text-xs font-black text-slate-800">
                          {pendingOrderInfo.totalRows || 'N/A'} rows
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions list */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Local Database Access</p>
                    
                    <div className="w-full p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-slate-700 text-xs font-medium space-y-1">
                      <p className="font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide text-[9px]">
                        <CheckCircle2 size={12} className="text-emerald-600" /> Secure SQL Database Storage
                      </p>
                      <p className="text-[11px] leading-relaxed text-slate-600">
                        Pending orders are saved directly in your SQL database (`pending_orders` table). These are automatically matched to PI Numbers during production data entry.
                      </p>
                    </div>

                    <button
                      onClick={handleClearFile}
                      disabled={isDeleting}
                      className="w-full mt-4 flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 hover:text-rose-700 transition-colors text-xs font-black uppercase tracking-wider disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Clearing Data...
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          Clear Pending Data
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">No Active Connection</h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
                      ডাটাবেসে কোনো পেন্ডিং অর্ডার লোড করা নেই। বাম পাশের বোতামটি ব্যবহার করে Excel বা CSV আপলোড করুন।
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
