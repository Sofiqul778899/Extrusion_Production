# Production Deployment Guide: React Frontend & C# Web API Backend on Windows IIS

This document provides a comprehensive, step-by-step guide to deploying the **Extrusion Production Management System** on a **Windows Server / IIS environment** with **Microsoft SQL Server**.

---

## 📋 Table of Contents
1. [System Prerequisites](#1-system-prerequisites)
2. [Step 1: Database Setup (Microsoft SQL Server)](#step-1-database-setup-microsoft-sql-server)
3. [Step 2: Database Connection String Setup](#step-2-database-connection-string-setup)
4. [Step 3: C# Web API Backend Build & Deployment (`csharp_backend`)](#step-3-c-web-api-backend-build--deployment-csharp_backend)
5. [Step 4: React Frontend Build & Deployment](#step-4-react-frontend-build--deployment)
6. [Step 5: IIS Installation & Configuration](#step-5-iis-installation--configuration)
   - [5.1 Install IIS and ASP.NET Core Hosting Bundle](#51-install-iis-and-aspnet-core-hosting-bundle)
   - [5.2 Install IIS URL Rewrite Module](#52-install-iis-url-rewrite-module)
   - [5.3 Configure C# Web API Application in IIS](#53-configure-c-web-api-application-in-iis)
   - [5.4 Configure React Frontend Application in IIS](#54-configure-react-frontend-application-in-iis)
7. [Step 6: Frontend SPA Routing & Reverse Proxy Configuration (`web.config`)](#step-6-frontend-spa-routing--reverse-proxy-configuration-webconfig)
8. [Step 7: Permissions & Application Pool Setup](#step-7-permissions--application-pool-setup)
9. [Step 8: Verification & Troubleshooting](#step-8-verification--troubleshooting)

---

## 1. System Prerequisites

Ensure the target Windows Server (Windows Server 2016, 2019, 2022, or Windows 10/11 Pro) has the following software installed:

| Component | Minimum Version / Detail | Download Link / Notes |
| :--- | :--- | :--- |
| **Windows IIS** | IIS 10.0+ with CGI, Static Content, HTTP Redirection | Enabled via Server Manager or Windows Features |
| **.NET SDK & Hosting Bundle** | .NET 8.0 SDK & ASP.NET Core Runtime 8.0 Hosting Bundle | [Download ASP.NET Core Hosting Bundle](https://dotnet.microsoft.com/download/dotnet/8.0) |
| **IIS URL Rewrite Module** | URL Rewrite 2.1 | [Download URL Rewrite Module](https://www.iis.net/downloads/microsoft/url-rewrite) |
| **Node.js & npm** | Node.js v18.0+ or v20.0+ | [Download Node.js](https://nodejs.org/) (Required for building React frontend) |
| **Microsoft SQL Server** | SQL Server 2016+ / SQL Express / LocalDB | SQL Server Management Studio (SSMS) recommended |

---

## Step 1: Database Setup (Microsoft SQL Server)

1. **Open SQL Server Management Studio (SSMS)** and connect to your SQL Server instance (e.g., `localhost`, `127.0.0.1`, or `(localdb)\MSSQLLocalDB`).
2. Open a **New Query** window.
3. Locate the `mssql_schema.sql` file in the project repository root.
4. Copy and execute the contents of `mssql_schema.sql`.

This script automatically:
- Creates the **`Extrusion_DB`** database if it does not already exist.
- Creates all required tables:
  - `dbo.app_config`
  - `dbo.operators`
  - `dbo.machines`
  - `dbo.pending_orders`
  - `dbo.production_records`
  - `dbo.machine_logs`
  - `dbo.machine_daily_stats`
- Seeds initial default data (machine lists, operator master entries, app configs).

5. **Enable TCP/IP Protocol in SQL Server** (if using SQL Server Standard / Express over network or standard user login):
   - Open **SQL Server Configuration Manager**.
   - Expand **SQL Server Network Configuration** > **Protocols for MSSQLSERVER** (or SQLEXPRESS).
   - Right-click **TCP/IP** and select **Enable**.
   - Under TCP/IP Properties > **IP Addresses**, ensure **IPAll** has **TCP Port** set to `1433`.
   - Restart the **SQL Server Service**.

---

## Step 2: Database Connection String Setup

The C# backend uses Entity Framework Core to connect to SQL Server. Configure your connection string in `csharp_backend/appsettings.json` or create `csharp_backend/appsettings.Production.json`.

### Option A: SQL Server Authentication (`sa` or custom DB user - Recommended for IIS)
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=127.0.0.1,1433;Initial Catalog=Extrusion_DB;User ID=sa;Password=YourStrongPasswordHere;TrustServerCertificate=True;Encrypt=True;"
  }
}
```

### Option B: Windows Integrated Authentication (Using IIS ApplicationPoolIdentity)
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR-SERVER-NAME;Database=Extrusion_DB;Integrated Security=True;TrustServerCertificate=True;Encrypt=True;"
  }
}
```
*Note: For Windows Integrated Auth, you must grant database permissions in SQL Server to `IIS AppPool\ExtrusionApiAppPool`.*

### Option C: LocalDB Connection String (Development / Single Machine IIS)
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=(localdb)\\MSSQLLocalDB;Database=Extrusion_DB;Trusted_Connection=Yes;TrustServerCertificate=True;"
  }
}
```

---

## Step 3: C# Web API Backend Build & Deployment (`csharp_backend`)

1. Open PowerShell or Command Prompt in the repository root directory.
2. Publish the C# Web API project targeting **Release** mode:

```powershell
dotnet publish csharp_backend/MPBL.Extrusion.Api.csproj -c Release -o C:\inetpub\wwwroot\ExtrusionApi
```

3. Confirm that `C:\inetpub\wwwroot\ExtrusionApi` contains:
   - `MPBL.Extrusion.Api.dll`
   - `web.config` (automatically generated by `dotnet publish`)
   - `appsettings.json`
   - Dependencies and DLL assets.

4. Check `web.config` inside `C:\inetpub\wwwroot\ExtrusionApi\web.config`. It should look similar to:
```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath="dotnet" arguments=".\MPBL.Extrusion.Api.dll" stdoutLogEnabled="true" stdoutLogFile=".\logs\stdout" hostingModel="inprocess" />
    </system.webServer>
  </location>
</configuration>
```

---

## Step 4: React Frontend Build & Deployment

1. In your project root, install Node dependencies if not already done:
```powershell
npm install
```

2. Open or create `.env.production` in the project root to set the production API endpoint URL:
```env
VITE_API_BASE_URL="http://localhost:5000"
```
*(Or if proxying via IIS on the same port, set to `/api`)*

3. Build the static production distribution files:
```powershell
npm run build
```

4. The compiled React files will be placed inside the `dist/` directory.
5. Create a target directory in IIS root, for example `C:\inetpub\wwwroot\ExtrusionApp`.
6. Copy all files and folders from `dist/` into `C:\inetpub\wwwroot\ExtrusionApp`.

---

## Step 5: IIS Installation & Configuration

### 5.1 Install IIS and ASP.NET Core Hosting Bundle
1. Open **Server Manager** > **Manage** > **Add Roles and Features**.
2. Select **Web Server (IIS)** role and ensure the following features are selected:
   - Common HTTP Features: Static Content, Default Document, HTTP Errors
   - Application Development: .NET Extensibility 4.8, ASP.NET 4.8, ISAPI Extensions, ISAPI Filters
3. Download and install the **[ASP.NET Core 8.0 Hosting Bundle](https://dotnet.microsoft.com/download/dotnet/8.0)**.
4. Open PowerShell as Administrator and restart IIS to register the ASP.NET Core module:
```powershell
net stop was /y
net start w3svc
```

### 5.2 Install IIS URL Rewrite Module
1. Download and run **[IIS URL Rewrite Module 2.1](https://www.iis.net/downloads/microsoft/url-rewrite)** (`rewrite_x64.msi`).
2. Complete the installation wizard.

### 5.3 Configure C# Web API Application in IIS
1. Open **IIS Manager** (`inetmgr`).
2. Right-click **Application Pools** > **Add Application Pool**:
   - **Name**: `ExtrusionApiAppPool`
   - **.NET CLR Version**: **No Managed Code** *(Crucial for ASP.NET Core)*
   - **Managed pipeline mode**: Integrated
3. Right-click **Sites** > **Add Website**:
   - **Site name**: `ExtrusionApi`
   - **Application pool**: `ExtrusionApiAppPool`
   - **Physical path**: `C:\inetpub\wwwroot\ExtrusionApi`
   - **Port**: `5000` (or your preferred API port e.g. `8080`)
4. Test the API backend by browsing to `http://localhost:5000/swagger` or `http://localhost:5000/api/machines`.

### 5.4 Configure React Frontend Application in IIS
1. In IIS Manager, right-click **Application Pools** > **Add Application Pool**:
   - **Name**: `ExtrusionAppPool`
   - **.NET CLR Version**: **No Managed Code**
2. Right-click **Sites** > **Add Website**:
   - **Site name**: `ExtrusionApp`
   - **Application pool**: `ExtrusionAppPool`
   - **Physical path**: `C:\inetpub\wwwroot\ExtrusionApp`
   - **Port**: `80` (or `3000`)

---

## Step 6: Frontend SPA Routing & Reverse Proxy Configuration (`web.config`)

To ensure client-side routing works on page refreshes and direct URL navigation without `404 Not Found` errors, place a `web.config` file inside `C:\inetpub\wwwroot\ExtrusionApp\web.config`.

Create `C:\inetpub\wwwroot\ExtrusionApp\web.config` with the following configuration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Rule 1: Proxy API requests to the C# Backend (If serving API on port 5000) -->
        <rule name="API Reverse Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:5000/api/{R:1}" />
        </rule>

        <!-- Rule 2: Single Page Application (SPA) Fallback -->
        <rule name="React Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
            <add input="{REQUEST_URI}" pattern="^/(api)" negate="true" />
          </conditions>
          <action type="TypeRewrite" url="/" />
        </rule>
      </rules>
    </rewrite>

    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".woff" mimeType="font/woff" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
    </staticContent>

    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="SAMEORIGIN" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
```

---

## Step 7: Permissions & Application Pool Setup

Ensure that IIS service accounts have read and execute permissions on physical application directories:

1. Right-click `C:\inetpub\wwwroot\ExtrusionApi` > **Properties** > **Security** tab.
2. Click **Edit** > **Add**.
3. Type `IIS_IUSRS` and click **Check Names**, then click **OK**.
4. Grant `IIS_IUSRS` **Read & execute**, **List folder contents**, and **Read** permissions (and **Write** permission for the `logs/` folder).
5. Add `IIS AppPool\ExtrusionApiAppPool` and grant required permissions.
6. Repeat the security permission setup for `C:\inetpub\wwwroot\ExtrusionApp`.

---

## Step 8: Verification & Troubleshooting

### 🔍 Verification Checklist
- [ ] Database `Extrusion_DB` created and populated via `mssql_schema.sql`.
- [ ] SQL Server TCP/IP Enabled on port 1433.
- [ ] C# Web API running on `http://localhost:5000` (Swagger loads at `http://localhost:5000/swagger`).
- [ ] React Frontend loading on `http://localhost` or `http://localhost:3000`.
- [ ] Refreshing non-root React routes does not produce a `404` error.
- [ ] API CRUD actions (Adding Production Entry, Operator List, Machine Status) successfully reflect in MS SQL Server.

### 🛠️ Common Errors & Solutions

| Error | Cause | Solution |
| :--- | :--- | :--- |
| **HTTP Error 500.19 / 500.30** | Missing ASP.NET Core Hosting Bundle or corrupted `web.config` | Reinstall ASP.NET Core 8.0 Hosting Bundle, restart IIS (`iisreset`). |
| **404 Not Found on Page Refresh** | Missing IIS URL Rewrite rule for React SPA routing | Ensure URL Rewrite module is installed and `web.config` exists in React app root. |
| **CORS Policy Error in Browser Console** | Frontend origin blocked by API | Check `Program.cs` CORS policy or use IIS reverse proxy rule in `web.config`. |
| **Cannot Connect to Database (SqlException)** | Incorrect connection string or TCP/IP disabled in SQL Server Configuration Manager | Enable TCP/IP protocol, verify `sa` password or Windows user permissions, verify Port 1433. |
| **HTTP Error 502.3 Bad Gateway** | C# Backend application crashed or port mismatch | Inspect `logs/stdout_*.log` inside `ExtrusionApi` folder to read C# stack traces. |

---

### 🇧🇩 প্রয়োজনীয় বাংলা নির্দেশাবলী (Summary in Bangla)

1. **ডাটাবেস তৈরি:** SQL Server Management Studio (SSMS) চালু করে `mssql_schema.sql` স্ক্রিপ্টটি চালান।
2. **C# ব্যাকএন্ড বিল্ড:** টার্মিনালে `dotnet publish csharp_backend/MPBL.Extrusion.Api.csproj -c Release -o C:\inetpub\wwwroot\ExtrusionApi` লিখে প্রকাশ করুন।
3. **রিয়েক্ট ফ্রন্টএন্ড বিল্ড:** `npm run build` দিয়ে `dist/` ফোল্ডারের ফাইলসমূহ `C:\inetpub\wwwroot\ExtrusionApp` তে কপি করুন।
4. **IIS সেটআপ:** 
   - IIS-এ **ASP.NET Core Hosting Bundle** এবং **URL Rewrite Module** ইনস্টল করুন।
   - ব্যাকএন্ডের জন্য অ্যাপপুল **No Managed Code** নির্বাচন করুন।
   - ফ্রন্টএন্ডের জন্য `web.config` যোগ করুন যেন Refresh দিলে 404 এরর না আসে।
