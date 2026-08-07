# Local Database & Execution Instructions / লোকাল ডাটাবেস সেটআপ নির্দেশিকা

এই প্রজেক্টটি **Microsoft SQL Server (LocalDB)** এবং **Standard SQL Server (TCP/IP)** উভয় কানেকশন সাপোর্ট করার জন্য আপডেট করা হয়েছে।

---

## 1. LocalDB দিয়ে রান করার উপায় (Recommended for Visual Studio LocalDB)

আপনার কম্পিউটারে যদি `(localdb)\MSSQLLocalDB` ইনস্টল করা থাকে:

1. Windows LocalDB কানেক্ট করার জন্য Native Driver প্রয়োজন। আপনার প্রজেক্ট ফোল্ডারে টার্মিনাল খুলে এই কমান্ডটি দিন:
   ```bash
   npm install msnodesqlv8
   ```

2. `.env` ফাইলে নিচের লাইনগুলো সক্রিয় নিশ্চিত করুন:
   ```env
   DB_TYPE="mssql"
   MSSQL_CONNECTION_STRING="Server=(localdb)\MSSQLLocalDB;Database=MPBL_EXTRUSION_DB;Trusted_Connection=Yes;TrustServerCertificate=True;"
   ```

3. SQL Server-এ **`MPBL_EXTRUSION_DB`** নামের ডাটাবেস তৈরি করা আছে কিনা নিশ্চিত করুন। (প্রয়োজনে `Extrusion` বা আপনার বর্তমান ডাটাবেস নাম আপডেট করতে পারেন)।

4. টার্মিনালে নিচের কমান্ডটি চালিয়ে অ্যাপ চালু করুন:
   ```bash
   npm run dev
   ```

---

## 2. Port 3000 Error (`EADDRINUSE`) সমাধান

যদি `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000` মেসেজ দেখায়, এর মানে হলো আপনার পিসিতে আগেই একটি Node প্রসেস বা আগের টার্মিনাল চালু আছে।

**সমাধান:**
PowerShell এ নিচের কমান্ডটি দিয়ে আগের প্রসেসটি বন্ধ করুন:
```powershell
Stop-Process -Name "node" -Force
```
অথবা:
```cmd
taskkill /F /IM node.exe
```
এরপর আবার `npm run dev` দিন।

---

## 2. Full SQL Server (SQL Authentication / `sa` User) দিয়ে রান করার উপায়

যদি আপনি SQL Server Express বা Full SQL Server ব্যবহার করেন এবং `sa` ইউজার দিয়ে কানেক্ট করতে চান:

1. `.env` ফাইলে নিচের সেটিংস ব্যবহার করুন:
   ```env
   DB_TYPE="mssql"
   MSSQL_SERVER="127.0.0.1"
   MSSQL_PORT=1433
   MSSQL_DATABASE="MPBL_EXTRUSION_DB"
   MSSQL_USER="sa"
   MSSQL_PASSWORD="your_password_here"
   MSSQL_ENCRYPT="false"
   MSSQL_TRUST_CERT="true"
   ```

2. **SQL Server Configuration Manager** থেকে **TCP/IP Protocol** Enable করা আছে এবং Port **1433** অন আছে কিনা নিশ্চিত করুন।

---

## 3. স্বয়ংক্রিয় ব্যাকআপ সিস্টেম (Automatic Fallback)

যদি কোনো কারণে আপনার MS SQL Server কানেক্ট না হয় বা বন্ধ থাকে, অ্যাপটি বন্ধ হবে না। এটি স্বয়ংক্রিয়ভাবে **`api/db_fallback.json`** লোকাল ফাইলে ডাটা সেভ ও রিড করবে। কানেকশন ঠিক হলে ডাটাবেসে কানেক্ট হয়ে যাবে।

---

## 4. কিভাবে জিপ / প্রজেক্ট ডাউনলোড করবেন?

1. AI Studio UI-এর উপরে ডানদিকের **Settings / Export** মেনুতে যান।
2. **Export to ZIP** বা **Download** সিলেক্ট করুন।
3. জিপ এক্সট্র্যাক্ট করে ফোল্ডারে টার্মিনাল খুলে টাইপ করুন:
   ```bash
   npm install
   npm run dev
   ```
