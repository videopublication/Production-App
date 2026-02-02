# VPApp Beta - Setup Credentials

I have successfully created your new Supabase project and cloned your database schema!

## 1. Project Details
*   **Name**: VPApp Beta
*   **Region**: Mumbai (ap-south-1)
*   **Status**: Live & Ready

## 2. Environment Variables (For Vercel)
Copy these into your Vercel Project Settings (or local .env):

```env
# Connects to 'VPApp Beta'
NEXT_PUBLIC_SUPABASE_URL=https://uysumhukcopbnpmyxabw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c3VtaHVrY29wYm5wbXl4YWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTc3MjAsImV4cCI6MjA4NTUzMzcyMH0.bRgOk_T8hqyV5wW1iqE38vptJtkY7IWRKi3ks0wGwno

# CRITICAL: You must get this from Supabase Dashboard -> Settings -> API
SUPABASE_SERVICE_ROLE_KEY=???   
```

## 3. Remaining Manual Steps
Since I cannot access sensitive secrets or file storage settings, you must do these 3 things in the Supabase Dashboard:

1.  **Get Service Role Key**:
    *   Go to **Settings -> API**.
    *   Copy `service_role` secret.
    *   Paste it into your Vercel Environment Variables.

2.  **Enable Authentication**:
    *   Go to **Authentication -> Providers**.
    *   Enable **Email** (and Google if needed).

3.  **Create Storage Buckets**:
    *   Go to **Storage**.
    *   Create a new bucket named `avatars` (Public).
    *   Create a new bucket named `receipts` (Private).

## 4. How to Deploy
1.  Go to Vercel.
2.  Create New Project -> Import from your Git Repo.
3.  Select Branch: `vpapp-beta`
4.  Paste the Environment Variables from above.
5.  Deploy!
