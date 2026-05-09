# LeadRadar

LeadRadar is Hkrafted’s internal freelance lead tracking dashboard.

## Project Purpose
The goal is to help a small team review new leads quickly, identify hot opportunities, add notes, track application status, and avoid missing good project postings from platforms like Upwork, Freelancer, and PeoplePerHour.

## Core Goals
- Centralized tracking for freelance opportunities
- Automated scoring based on Hkrafted service keywords
- Fast triage and status management

## Tech Stack
- Frontend: React, Vite, Ant Design
- Backend/Database: Supabase (PostgreSQL, Auth)
- Package Manager: pnpm

## Main Apps
- `apps/web`: The core LeadRadar dashboard application.
- `packages/shared`: Shared types, scoring logic, and constants.

## Setup Notes
- Use `pnpm install` to install dependencies.
- Use `pnpm dev` to run the development server.
- Ensure Supabase environment variables are configured in `.env` or `.env.local`.

---

### Environment Reference
NEXT_PUBLIC_SUPABASE_URL=https://ecqaelauizbvxsomgqeo.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_0rMyRjocESm5KBjGTv-l1w_-MqrYJrB
VITE_SUPABASE_URL=https://ecqaelauizbvxsomgqeo.supabase.co
SUPABASE_URL=https://ecqaelauizbvxsomgqeo.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_0rMyRjocESm5KBjGTv-l1w_-MqrYJrB
SUPABASE_SERVICE_ROLE_KEY=sb_secret_kbqddljt-WJra_hOu3mEAA_iQ9-lDGO

# Connect to Supabase via connection pooling
DATABASE_URL="postgresql://postgres.ecqaelauizbvxsomgqeo:fUVdX.pR?VVh2xP@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection to the database. Used for migrations
DIRECT_URL="postgresql://postgres.ecqaelauizbvxsomgqeo:fUVdX.pR?VVh2xP@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"