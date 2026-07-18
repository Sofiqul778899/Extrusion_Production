import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function normalizeDateString(dateStr: string | number): string {
  if (!dateStr) return '';
  if (typeof dateStr === 'number') {
    // Excel date number (days since 1900)
    const d = new Date((dateStr - (25567 + 2)) * 86400 * 1000);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  
  const str = String(dateStr).trim();
  
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // MM/DD/YYYY or DD/MM/YYYY or similar
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (e) {}

  return str;
}

export function getShiftAndDateForDhaka(date: Date = new Date()): { productionDate: string, shift: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    parts.forEach(p => {
      partMap[p.type] = p.value;
    });
    
    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10) - 1; // 0-indexed
    const day = parseInt(partMap.day, 10);
    const hour = parseInt(partMap.hour, 10); // 0-23
    
    // Create local Date from the parts
    const dhakaTime = new Date(year, month, day, hour, parseInt(partMap.minute || "0", 10));
    
    let productionDate = new Date(dhakaTime.getTime());
    let shift = 'Day';
    
    // Operational day starts at 08:00 AM (08:00).
    // Night shift is 20:00 (08:00 PM) to 08:00 AM (next morning)
    if (hour < 8) {
      // It belongs to the previous calendar day's night shift
      productionDate.setDate(productionDate.getDate() - 1);
      shift = 'Night';
    } else if (hour >= 8 && hour < 20) {
      shift = 'Day';
    } else {
      shift = 'Night';
    }
    
    const yyyy = productionDate.getFullYear();
    const mm = String(productionDate.getMonth() + 1).padStart(2, '0');
    const dd = String(productionDate.getDate()).padStart(2, '0');
    
    return {
      productionDate: `${yyyy}-${mm}-${dd}`,
      shift
    };
  } catch (err) {
    // Graceful fallback to client UTC/local
    const hour = date.getHours();
    let productionDate = new Date(date.getTime());
    let shift = 'Day';
    if (hour < 8) {
      productionDate.setDate(productionDate.getDate() - 1);
      shift = 'Night';
    } else if (hour >= 8 && hour < 20) {
      shift = 'Day';
    } else {
      shift = 'Night';
    }
    const yyyy = productionDate.getFullYear();
    const mm = String(productionDate.getMonth() + 1).padStart(2, '0');
    const dd = String(productionDate.getDate()).padStart(2, '0');
    return {
      productionDate: `${yyyy}-${mm}-${dd}`,
      shift
    };
  }
}

export function generateRollId(lastNo: number, prefix: string, year: string): string {
  return `${prefix}-${lastNo + 1}-${year}`;
}
