# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**⚠️ IMPORTANT**: This project is currently **migrating from Django+HTMX to Next.js/React frontend**. The new frontend is in `/ris-frontend/` while the legacy Django templates with HTMX still exist in `/exam/templates/` and other Django app templates.

## Project Overview

This is a **Radiology Information System (RIS)** built with Django REST Framework backend and Next.js/React frontend. The system manages patient registration, radiology examinations, DICOM integration with Orthanc PACS, and staff management for medical imaging workflows.

## Tech Stack

**Backend:**
- Django 4.2.6 with Django REST Framework
- SQLite database (development)
- JWT authentication via `djangorestframework-simplejwt`
- Poetry for Python dependency management

**Frontend:**
- Next.js 15.4.3 with React 19.1.0
- TypeScript, TailwindCSS v4, shadcn/ui components
- Cornerstone.js for DICOM viewing

**Key Dependencies:**
- Django: django-htmx, django-filter, django-extensions, crispy-forms
- Frontend: cornerstone-core, cornerstone-tools, dicom-parser, next-auth

## Project Structure

```
reez/
├── reez/                 # Django project settings
├── exam/                 # Core radiology functionality
│   ├── models.py        # Exam, Modaliti, Pemeriksaan, Daftar, PacsConfig
│   ├── api.py           # JSON APIs for select2/autocomplete
│   ├── views.py         # Django views for radiology workflows
│   └── templates/       # ⚠️ Legacy Django templates (being replaced)
├── pesakit/             # Patient management
│   ├── models.py        # Pesakit (Patient) model with MRN/NRIC
│   ├── views.py         # Patient CRUD operations
│   └── serializers.py   # DRF serializers for API
├── staff/               # Staff/user management
│   ├── models.py        # Staff model (extends AbstractUser)
│   └── views.py         # Authentication views
├── wad/                 # Ward management
├── ris-frontend/        # 🆕 **NEW** Next.js/React frontend (active development)
│   ├── src/app/         # Next.js app router structure
│   ├── src/components/  # React components (DicomViewer, UI)
│   ├── src/lib/         # API utilities and helpers
│   └── package.json     # Frontend dependencies
├── static/              # Django static files (legacy)
├── templates/           # Global templates (legacy)
└── manage.py           # Django management script
```

## Core Models

### Patient (pesakit.models.Pesakit)
- **MRN**: Medical record number
- **NRIC**: National ID/Passport with birth date extraction
- **Demographics**: Name, race, gender, age calculation from IC

### Radiology Exam (exam.models)
- **Pemeriksaan**: Individual radiology examination with auto-generated X-ray numbers
- **Daftar**: Registration entry linking patients to examinations
- **Exam**: Master list of available examinations (XR, CT, MRI, etc.)
- **Modaliti**: Imaging modalities (X-Ray, CT Scan, MRI, etc.)

### DICOM Integration
- **PacsConfig**: Orthanc PACS server configuration
- **PacsExam**: Links examinations to DICOM studies in Orthanc

## Development Commands

### Backend (Django)
```bash
# Install dependencies
poetry install

# Database operations
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser

# Development server
python manage.py runserver

# API testing
python manage.py shell
```

### Frontend (Next.js)
```bash
# Navigate to frontend
cd ris-frontend

# Install dependencies
npm install

# Development server (separate terminal)
npm run dev

# Build for production
npm run build
npm run start

# Linting
npm run lint
```

## API Endpoints

### Authentication
- `POST /api/token/` - JWT token obtain
- `POST /api/token/refresh/` - JWT token refresh

### Patient API (pesakit)
- `GET /api/patients/` - List all patients
- `POST /api/patients/` - Create new patient
- Individual patient CRUD operations

### Radiology APIs (exam)
- `GET /api/modaliti/` - List imaging modalities
- `GET /api/examlist/` - List available examinations grouped by modality
- `GET /api/rujukan/` - List referral sources (wards)

## Key Features

1. **Patient Registration**: MRN/IC-based patient lookup and registration
2. **Examination Ordering**: Select modality and examination type
3. **DICOM Integration**: Automatic study linking with Orthanc PACS
4. **X-Ray Number Generation**: Auto-incrementing format (KKP20250001)
5. **Multi-user System**: Role-based access for radiographers and doctors
6. **Reporting**: Basic statistics and patient lists

