# Radiology Information System (RIS) – React / Next.js Migration Plan

This document outlines a pragmatic, phase-by-phase roadmap for rebuilding the RIS front-end with **Next.js (React), Tailwind CSS, shadcn-ui**, and a **custom, lightweight DICOM viewer built with Cornerstone.js**. The plan assumes the existing Django codebase continues to serve as the back-end API (Django REST Framework) and admin.

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
   • Develop a custom DICOM viewer component using Cornerstone.js.
   • Call Orthanc `/studies` via CORS proxy → render thumbnails.
3. **S0.3 Risks & Decisions**  
   • Auth flavour (DRF JWT vs session).  
   • Repo strategy (mono-repo vs split).  
   • CI/CD runners (GitHub Actions).

**Exit-criteria**: PoC renders one study using the custom Cornerstone.js viewer, login works, light/dark switch persists.

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

## M5 – Imaging Workflows (Cornerstone.js Viewer) (⏱ 2 w)
1. **S5.1 Custom Viewer Implementation** — Build the core Cornerstone.js component, featuring a main image viewport and a scrollable series thumbnail strip.
2. **S5.2 Viewer Page Integration** — protected route `/viewer/[studyId]` uses the new component.
3. **S5.3 Orthanc Data Connection** — Configure `cornerstone-wado-image-loader` to fetch all series and instances for a given study.
4. **S5.4 Viewer Tools** — Implement window/level, patient info overlay, invert, measurement, zoom, and reset tools on the main viewport.

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

### Custom Viewer (Cornerstone.js)
The full OHIF viewer application proved to be too complex and dependency-heavy for our needs. The new approach is to build a lightweight, performant, and maintainable viewer component from the ground up using the core Cornerstone.js libraries. This provides full control over features and avoids dependency conflicts.

- **`cornerstone-core`**: The main rendering library.
- **`cornerstone-tools`**: Provides measurement, window/level, and other tools.
- **`cornerstone-wado-image-loader`**: Handles data fetching from DICOMweb sources like Orthanc.
- **`dicom-parser`**: Used by the image loader to parse DICOM data.

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