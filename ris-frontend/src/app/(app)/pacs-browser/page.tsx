'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuCheckboxItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { getOrthancUrl } from '@/lib/pacs';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';
import Swal from 'sweetalert2';
import { 
  Search, 
  Calendar, 
  Eye, 
  Download, 
  Filter,
  Archive,
  Stethoscope,
  User,
  Clock,
  RefreshCw,
  Server,
  ChevronDown
} from 'lucide-react';

import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/dark.css';

// SweetAlert2 theme support styles
const swalStyles = `
  .dark-swal-popup .swal2-html-container {
    color: #f9fafb !important;
  }
  .light-swal-popup .swal2-html-container {
    color: #1f2937 !important;
  }
  .dark-swal-title {
    color: #f9fafb !important;
  }
  .light-swal-title {
    color: #1f2937 !important;
  }
`;

// Inject styles
if (typeof window !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = swalStyles;
  document.head.appendChild(styleElement);
}

interface LegacyStudy {
  ID: string;
  StudyInstanceUID: string;
  PatientName?: string;
  PatientID?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyDescription?: string;
  Modality?: string;
  SeriesCount?: number;
  ImageCount?: number;
  InstitutionName?: string;
  Ward?: string;
  Klinik?: string;
  isImported?: boolean;
  registrationId?: number;
  BodyPartExamined?: string; // 0018,0015
  ProtocolName?: string; // 0018,1030
  AcquisitionDeviceProcessingDescription?: string; // 0018,1400
  Manufacturer?: string; // 0008,0070
  pacsServerId?: number; // Multiple PACS support
  pacsServerName?: string; // Multiple PACS support
}

interface ModalityOption {
  value: string;
  label: string;
}