## Environment Setup

### Backend Environment Variables
```bash
# Django settings (already configured)
SECRET_KEY='django-insecure-...'
DEBUG=True
ALLOWED_HOSTS=['*']
```

### Frontend Environment Variables
Create `.env.local` in `ris-frontend/`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Development Workflow

1. **Start Django backend**: `python manage.py runserver` (port 8000)
2. **Start Next.js frontend**: `cd ris-frontend && npm run dev` (port 3000)
3. **Access frontend**: http://localhost:3000
4. **Access Django admin**: http://localhost:8000/admin

## Code Patterns

### Backend Patterns
- **Auto-prefetch**: Uses `django-auto-prefetch` for query optimization
- **Title case**: Custom `katanama.titlecase` for proper name formatting
- **DRF serializers**: Clean API responses for frontend consumption
- **JWT authentication**: Token-based auth for Next.js frontend

### Frontend Patterns (NEW - Next.js/React)
- **Next.js App Router**: Modern React Server Components
- **TypeScript**: Full type safety across components
- **shadcn/ui**: Consistent component design system
- **JWT Authentication**: Secure API calls with next-auth
- **React Query/TanStack Query**: Data fetching and caching (recommended)
- **Cornerstone.js**: Custom DICOM viewer implementation

### Migration Status
- **Legacy**: Django templates with HTMX (being phased out)
- **Active**: Next.js frontend in `/ris-frontend/`
- **Backend**: Django REST API remains unchanged, serves both frontends

## Database Schema Notes

- **Auto-generated IDs**: Most models use Django's default BigAutoField
- **Unique constraints**: MRN+NRIC for patients, Exam+Part+Modality for examinations
- **Soft relationships**: Many foreign keys are nullable for data flexibility
- **Audit fields**: created/modified timestamps on most models

## Common Development Tasks

### Adding New Examination Type
1. Add to `exam.models.Exam` via Django admin
2. Ensure proper modality linkage
3. Update any frontend dropdowns if needed

### Patient Search
- Search by MRN, NRIC, or name
- Automatic age calculation from NRIC
- Duplicate detection via unique constraints

### DICOM Study Linking
- Uses Orthanc StudyInstanceUID
- Automatic mapping via examination number
- Configurable PACS server endpoints

## Testing

### Backend Testing
```bash
python manage.py test exam
python manage.py test pesakit
```

### Frontend Testing
```bash
cd ris-frontend
npm test  # (when tests are implemented)
```

## Migration Roadmap

Based on @Plan.md, the current migration follows these phases:

### ✅ Completed
- **M0**: Discovery & technical proofs completed
- **M1**: Foundations setup (Next.js, Tailwind, shadcn/ui)

### 🔄 In Progress
- **M2**: Auth & RBAC - JWT authentication with next-auth
- **M3**: Core Patient Management - React components for CRUD operations

### ⏳ Upcoming
- **M4**: MWL & DICOM Integration
- **M5**: Custom Cornerstone.js DICOM viewer
- **M6**: Dashboards & Reporting
- **M7**: Quality & Hardening
- **M8**: UAT & Roll-out

> **Note**: Parallel backend work (DRF endpoints, MWL service) should start in M1 and continue through M5.

## Important Notes

- **never run django runserver**

## Theme Development Guidelines

- We are using dual theme light and dark mode. so, NO HARDCODE WHITE / BLACK / DARK BACKGROUND anywhere.

## Frontend Toast Notifications

A consistent toast notification system is available throughout the Next.js frontend:

```typescript
// Import the toast service
import { toast } from '@/lib/toast';

// Usage in any component
toast.success('Operation completed successfully');
toast.error('Failed to save data');
toast.warning('Please check your input');
toast.info('Processing your request');

// All toasts appear in top-right corner with consistent styling
// Width: 24cm (w-96), with proper icons and animations
```

**Toast Features:**
- Consistent positioning: Always top-right corner
- Consistent styling: Professional design with type-specific colors
- Auto-dismiss: 3 seconds by default
- Manual close: Click the X button to dismiss
- Responsive: Works on mobile and desktop
- Dark mode compatible: Uses current theme colors