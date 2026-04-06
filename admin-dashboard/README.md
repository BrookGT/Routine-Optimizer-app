# Wuloye — Admin Dashboard (Next.js)

> Sprint 2+

This directory will contain the Next.js admin dashboard.

## Planned Setup

```bash
npx create-next-app@latest . --typescript --tailwind --eslint
```

folder straucre:

admin-dashboard/
  src/
    app/
      layout.jsx
      page.jsx

    components/
      ui/              # shadcn components
      charts/
      tables/
      cards/

    features/
      auth/
      dashboard/
      users/
      interactions/
      recommendations/
      experiments/
      system/

    services/
      apiClient.js
      endpoints.js

    hooks/
      useAuth.js
      useFetch.js

    store/
      useStore.js

    utils/
      format.js

    styles/
      globals.css

phase 1:

PHASE 1 — ADMIN DASHBOARD SETUP

Objective:
Initialize admin dashboard with clean architecture.

Tasks:
1. Create project using Vite (React)
2. Install:
   - tailwindcss
   - shadcn/ui
   - axios
   - react-query
   - react-router-dom

3. Setup Tailwind + shadcn

4. Create base layout:
   - Sidebar
   - Topbar
   - Content area

5. Setup routing:
   /dashboard
   /users
   /interactions
   /recommendations
   /system
   /experiments

Success Criteria:
- App runs
- Layout visible
- Navigation works