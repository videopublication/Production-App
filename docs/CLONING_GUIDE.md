# App Cloning Guide (For New Department)

This guide walks you through setting up a separate instance of the Production App for a new department (e.g., "Marketing Dept") using the **Free Tier** of Supabase and Firebase.

---

## Phase 1: Supabase (Database)
Since you are on Windows and don't have `pg_dump` installed, we will use a free GUI tool called **TablePlus** (or DBeaver) to copy the database structure.

### Step 1: Create New Project
1.  Go to [Supabase Dashboard](https://supabase.com/dashboard).
2.  Click **"New Project"**.
3.  Name it (e.g., `marketing-inventory`).
4.  Set a secure Password (SAVE THIS!).
5.  Region: Same as your original project (e.g., Mumbai/Singapore).
6.  Wait for it to setup.

### Step 2: Export Old Database Schema
1.  Download & Install **TablePlus** (free version is fine) or **DBeaver**.
2.  **Get Connection Details**:
    *   Go to **Old Project** -> Settings -> Database -> Connection String (URI).
    *   Copy the URI (Mode: Transaction/Session).
3.  **Connect in TablePlus**:
    *   Create a new connection -> Import from URL -> Paste URI.
    *   Test & Connect.
4.  **Export Structure**:
    *   Select all tables (`public` schema).
    *   Right-click -> **Backup/Export**.
    *   Select **SQL**.
    *   **Crucial**: Check **"Structure"** (Schema). Uncheck **"Data"** (unless you really want to copy existing items).
    *   Export to a file (e.g., `structure.sql`).

### Step 3: Import to New Project
1.  **Get Connection Details** for the **New Project**.
2.  **Connect in TablePlus** (New Window).
3.  **Run SQL**:
    *   Click the "SQL" icon (Query Editor).
    *   Paste the content of `structure.sql`.
    *   Run All (Cmd/Ctrl + Enter).
    *   *Note: If you get errors about "Extensions" (like uuid-ossp), you can ignore them if they already exist, or enable them in Dashboard -> Database -> Extensions.*

### Step 4: Storage Buckets
Schema export usually misses Storage Buckets.
1.  Go to **New Project** -> Storage.
2.  Create a new bucket named `avatars` (Public).
3.  Create a new bucket named `receipts` (Private, or as configured before).
4.  (Optional) Copy Policies: If you had complex policies on storage, you might need to copy those manually from the Storage Policy editor.

---

## Phase 2: Authentication (Google & Firebase)
You need a separate Auth tablespace or project to ensure users are distinct.

### Option A: Reuse Firebase (Easiest)
You can technically reuse the same Firebase project but it's messy (users mix).
**Recommendation**: Create a new Firebase Project.

1.  Go to **Firebase Console**.
2.  Create project `marketing-inventory`.
3.  Enable **Authentication** -> **Google Sign-In**.
4.  **Authorized Domains**: Add your new Vercel URL (once deployed).

### Service Account (For Admin SDK)
1.  Firebase Project Settings -> Service Accounts.
2.  **Generate New Private Key**.
3.  Save the JSON. You will need values from this for your `.env`.

---

## Phase 3: Deployment (Vercel)

1.  **Create Git Branch**:
    ```bash
    git checkout -b dept-marketing
    ```
2.  **Update Config**:
    *   Update `src/lib/config.ts`: Change `name` to "Marketing Inventory".
    *   (Optional) Change `tailwind.config.ts` colors if they want a different theme.

3.  **Deploy to Vercel**:
    *   Go to Vercel -> New Project.
    *   Import from your GitHub Repo.
    *   **Select the Branch**: `dept-marketing`.
    *   **Environment Variables**: You must perform a fresh setup of these:
        *   `NEXT_PUBLIC_SUPABASE_URL`: (From New Supabase Project)
        *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (From New Supabase Project)
        *   `SUPABASE_SERVICE_ROLE_KEY`: (From New Supabase Project)
        *   `NEXT_PUBLIC_FIREBASE_API_KEY`: (From New Firebase Project)
        *   `FIREBASE_PROJECT_ID`: ...
        *   `FIREBASE_CLIENT_EMAIL`: ...
        *   `FIREBASE_PRIVATE_KEY`: ...
    *   Deploy!

---

## Phase 4: Final Verification
1.  Visit the new URL.
2.  Login (It should create a completely new user in the new DB).
3.  Check "Inventory". It should be empty.
4.  Add an item. Check the new Supabase Dashboard -> Table `equipment`. It should appear there (and NOT in your old video-pub DB).

**Done!** You now have a completely isolated clone.