export default function PacsBrowserPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [studies, setStudies] = useState<LegacyStudy[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalStudies, setTotalStudies] = useState(0);
  const [modalityOptions, setModalityOptions] = useState<ModalityOption[]>([
    { value: 'ALL', label: 'All Modalities' }
  ]);
  const [allKlinikOptions, setAllKlinikOptions] = useState<string[]>([]);
  const [allManufacturerOptions, setAllManufacturerOptions] = useState<string[]>([]);
  const [allBodyPartOptions, setAllBodyPartOptions] = useState<string[]>([]);
  const [allExamOptions, setAllExamOptions] = useState<string[]>([]);
  const [allStudies, setAllStudies] = useState<LegacyStudy[]>([]);
  const [importingStudies, setImportingStudies] = useState<Set<string>>(new Set());
  const [allPacsServerOptions, setAllPacsServerOptions] = useState<{id: number, name: string}[]>([]);
  const [selectedPacsServers, setSelectedPacsServers] = useState<number[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  // Search filters
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [dateRange, setDateRange] = useState<string[]>([]);
  const dateRangeRef = useRef<HTMLInputElement>(null);
  const [modality, setModality] = useState('ALL');
  const [klinik, setKlinik] = useState('all');
  const [bodyPart, setBodyPart] = useState('all');
  const [exam, setExam] = useState('all');
  const [manufacturer, setManufacturer] = useState('all');
  const [searchLimit, setSearchLimit] = useState(500);

  // Debounced text filters
  const [debouncedPatientName, setDebouncedPatientName] = useState('');
  const [debouncedPatientId, setDebouncedPatientId] = useState('');

  // Theme-aware SweetAlert2 configuration
  const getSwalConfig = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      background: isDark ? '#1f2937' : '#ffffff',
      color: isDark ? '#f9fafb' : '#1f2937',
      customClass: {
        popup: isDark ? 'dark-swal-popup' : 'light-swal-popup',
        title: isDark ? 'dark-swal-title' : 'light-swal-title',
        htmlContainer: isDark ? 'dark-swal-content' : 'light-swal-content'
      }
    };
  };

  // Initialize flatpickr for date range
  useEffect(() => {
    if (dateRangeRef.current) {
      // Check if dark mode is enabled
      const isDarkMode = document.documentElement.classList.contains('dark');
      
      const fp = flatpickr(dateRangeRef.current, {
        mode: 'range',
        dateFormat: 'd/m/Y',
        placeholder: 'Select date range...',
        allowInput: true,
        theme: isDarkMode ? 'dark' : 'light',
        onChange: (selectedDates) => {
          const dates = selectedDates.map(date => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${day}/${month}/${year}`;
          });
          setDateRange(dates);
        }
      });

      // Listen for theme changes and update flatpickr theme
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const isDark = document.documentElement.classList.contains('dark');
            fp.set('theme', isDark ? 'dark' : 'light');
          }
        });
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });

      return () => {
        fp.destroy();
        observer.disconnect();
      };
    }
  }, []);

  const formatDate = (dateString: string): string => {
    if (!dateString || dateString.length !== 8) return dateString;
    return `${dateString.substring(6, 8)}/${dateString.substring(4, 6)}/${dateString.substring(2, 4)}`;
  };

  const formatTime = (timeString: string): string => {
    if (!timeString || timeString.length < 6) return timeString;
    return `${timeString.substring(0, 2)}:${timeString.substring(2, 4)}:${timeString.substring(4, 6)}`;
  };


  const checkImportStatus = useCallback(async (studies: LegacyStudy[]): Promise<LegacyStudy[]> => {
    try {
      // Get all study UIDs to check (filter out empty/null values)
      const studyUids = studies
        .map(s => s.StudyInstanceUID)
        .filter(uid => uid && uid.trim() !== '');
      
      // Skip batch check if no valid UIDs
      if (studyUids.length === 0) {
        return studies.map(study => ({ ...study, isImported: false }));
      }
      
      // Batch check import status
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/batch-check/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ study_instance_uids: studyUids })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const importedStudies = data.imported_studies || {};
        
        // Update studies with import status
        return studies.map(study => ({
          ...study,
          isImported: !!importedStudies[study.StudyInstanceUID],
          registrationId: importedStudies[study.StudyInstanceUID] || undefined
        }));
      }
    } catch (err) {
      // If batch check fails, assume none are imported
      console.warn('Failed to check import status:', err);
    }
    
    // Return studies with default not imported status
    return studies.map(study => ({ ...study, isImported: false }));
  }, []);

  // Debounce text inputs to prevent excessive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPatientName(patientName);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPatientId(patientId);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientId]);



  // Auto-filter studies based on current filter values
  const filteredStudies = useMemo(() => {
    if (allStudies.length === 0) return [];
    
    let filtered = allStudies;

    // Apply text filters only if they meet minimum length requirement (use debounced values)
    if (debouncedPatientName.length >= 3) {
      const searchTerm = debouncedPatientName.toLowerCase();
      filtered = filtered.filter(study => {
        const patientName = study.PatientName?.replace(/\^/g, ' ').toLowerCase() || '';
        return patientName.includes(searchTerm);
      });
    }

    if (debouncedPatientId.length >= 3) {
      filtered = filtered.filter(study => 
        study.PatientID?.includes(debouncedPatientId)
      );
    }


    // Apply dropdown filters immediately
    if (modality && modality !== 'ALL') {
      filtered = filtered.filter(study => study.Modality === modality);
    }

    if (klinik && klinik !== 'all') {
      const searchTerm = klinik.toLowerCase();
      filtered = filtered.filter(study => 
        study.Klinik && study.Klinik.toLowerCase().includes(searchTerm)
      );
    }

    if (bodyPart && bodyPart !== 'all') {
      filtered = filtered.filter(study => study.BodyPartExamined === bodyPart);
    }

    if (exam && exam !== 'all') {
      filtered = filtered.filter(study => 
        study.StudyDescription === exam || 
        study.ProtocolName === exam || 
        study.AcquisitionDeviceProcessingDescription === exam
      );
    }

    if (manufacturer && manufacturer !== 'all') {
      filtered = filtered.filter(study => study.Manufacturer === manufacturer);
    }

    // Apply PACS server filter
    if (selectedPacsServers.length > 0) {
      filtered = filtered.filter(study => 
        study.pacsServerId && selectedPacsServers.includes(study.pacsServerId)
      );
    }

    // Apply date range filter
    if (dateRange.length >= 1) {
      // Convert DD/MM/YYYY to YYYYMMDD for comparison
      const [day, month, year] = dateRange[0].split('/');
      const fromDate = `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
      filtered = filtered.filter(study => study.StudyDate >= fromDate);
    }

    if (dateRange.length >= 2) {
      // Convert DD/MM/YYYY to YYYYMMDD for comparison
      const [day, month, year] = dateRange[1].split('/');
      const toDate = `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
      filtered = filtered.filter(study => study.StudyDate <= toDate);
    }

    return filtered;
  }, [allStudies, debouncedPatientName, debouncedPatientId, modality, klinik, dateRange, bodyPart, exam, manufacturer, selectedPacsServers]);

  // Update displayed studies when filtered studies change
  useEffect(() => {
    const totalItems = filteredStudies.length;
    const pages = Math.ceil(totalItems / itemsPerPage);
    setTotalPages(pages);
    setTotalStudies(totalItems);
    
    // Reset to page 1 if current page is out of bounds
    if (currentPage > pages && pages > 0) {
      setCurrentPage(1);
    }
    
    // Calculate paginated studies
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedStudies = filteredStudies.slice(startIndex, endIndex);
    
    setStudies(paginatedStudies);
  }, [filteredStudies, currentPage, itemsPerPage]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedPatientName, debouncedPatientId, modality, klinik, dateRange, bodyPart, exam, manufacturer, selectedPacsServers]);

  const searchLegacyStudies = useCallback(async () => {
    try {
      setSearching(true);
      setError(null);
      
      // Build search parameters (klinik and modality filtering done client-side)
      const searchParams = {
        patientName: patientName.trim() ? patientName.trim().replace(/\s+/g, '^') : undefined,
        patientId: patientId.trim() || undefined,
        dateFrom: dateRange.length >= 1 ? (() => {
          // Convert DD/MM/YYYY to YYYY-MM-DD for API
          const [day, month, year] = dateRange[0].split('/');
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        })() : undefined,
        dateTo: dateRange.length >= 2 ? (() => {
          // Convert DD/MM/YYYY to YYYY-MM-DD for API
          const [day, month, year] = dateRange[1].split('/');
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        })() : undefined,
        exam: exam !== 'all' ? exam || undefined : undefined,
        manufacturer: manufacturer !== 'all' ? manufacturer || undefined : undefined,
        server_ids: selectedPacsServers.length > 0 ? selectedPacsServers : undefined,
        limit: searchLimit
      };

      // Remove undefined values
      Object.keys(searchParams).forEach(key => 
        searchParams[key] === undefined && delete searchParams[key]
      );

      // Searching with built parameters

      // Use Django API endpoint for multiple PACS search
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/search-multiple/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(searchParams)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to search PACS: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      // Map backend response to frontend format - multiple PACS support
      let formattedStudies: LegacyStudy[] = data.studies.map((study: any) => {
        // Debug: Log the first study to see what fields are available
        if (formattedStudies.length === 0) {
          console.log('First study from multiple PACS backend:', study);
          console.log('PACS server info:', study.pacs_server_id, study.pacs_server_name);
          console.log('Note: Backend provides DICOM fields:');
          console.log('- bodyPartExamined (0018,0015)');
          console.log('- protocolName (0018,1030)'); 
          console.log('- acquisitionDeviceProcessingDescription (0018,1400)');
          console.log('- manufacturer (0008,0070)');
        }
        
        return {
          ID: study.id,
          StudyInstanceUID: study.studyInstanceUid,
          PatientName: study.patientName,
          PatientID: study.patientId,
          PatientBirthDate: study.patientBirthDate,
          PatientSex: study.patientSex,
          StudyDate: study.studyDate,
          StudyTime: study.studyTime,
          StudyDescription: study.studyDescription,
          Modality: study.modality,
          SeriesCount: study.seriesCount,
          ImageCount: study.imageCount,
          InstitutionName: study.institutionName,
          Ward: study.ward,
          Klinik: study.institutionName || study.pacs_server_name || 'Unknown',
          // DICOM fields from backend
          BodyPartExamined: study.bodyPartExamined || study.BodyPartExamined,
          ProtocolName: study.protocolName || study.ProtocolName,
          AcquisitionDeviceProcessingDescription: study.acquisitionDeviceProcessingDescription || study.AcquisitionDeviceProcessingDescription,
          Manufacturer: study.manufacturer || study.Manufacturer,
          // Store PACS server information for potential future use
          pacsServerId: study.pacs_server_id,
          pacsServerName: study.pacs_server_name
        };
      });

      // Check import status for all studies
      formattedStudies = await checkImportStatus(formattedStudies);

      // Store all studies for client-side filtering
      setAllStudies(formattedStudies);

      // Update PACS server options from search results (preserve existing active servers)
      const extractedPacsServers = formattedStudies
        .filter(study => study.pacsServerId && study.pacsServerName)
        .map(study => ({ id: study.pacsServerId!, name: study.pacsServerName! }));
      
      // Merge with existing servers, keeping existing ones and adding new ones
      const existingServerIds = new Set(allPacsServerOptions.map(s => s.id));
      const newServers = extractedPacsServers.filter(server => !existingServerIds.has(server.id));
      
      if (newServers.length > 0) {
        const allServers = [...allPacsServerOptions, ...newServers];
        const uniquePacsServers = Array.from(
          new Map(allServers.map(server => [server.id, server])).values()
        ).sort((a, b) => a.name.localeCompare(b.name));
        setAllPacsServerOptions(uniquePacsServers);
      }

      // Update klinik options from search results (preserve existing options)
      const extractedKliniks = formattedStudies.map(study => study.Klinik).filter(Boolean);
      const newKlinikOptions = Array.from(new Set([
        ...allKlinikOptions,
        ...extractedKliniks
      ])).sort();
      setAllKlinikOptions(newKlinikOptions);

      // Update manufacturer options from search results
      const extractedManufacturers = formattedStudies.map(study => study.Manufacturer).filter(Boolean);
      const newManufacturerOptions = Array.from(new Set([
        ...allManufacturerOptions,
        ...extractedManufacturers
      ])).sort();
      setAllManufacturerOptions(newManufacturerOptions);

      // Update body part options from search results
      const extractedBodyParts = formattedStudies.map(study => study.BodyPartExamined).filter(Boolean);
      const newBodyPartOptions = Array.from(new Set([
        ...allBodyPartOptions,
        ...extractedBodyParts
      ])).sort();
      setAllBodyPartOptions(newBodyPartOptions);

      // Update exam options from search results (combine study description, protocol, and exam fields)
      const extractedExams = [
        ...formattedStudies.map(study => study.StudyDescription).filter(Boolean),
        ...formattedStudies.map(study => study.ProtocolName).filter(Boolean),
        ...formattedStudies.map(study => study.AcquisitionDeviceProcessingDescription).filter(Boolean)
      ];
      const newExamOptions = Array.from(new Set([
        ...allExamOptions,
        ...extractedExams
      ])).sort();
      setAllExamOptions(newExamOptions);
      
      // Display pagination info if available
      const paginationInfo = data.pagination_info;
      const serversSearched = data.servers_searched?.length || 0;
      const serverErrors = data.server_errors || {};
      
      if (formattedStudies.length === 0) {
        if (serversSearched > 0) {
          toast.success(`Search completed across ${serversSearched} PACS server(s) - no studies found matching criteria`);
        } else {
          toast.warning('No active PACS servers available for search');
        }
      } else {
        let message = `Found ${formattedStudies.length} legacy studies`;
        if (serversSearched > 1) {
          message += ` from ${serversSearched} PACS server(s)`;
        }
        if (paginationInfo && paginationInfo.per_server_limit) {
          message += ` (max ${paginationInfo.per_server_limit} per server)`;
        }
        toast.success(message);
      }
      
      // Show server errors if any
      if (Object.keys(serverErrors).length > 0) {
        const errorServers = Object.keys(serverErrors).join(', ');
        toast.warning(`Some PACS servers had errors: ${errorServers}`);
      }
    } catch (err) {
      // Error searching legacy studies
      setError(err instanceof Error ? err.message : 'Failed to search legacy studies');
      toast.error('Failed to search legacy studies');
    } finally {
      setSearching(false);
    }
  }, [patientName, patientId, dateRange, modality, klinik, bodyPart, exam, manufacturer, selectedPacsServers]);

  const clearFilters = () => {
    setPatientName('');
    setPatientId('');
    setDateRange([]);
    setModality('ALL');
    setKlinik('all');
    setBodyPart('all');
    setExam('all');
    setManufacturer('all');
    setSelectedPacsServers([]);
    setError(null);
    // Clear debounced values immediately
    setDebouncedPatientName('');
    setDebouncedPatientId('');
    // Clear flatpickr instance
    if (dateRangeRef.current && dateRangeRef.current._flatpickr) {
      dateRangeRef.current._flatpickr.clear();
    }
  };

  const viewStudy = (study: LegacyStudy) => {
    // Navigate to DICOM viewer with study UID and PACS server info
    const pacsParam = study.pacsServerId ? `?pacs_server_id=${study.pacsServerId}` : '';
    router.push(`/pacs-browser/${study.StudyInstanceUID}${pacsParam}`);
  };

  const importStudy = async (study: LegacyStudy) => {
    const isDark = document.documentElement.classList.contains('dark');
    const noteBackgroundColor = isDark ? '#374151' : '#f8f9fa';
    const noteTextColor = isDark ? '#e5e7eb' : '#6b7280';
    
    // Show SweetAlert2 confirmation dialog
    const result = await Swal.fire({
      title: 'Import Study to RIS?',
      html: `
        <div style="text-align: left; margin: 20px 0;">
          <p><strong>Patient:</strong> ${study.PatientName || 'Unknown'}</p>
          <p><strong>Patient ID:</strong> ${study.PatientID || 'Unknown'}</p>
          <p><strong>Study Date:</strong> ${formatDate(study.StudyDate || '')}</p>
          <p><strong>Modality:</strong> ${study.Modality || 'Unknown'}</p>
          <p><strong>Description:</strong> ${study.StudyDescription || 'N/A'}</p>
        </div>
        <div style="background: ${noteBackgroundColor}; color: ${noteTextColor}; padding: 10px; border-radius: 6px; margin-top: 15px;">
          <small><strong>Note:</strong> This will create a new patient registration and examination record in the RIS database.</small>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Import',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      width: 500,
      ...getSwalConfig()
    });

    if (!result.isConfirmed) {
      return;
    }

    // Add to importing set
    setImportingStudies(prev => new Set(prev).add(study.StudyInstanceUID));

    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/import/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studyInstanceUid: study.StudyInstanceUID,
            createPatient: true
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        // Update the study in our local state to mark as imported
        setAllStudies(prevStudies => 
          prevStudies.map(s => 
            s.StudyInstanceUID === study.StudyInstanceUID 
              ? { ...s, isImported: true, registrationId: data.registrationId }
              : s
          )
        );

        const examCount = data.examinationCount || 1;
        const examDetails = data.examinations || [];
        
        // Show success message
        if (examCount > 1) {
          toast.success(`Study imported successfully! Created ${examCount} examinations: ${examDetails.map((e: any) => e.exam_type).join(', ')}`);
        } else {
          toast.success(`Study imported successfully! Registration ID: ${data.registrationId}`);
        }

        // Show success SweetAlert
        await Swal.fire({
          title: 'Import Successful!',
          html: `
            <div style="text-align: left; margin: 20px 0;">
              <p><strong>Registration ID:</strong> ${data.registrationId}</p>
              <p><strong>Examinations Created:</strong> ${examCount}</p>
              ${examDetails.length > 0 ? `<p><strong>Exam Types:</strong> ${examDetails.map((e: any) => e.exam_type).join(', ')}</p>` : ''}
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'OK',
          confirmButtonColor: '#28a745',
          ...getSwalConfig()
        });

      } else {
        // Handle specific error cases
        if (response.status === 403) {
          toast.error('Only superusers can import studies');
          await Swal.fire({
            title: 'Permission Denied',
            text: 'Only superusers can import studies to RIS',
            icon: 'error',
            confirmButtonColor: '#d33',
            ...getSwalConfig()
          });
        } else if (response.status === 400 && data.error?.includes('already imported')) {
          // Update the study status locally
          setAllStudies(prevStudies => 
            prevStudies.map(s => 
              s.StudyInstanceUID === study.StudyInstanceUID 
                ? { ...s, isImported: true, registrationId: data.registrationId }
                : s
            )
          );
          
          toast.warning(`Study already imported as registration ${data.registrationId}`);
          await Swal.fire({
            title: 'Already Imported',
            text: `This study was already imported as registration ${data.registrationId}`,
            icon: 'warning',
            confirmButtonColor: '#ffc107',
            ...getSwalConfig()
          });
        } else {
          toast.error(data.error || 'Failed to import study');
          await Swal.fire({
            title: 'Import Failed',
            text: data.error || 'Failed to import study',
            icon: 'error',
            confirmButtonColor: '#d33',
            ...getSwalConfig()
          });
        }
      }
    } catch (err) {
      toast.error('Network error: Failed to import study');
      await Swal.fire({
        title: 'Network Error',
        text: 'Failed to connect to the server. Please try again.',
        icon: 'error',
        confirmButtonColor: '#d33',
        ...getSwalConfig()
      });
    } finally {
      // Remove from importing set
      setImportingStudies(prev => {
        const newSet = new Set(prev);
        newSet.delete(study.StudyInstanceUID);
        return newSet;
      });
    }
  };

  // Fetch PACS servers on component mount
  useEffect(() => {
    const fetchPacsServers = async () => {
      try {
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/active/`
        );
        
        if (response.ok) {
          const servers = await response.json();
          const serverOptions = servers.map((server: any) => ({
            id: server.id,
            name: server.name
          })).sort((a: any, b: any) => a.name.localeCompare(b.name));
          
          setAllPacsServerOptions(serverOptions);
        } else {
          console.error('Failed to fetch PACS servers:', response.status, response.statusText);
        }
      } catch (err) {
        console.error('Failed to fetch PACS servers:', err);
      }
    };

    fetchPacsServers();
  }, []);

  // Fetch modality options from database
  useEffect(() => {
    const fetchModalities = async () => {
      try {
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/modalities/`
        );
        
        if (response.ok) {
          const data = await response.json();
          const options: ModalityOption[] = [
            { value: 'ALL', label: 'All Modalities' }
          ];
          
          // Handle both paginated (data.results) and direct array responses
          const modalities = data.results || data;
          
          if (!Array.isArray(modalities)) {
            console.error('Invalid modalities response:', data);
            toast.error('Invalid modality data format');
            return;
          }
          
          // Process modalities and ensure proper DICOM codes
          modalities.forEach((modality: any) => {
            let dicomCode = modality.singkatan;
            
            // If singkatan is empty/null, try to map from nama
            if (!dicomCode || dicomCode.trim() === '') {
              // Map common Malaysian names to DICOM codes
              const nama = modality.nama.toLowerCase();
              if (nama.includes('x-ray') || nama.includes('xray')) {
                dicomCode = 'XR';
              } else if (nama.includes('ct') || nama.includes('computed tomography')) {
                dicomCode = 'CT';
              } else if (nama.includes('mri') || nama.includes('magnetic resonance')) {
                dicomCode = 'MR';
              } else if (nama.includes('ultrasound') || nama.includes('ultrasonografi')) {
                dicomCode = 'US';
              } else if (nama.includes('mammography') || nama.includes('mamografi')) {
                dicomCode = 'MG';
              } else {
                // Default to first 2-3 characters if no mapping found
                dicomCode = modality.nama.substring(0, 3).toUpperCase();
              }
            }
            
            options.push({
              value: dicomCode,
              label: modality.nama
            });
          });
          
          setModalityOptions(options);
        } else {
          console.error('Failed to fetch modalities:', response.status, response.statusText);
          toast.error('Failed to load modality options');
        }
      } catch (err) {
        console.error('Failed to fetch modalities:', err);
        toast.error('Failed to load modality options');
      }
    };

    fetchModalities();
  }, []);

  // Auto-load studies on component mount  
  useEffect(() => {
    const autoLoadStudies = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Search with empty parameters to get all recent studies from multiple PACS
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/search-multiple/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ limit: searchLimit })
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to load studies: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load studies');
        }

        // Map backend response to frontend format - multiple PACS support
        let formattedStudies: LegacyStudy[] = data.studies.map((study: any) => ({
          ID: study.id,
          StudyInstanceUID: study.studyInstanceUid,
          PatientName: study.patientName,
          PatientID: study.patientId,
          PatientBirthDate: study.patientBirthDate,
          PatientSex: study.patientSex,
          StudyDate: study.studyDate,
          StudyTime: study.studyTime,
          StudyDescription: study.studyDescription,
          Modality: study.modality,
          SeriesCount: study.seriesCount,
          ImageCount: study.imageCount,
          InstitutionName: study.institutionName,
          Ward: study.ward,
          Klinik: study.institutionName || study.pacs_server_name || 'Unknown',
          // DICOM fields from backend
          BodyPartExamined: study.bodyPartExamined || study.BodyPartExamined,
          ProtocolName: study.protocolName || study.ProtocolName,
          AcquisitionDeviceProcessingDescription: study.acquisitionDeviceProcessingDescription || study.AcquisitionDeviceProcessingDescription,
          Manufacturer: study.manufacturer || study.Manufacturer,
          // Store PACS server information for potential future use
          pacsServerId: study.pacs_server_id,
          pacsServerName: study.pacs_server_name
        }));

        // Check import status for all studies
        formattedStudies = await checkImportStatus(formattedStudies);

        // Store all studies for client-side filtering
        setAllStudies(formattedStudies);
        
        // Update PACS server options from all studies (preserve existing active servers)
        const extractedPacsServers = formattedStudies
          .filter(study => study.pacsServerId && study.pacsServerName)
          .map(study => ({ id: study.pacsServerId!, name: study.pacsServerName! }));
        
        // Merge with existing servers, keeping existing ones and adding new ones
        const existingServerIds = new Set(allPacsServerOptions.map(s => s.id));
        const newServers = extractedPacsServers.filter(server => !existingServerIds.has(server.id));
        
        if (newServers.length > 0) {
          const allServers = [...allPacsServerOptions, ...newServers];
          const uniquePacsServers = Array.from(
            new Map(allServers.map(server => [server.id, server])).values()
          ).sort((a, b) => a.name.localeCompare(b.name));
          setAllPacsServerOptions(uniquePacsServers);
        }
        
        // Update klinik options from all studies (preserve existing options)
        const extractedKliniks = formattedStudies.map(study => study.Klinik).filter(Boolean);
        const newKlinikOptions = Array.from(new Set([
          ...allKlinikOptions,
          ...extractedKliniks
        ])).sort();
        setAllKlinikOptions(newKlinikOptions);

        // Update manufacturer options from all studies
        const extractedManufacturers = formattedStudies.map(study => study.Manufacturer).filter(Boolean);
        const newManufacturerOptions = Array.from(new Set([
          ...allManufacturerOptions,
          ...extractedManufacturers
        ])).sort();
        setAllManufacturerOptions(newManufacturerOptions);

        // Update body part options from all studies
        const extractedBodyParts = formattedStudies.map(study => study.BodyPartExamined).filter(Boolean);
        const newBodyPartOptions = Array.from(new Set([
          ...allBodyPartOptions,
          ...extractedBodyParts
        ])).sort();
        setAllBodyPartOptions(newBodyPartOptions);

        // Update exam options from all studies (combine study description, protocol, and exam fields)
        const extractedExams = [
          ...formattedStudies.map(study => study.StudyDescription).filter(Boolean),
          ...formattedStudies.map(study => study.ProtocolName).filter(Boolean),
          ...formattedStudies.map(study => study.AcquisitionDeviceProcessingDescription).filter(Boolean)
        ];
        const newExamOptions = Array.from(new Set([
          ...allExamOptions,
          ...extractedExams
        ])).sort();
        setAllExamOptions(newExamOptions);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load studies');
      } finally {
        setLoading(false);
      }
    };

    autoLoadStudies();
  }, []);

  return (
    <div className="container-fluid px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Archive className="h-8 w-8" />
              PACS Browser
            </h1>
            <p className="mt-2 text-muted-foreground">
              Browse and view legacy DICOM studies from multiple PACS servers
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            Legacy Studies: {totalStudies} {totalStudies > itemsPerPage && `(Page ${currentPage} of ${totalPages})`}
          </Badge>
        </div>
      </div>

      {/* Search Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Legacy Studies
          </CardTitle>
          <CardDescription>
            Search through historical DICOM studies from multiple PACS servers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                placeholder="Enter patient name (min 3 chars)..."
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="patientId">Patient ID</Label>
              <Input
                id="patientId"
                placeholder="Enter patient ID (min 3 chars)..."
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="modality">Modality</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger>
                  <SelectValue placeholder="Select modality" />
                </SelectTrigger>
                <SelectContent>
                  {modalityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dateRange">Date Range</Label>
              <Input
                ref={dateRangeRef}
                id="dateRange"
                placeholder="Select date range..."
                className="cursor-pointer"
                readOnly
              />
            </div>

            <div>
              <Label htmlFor="klinik">Klinik</Label>
              <Select value={klinik} onValueChange={setKlinik}>
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinics</SelectItem>
                  {allKlinikOptions.map(clinic => (
                    <SelectItem key={clinic} value={clinic}>{clinic}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bodyPart">Body Part</Label>
              <Select value={bodyPart} onValueChange={setBodyPart}>
                <SelectTrigger>
                  <SelectValue placeholder="Select body part" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Body Parts</SelectItem>
                  {allBodyPartOptions.map(part => (
                    <SelectItem key={part} value={part}>{part}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="exam">Exam</Label>
              <Select value={exam} onValueChange={setExam}>
                <SelectTrigger>
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exams</SelectItem>
                  {allExamOptions.map(ex => (
                    <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Select value={manufacturer} onValueChange={setManufacturer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Manufacturers</SelectItem>
                  {allManufacturerOptions.map(mfg => (
                    <SelectItem key={mfg} value={mfg}>{mfg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pacsServers">PACS Servers</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      {selectedPacsServers.length === 0 ? 'All PACS Servers' : 
                       selectedPacsServers.length === 1 ? 
                       allPacsServerOptions.find(s => s.id === selectedPacsServers[0])?.name || 'Selected' :
                       `${selectedPacsServers.length} servers selected`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel>Select PACS Servers</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedPacsServers.length === 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedPacsServers([]);
                      }
                    }}
                  >
                    All Servers
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {allPacsServerOptions.map(server => (
                    <DropdownMenuCheckboxItem
                      key={server.id}
                      checked={selectedPacsServers.includes(server.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedPacsServers(prev => [...prev, server.id]);
                        } else {
                          setSelectedPacsServers(prev => prev.filter(id => id !== server.id));
                        }
                      }}
                    >
                      {server.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex justify-between items-center mt-6">
            <div className="text-sm text-muted-foreground">
              Filters apply automatically • Text search requires minimum 3 characters
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="searchLimit" className="text-sm">Max Results:</Label>
                <Select value={searchLimit.toString()} onValueChange={(value) => setSearchLimit(Number(value))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="300">300</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                    <SelectItem value="1000">1000</SelectItem>
                    <SelectItem value="2000">2000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={searchLegacyStudies} disabled={searching}>
                {searching ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Studies
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={clearFilters}>
                <Filter className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Legacy Studies ({studies.length})
            </span>
          </CardTitle>
          <CardDescription>
            Historical DICOM studies from multiple PACS servers with pagination support
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Patient</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Study Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Modality</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Exam</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Body Part</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Manufacturer</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">PACS Server</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Series</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studies.map((study) => (
                    <tr key={study.ID} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        <div>
                          <p className="font-medium">{study.PatientName?.replace(/\^/g, ' ') || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">ID: {study.PatientID}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>{formatDate(study.StudyDate || '')}</span>
                        </div>
                        {study.StudyTime && (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatTime(study.StudyTime)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant="secondary" className="text-xs">
                          {study.Modality}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="max-w-xs">
                          {study.StudyDescription && (
                            <p className="truncate font-medium" title={`Study: ${study.StudyDescription}`}>
                              {study.StudyDescription}
                            </p>
                          )}
                          {study.ProtocolName && (
                            <p className="truncate text-xs text-muted-foreground" title={`Protocol: ${study.ProtocolName}`}>
                              {study.ProtocolName}
                            </p>
                          )}
                          {study.AcquisitionDeviceProcessingDescription && (
                            <p className="truncate text-xs text-muted-foreground" title={`Exam: ${study.AcquisitionDeviceProcessingDescription}`}>
                              {study.AcquisitionDeviceProcessingDescription}
                            </p>
                          )}
                          {!study.StudyDescription && !study.ProtocolName && !study.AcquisitionDeviceProcessingDescription && (
                            <p className="text-muted-foreground">-</p>
                          )}
                          {study.InstitutionName && (
                            <p className="text-xs text-muted-foreground mt-1">{study.InstitutionName}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="max-w-xs truncate" title={study.BodyPartExamined}>
                          {study.BodyPartExamined || '-'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <p className="max-w-xs truncate" title={study.Manufacturer}>
                          {study.Manufacturer || '-'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant="secondary" className="text-xs" title={`Server ID: ${study.pacsServerId}`}>
                          {study.pacsServerName || 'Unknown'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant="outline" className="text-xs">
                          {study.SeriesCount} series
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewStudy(study)}
                            className="text-xs"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          {(user?.is_staff || user?.is_superuser) && (
                            study.isImported ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/studies/${study.registrationId}`)}
                                className="text-xs"
                                title="Study already imported - View in RIS"
                              >
                                <Archive className="w-3 h-3 mr-1" />
                                In RIS
                              </Button>
                            ) : user?.is_superuser ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => importStudy(study)}
                                disabled={importingStudies.has(study.StudyInstanceUID)}
                                className="text-xs"
                                title="Import this study to RIS (Superuser only)"
                              >
                                {importingStudies.has(study.StudyInstanceUID) ? (
                                  <>
                                    <div className="w-3 h-3 mr-1 animate-spin rounded-full border border-current border-t-transparent" />
                                    Importing...
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3 mr-1" />
                                    Import
                                  </>
                                )}
                              </Button>
                            ) : null
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !searching ? (
            <div className="text-center py-12">
              <Archive className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Studies Found</h3>
              <p className="text-muted-foreground mb-4">
                Use the search filters above to find legacy DICOM studies
              </p>
              <Button onClick={searchLegacyStudies}>
                <Search className="w-4 h-4 mr-2" />
                Search All Studies
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          )}
          
          {/* Pagination Controls */}
          {studies.length > 0 && filteredStudies.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t mx-6 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalStudies)} of {totalStudies} studies
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="itemsPerPage" className="text-sm">Show:</Label>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}