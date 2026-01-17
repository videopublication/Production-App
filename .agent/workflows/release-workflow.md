---
description: How to manage beta and stable releases for the Production App
---

# Release Workflow: Beta & Stable Versions

## 🌿 Branch Structure

| Branch | Purpose | Deployment |
|--------|---------|------------|
| `main` | **Stable/Production** - Only tested, approved code | Production (vpub.app) |
| `develop` | **Beta** - New features being tested | Beta (beta.vpub.app) |
| `feature/*` | Individual features in development | Preview deployments |

---

## 📋 Daily Development Workflow

### 1. Start a new feature
```bash
# Make sure you're on develop
git checkout develop
git pull origin develop

# Create a feature branch
git checkout -b feature/your-feature-name
```

### 2. Work on your feature
```bash
# Make changes, then commit
git add .
git commit -m "feat: description of your feature"

# Push to GitHub (creates preview deployment)
git push -u origin feature/your-feature-name
```

### 3. Merge to Beta (develop)
```bash
# When feature is ready, merge to develop
git checkout develop
git pull origin develop
git merge feature/your-feature-name
git push origin develop

# Delete the feature branch
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

---

## 🚀 Release to Production (Stable)

### When beta is stable and tested:
```bash
# Switch to main
git checkout main
git pull origin main

# Merge develop into main
git merge develop

# Tag the release
git tag -a v1.0.0 -m "Release version 1.0.0"

# Push with tags
git push origin main --tags
```

---

## ⚙️ Vercel Setup (Two Deployments)

### Production Deployment (vpub.app)
1. Go to Vercel Dashboard
2. Import your GitHub repo
3. Settings:
   - **Production Branch**: `main`
   - **Custom Domain**: `vpub.app` (or your domain)
   - **Environment Variables**: Production values

### Beta Deployment (beta.vpub.app)
1. In the same Vercel project, go to **Settings > Git**
2. Add **Branch Deployment**:
   - **Branch**: `develop`
   - **Domain**: `beta.vpub.app` (subdomain)
3. Or create a separate Vercel project pointing to `develop` branch

---

## 🔐 Environment Variables

### For Beta (.env.beta)
```
NEXT_PUBLIC_APP_ENV=beta
NEXT_PUBLIC_API_URL=https://beta-api.example.com
# Use a separate Supabase project for beta testing
NEXT_PUBLIC_SUPABASE_URL=https://beta-xxx.supabase.co
```

### For Production (.env.production)
```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
```

---

## 🏷️ Version Tagging Convention

Use semantic versioning:
- `v1.0.0` - Major release (breaking changes)
- `v1.1.0` - Minor release (new features)
- `v1.1.1` - Patch release (bug fixes)

### Create a release:
```bash
# Tag current commit
git tag -a v1.2.0 -m "Release 1.2.0: Added equipment management"

# Push the tag
git push origin v1.2.0
```

---

## 📱 Show Beta Badge in App

Add this to your app to show users they're on beta:

```tsx
// In your layout or header
{process.env.NEXT_PUBLIC_APP_ENV === 'beta' && (
  <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
    BETA
  </span>
)}
```

---

## ✅ Quick Reference Commands

// turbo
```bash
# Switch to develop (beta)
git checkout develop

# Switch to main (stable)
git checkout main

# See all branches
git branch -a

# See release tags
git tag -l

# Create release
git tag -a v1.0.0 -m "Release message"
git push origin --tags
```
