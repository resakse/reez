# Radiology Information System (RIS) – React / Next.js Migration Plan

This document outlines a pragmatic, phase-by-phase roadmap for rebuilding the RIS front-end with **Next.js (React), Tailwind CSS, shadcn-ui**, and an **embedded OHIF viewer**.  The plan assumes the existing Django codebase continues to serve as the back-end API (Django REST Framework) and admin.

## Legend
* **M** = Milestone / high-level phase
* **S** = Sub-tasks / deliverables
* ⏱ = Rough effort (person-weeks)

---

## M0 – Discovery & Technical Proofs (⏱ 1-2 w)
1. **S0.1 Stakeholder interviews & requirements freeze**  
   • Validate features list, constraints, KPIs, user roles.
2. **S0.2 Architecture spike**  
   • Spin up *throw-away* Next.js 14 project, add Tailwind & shadcn-ui.  
   • Compile OHIF viewer as a React component inside Next.js (see research notes below).  
   • Call Orthanc `/studies` via CORS proxy → render thumbnails.
3. **S0.3 Risks & Decisions**  
   • Auth flavour (DRF JWT vs session).  
   • Repo strategy (mono-repo vs split).  
   • CI/CD runners (GitHub Actions).

**Exit-criteria**: PoC renders one study in OHIF, login works, light/dark switch persists.

---

## M1 – Foundations (⏱ 2 w)
1. **S1.1 Repository setup** — Turbo repo / pnpm workspace or separate repos; Prettier + ESLint; Husky.
2. **S1.2 Next.js baseline** — App Router, Tailwind config, shadcn theming (light/dark, system-pref).
3. **S1.3 CI/CD** — Preview deploys (Vercel or self-hosted); Storybook for component library.

---

## M2 – Auth & RBAC (⏱ 2 w)
1. **S2.1 API contracts** — Login, refresh, user/role endpoints (Doctor RO, Radiographer RW).
2. **S2.2 NextAuth or custom JWT hooks** — Secure pages, *React Query* fetch layer.
3. **S2.3 Role-based routing & UI guards**.

---

## M3 – Core Patient & Doctor Management (⏱ 3 w)
1. **S3.1 Patient CRUD screens** — forms, validation, Tailwind UI patterns.
2. **S3.2 Doctor registry (read-only in UI)**.
3. **S3.3 Accession number service** — auto-increment based on settings endpoint.
4. **S3.4 Unit tests (Jest + React Testing Library).**

---

## M4 – MWL & DICOM Integration (⏱ 3 w)
1. **S4.1 MWL endpoint in Django** — HL7 / DICOM C-FIND wrapper (existing `exam.dicom`).
2. **S4.2 Send-to-CR UI** — action in patient list; success/fail toast.
3. **S4.3 Audit logging.**

---

## M5 – Imaging Workflows (OHIF) (⏱ 3 w)
1. **S5.1 OHIF build** — Fork + yarn workspace; custom theme to match Tailwind tokens.
2. **S5.2 Viewer page** — protected route `/viewer/[studyId]` opened in modal or new tab.
3. **S5.3 Orthanc auth handshake** — token forward or basic auth proxy.
4. **S5.4 Radiographer tools** — create ward, examination, print CD label (PDFmake).

---

## M6 – Dashboards & Reporting (⏱ 2 w)
1. **S6.1 Stats APIs** — aggregations in Django (patients/day, studies/doctor, turnaround time).
2. **S6.2 KPI dashboards** — Recharts / Tremor charts, date filters.
3. **S6.3 CSV / XLSX export** — react-csv, SheetJS.

---

## M7 – Quality, Accessibility & Hardening (⏱ 2 w)
1. **S7.1 A11y audit** — axe-core, Lighthouse; keyboard navigation.
2. **S7.2 Performance tuning** — Largest Contentful Paint in viewer, code-splitting.
3. **S7.3 Security** — OWASP checks, HTTP headers, CORS, XSS, CSRF.

---

## M8 – UAT, Training & Roll-out (⏱ 1-2 w)
1. **S8.1 Pilot clinic deployment**.
2. **S8.2 Feedback loops, bug triage**.
3. **S8.3 Documentation & training videos**.

**Go-Live criteria**: All priority-1 bugs closed, KPI ≤ agreed thresholds.

---

## M9 – Post-Launch & Continuous Improvement (ongoing)
* Bugfix sprints, minor UX enhancements.
* Quarterly upgrade of OHIF, Next.js, Tailwind.
* Add optional features: HL7 ADT, SMS notifications, AI CAD plugins.

---

## Research Notes

### OHIF Integration
1. **Option A (Recommended)**: Add OHIF as a git submodule/workspace, run `yarn install && yarn run dev` as part of Next.js build.  Expose viewer via iframe pointing to `/ohif`. Pros: full feature parity; easier to merge upstream. Cons: heavier bundle.
2. **Option B**: Use `@ohif/viewer` as NPM package.  Wrap in dynamic import inside Next.js; tree-shake modules not needed.  Fewer customisation knobs; better DX.

### Dual Theme Strategy
* Tailwind v3 supports dark mode class; shadcn component generator can export both themes.  Persist user choice in `localStorage`; fall back to `prefers-color-scheme`.

### State Management & Data Fetching
* *React Query* for caching, mutations, and optimistic UI.
* Zod for schema validation shared with DRF OpenAPI spec via codegen.

### Testing & QA
* Unit tests: Jest, RTL.  
* E2E: Playwright cloud; record doctor workflow (login → open study → measure ROI).

### DevOps & Deployment
* Staging env: Docker compose (Django + PostgreSQL + Orthanc + Next.js).  
* Production: Kubernetes or VM; Nginx reverse proxy `/api` → Django, `/viewer` → Next.js.

---

## Timeline Summary (Optimistic)
| Phase | Duration | Calendar Weeks |
| ----- | -------- | -------------- |
| M0 | 1-2 w | 1-2 |
| M1 | 2 w | 3-4 |
| M2 | 2 w | 5-6 |
| M3 | 3 w | 7-9 |
| M4 | 3 w | 10-12 |
| M5 | 3 w | 13-15 |
| M6 | 2 w | 16-17 |
| M7 | 2 w | 18-19 |
| M8 | 1-2 w | 20-21 |
| **Total** | **≈ 5 mo** | |

> **Note**: Parallel backend work (DRF endpoints, MWL service) should start in M1 and continue through M5.

---

## Next Steps
1. Approve this roadmap (or supply adjustments).
2. Kick off **M0 Discovery**: schedule stakeholder interviews, allocate PoC team.
3. Provision CI/CD and staging infrastructure. 