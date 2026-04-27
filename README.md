# GST Bill Tracker

A free web application to store and manage your GST purchase bills. Import GSTR-2B data from the GST portal, then attach the actual bill PDFs against each invoice number — ready for any GST inspection.

## Features

- **GSTR-2B Import**: Upload GSTR-2B Excel from the GST portal, auto-parse all B2B invoices
- **Bill Attachment**: Upload PDF bills against each invoice number
- **Match Tracking**: See which invoices have bills attached (green) and which are missing (red)
- **Search**: Find any bill instantly by invoice number, supplier name, or GSTIN
- **Filters**: Filter by financial year, match status
- **FY Summary**: View year-wise totals with ITC breakdown (IGST/CGST/SGST)
- **CSV Export**: Export invoice data for your CA/accountant
- **Multi-user**: 2 team members can access from any device
- **Mobile friendly**: Works on phone and laptop

## Tech Stack

- **Next.js** (React) — frontend
- **Supabase** — database, file storage, authentication (free tier)
- **Vercel** — hosting (free tier)
- **Cost**: Rs. 0

---

## Setup Guide (Step by Step)

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Give it a name like `gst-bill-tracker`
4. Set a database password (save it somewhere safe)
5. Choose a region close to you (e.g., Mumbai)
6. Click **"Create new project"** and wait for it to finish

### Step 2: Set Up the Database

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Open the file `supabase-setup.sql` from this project
4. Copy the entire contents and paste it into the SQL editor
5. Click **"Run"** — you should see "Success" messages
6. Go to **Table Editor** in the sidebar — you should see `invoices` and `gstr_imports` tables

### Step 3: Create User Accounts

1. In Supabase, go to **Authentication** (left sidebar)
2. Click **"Add User"** → **"Create New User"**
3. Enter the email and password for **Member 1**
4. Repeat for **Member 2**
5. Both members will use these credentials to log into the app

### Step 4: Get Your API Keys

1. In Supabase, go to **Settings** → **API** (left sidebar)
2. Copy the **Project URL** (looks like `https://xxxx.supabase.co`)
3. Copy the **anon/public key** (a long string starting with `eyJ...`)
4. You'll need these in the next step

### Step 5: Deploy to Vercel

1. Go to [github.com](https://github.com) and sign up (free) if you don't have an account
2. Create a new repository and push this code to it:
   ```bash
   cd gst-bill-tracker
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/gst-bill-tracker.git
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account
4. Click **"Add New"** → **"Project"**
5. Select your `gst-bill-tracker` repository
6. Before clicking Deploy, click **"Environment Variables"** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
7. Click **"Deploy"**
8. Wait for the build to finish — your app is now live!

### Step 6: Start Using

1. Open the URL Vercel gives you (e.g., `gst-bill-tracker.vercel.app`)
2. Log in with the email/password you created in Step 3
3. Go to **Import GSTR-2B** and upload your first file
4. Start attaching bill PDFs!

---

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your Supabase keys
cp .env.local.example .env.local
# Edit .env.local and add your keys

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Monthly Workflow

1. Log into [gst.gov.in](https://gst.gov.in) → Returns → GSTR-2B → Download Excel
2. Open the app → Import GSTR-2B → Upload the Excel file
3. Dashboard shows all new invoices → Attach PDF bills from Amazon/Flipkart
4. Aim for 100% match rate

## During a GST Inspection

1. Open the app on your phone/laptop
2. Search by invoice number — the bill opens instantly
3. Or go to Summary → Export CSV for the financial year
