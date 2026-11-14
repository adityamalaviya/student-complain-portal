# CampusVoice

A department-based student grievance and community-advocacy portal built on **Next.js App Router** and **Appwrite Cloud Functions**.

## Architectural Highlights
- **Canonical Six-Department Model:** Stable database IDs (`dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`) independent of enrollment codes, separating student academic scope (`student_department_id`) from maintenance routing scope (`maintenance_department_id`). Water and Sanitation are maintenance-only with zero enrollment codes.
- **Deterministic Department Mapping:** 12-digit enrollment number validation with characters 8–9 zero-based slice (`[7:9]`) mapping confirmed academic codes (`06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, `19` → `dept_mech`) and rejecting all unconfirmed or disallowed codes.
- **Oracle Elimination:** Cross-department complaint lookups return generic HTTP `404 Not Found`.
- **Atomic Single-Support Community Voting:** Deterministic 32-character SHA-256 document IDs preventing race conditions and double-voting.
- **Serverless Architecture:** Next.js deployed to Vercel, single API router deployed to Appwrite Cloud Functions (live Appwrite migration pending).

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js 24)
- npm 10+

### Setup
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Quality Checks
```bash
npm run typecheck
npm run lint
```
