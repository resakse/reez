'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, X, FileText, AlertCircle, CheckCircle, 
  User, Stethoscope, Building, FileImage, Loader2, Server
} from 'lucide-react';
import Select, { SingleValue } from 'react-select';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';
import { autoPopulateRace } from '@/lib/raceInference';

interface DicomFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  metadata?: {
    patientName?: string;
    patientID?: string;
    studyDescription?: string;
    modality?: string;
    studyDate?: string;
  };
}

interface DicomUploadProps {
  onUploadComplete?: (result: any) => void;
  patientId?: string; // Pre-select patient
  onClose?: () => void;
}

interface Patient {
  id: string;
  nama: string;
  nric: string;
  mrn: string;
}

interface Ward {
  id: string;
  wad: string;
}

interface PacsServer {
  id: number;
  name: string;
  is_primary?: boolean;
}

interface SelectOption {
  value: string;
  label: string;
}

// Use state to detect theme
const useTheme = () => {
  const [isDark, setIsDark] = React.useState(false);
  
  React.useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    
    checkTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  return isDark;
};

// Custom styles for React Select with solid backgrounds
const getSelectStyles = (isDark: boolean) => ({
  control: (provided: any, state: any) => ({
    ...provided,
    minHeight: '38px',
    border: `1px solid ${isDark ? '#374151' : '#e2e8f0'}`,
    borderRadius: '6px',
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    color: isDark ? '#f9fafb' : '#1f2937',
    boxShadow: state.isFocused ? `0 0 0 2px ${isDark ? '#3b82f6' : '#3b82f6'}80` : 'none',
    '&:hover': {
      borderColor: isDark ? '#4b5563' : '#d1d5db'
    }
  }),
  menuPortal: (provided: any) => ({
    ...provided,
    zIndex: 9999
  }),
  menu: (provided: any) => ({
    ...provided,
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    border: `1px solid ${isDark ? '#374151' : '#e2e8f0'}`,
    borderRadius: '6px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    zIndex: 9999
  }),
  menuList: (provided: any) => ({
    ...provided,
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    padding: '4px'
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected 
      ? '#3b82f6' 
      : state.isFocused 
        ? (isDark ? '#374151' : '#f1f5f9')
        : (isDark ? '#1f2937' : '#ffffff'),
    color: state.isSelected 
      ? '#ffffff' 
      : (isDark ? '#f9fafb' : '#1f2937'),
    borderRadius: '4px',
    margin: '2px 0',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: state.isSelected 
        ? '#3b82f6' 
        : (isDark ? '#374151' : '#f1f5f9')
    }
  }),
  placeholder: (provided: any) => ({
    ...provided,
    color: isDark ? '#9ca3af' : '#6b7280'
  }),
  singleValue: (provided: any) => ({
    ...provided,
    color: isDark ? '#f9fafb' : '#1f2937'
  }),
  input: (provided: any) => ({
    ...provided,
    color: isDark ? '#f9fafb' : '#1f2937'
  }),
  loadingIndicator: (provided: any) => ({
    ...provided,
    color: isDark ? '#9ca3af' : '#6b7280'
  }),
  indicatorSeparator: (provided: any) => ({
    ...provided,
    backgroundColor: isDark ? '#374151' : '#e2e8f0'
  }),
  dropdownIndicator: (provided: any) => ({
    ...provided,
    color: isDark ? '#9ca3af' : '#6b7280',
    '&:hover': {
      color: isDark ? '#f9fafb' : '#1f2937'
    }
  })
});

const DicomUpload: React.FC<DicomUploadProps> = ({ 
  onUploadComplete, 
  patientId,
  onClose 
}) => {
  const [files, setFiles] = useState<DicomFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<SelectOption | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [pacsServers, setPacsServers] = useState<PacsServer[]>([]);
  const [selectedPacsServer, setSelectedPacsServer] = useState<SelectOption | null>(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [isLoadingPacsServers, setIsLoadingPacsServers] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    modality: 'OT',
    studyDescription: '',
    referringPhysician: '',
    wardId: ''
  });

  // Modality options
  const modalityOptions: SelectOption[] = [
    { value: 'XR', label: 'X-Ray (XR)' },
    { value: 'CT', label: 'CT Scan' },
    { value: 'MR', label: 'MRI' },
    { value: 'US', label: 'Ultrasound' },
    { value: 'CR', label: 'Computed Radiography' },
    { value: 'DX', label: 'Digital X-Ray' },
    { value: 'OT', label: 'Other' }
  ];

  // Convert data to select options
  const patientOptions: SelectOption[] = [
    { value: '', label: 'Auto-create patient from DICOM PatientName/PatientID' },
    ...patients.map(patient => ({
      value: patient.id,
      label: `${patient.nama} - ${patient.nric} (${patient.mrn || 'No MRN'})`
    }))
  ];

  const wardOptions: SelectOption[] = [
    { value: '', label: 'Select ward (optional)' },
    ...(Array.isArray(wards) ? wards.map(ward => ({
      value: ward.id,
      label: ward.wad
    })) : [])
  ];

  const pacsServerOptions: SelectOption[] = pacsServers.map(server => ({
    value: server.id.toString(),
    label: server.is_primary ? `${server.name} (Primary)` : server.name
  }));
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const isDark = useTheme();

  // Handle client-side mounting
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load patients when component mounts
  React.useEffect(() => {
    loadPatients();
    loadWards();
    loadPacsServers();
  }, []);

  // Set initial patient selection when patientId prop changes or patients load
  React.useEffect(() => {
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        setSelectedPatient({
          value: patient.id,
          label: `${patient.nama} - ${patient.nric} (${patient.mrn || 'No MRN'})`
        });
      }
    }
  }, [patientId, patients]);

  const loadPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/patients/`
      );
      if (response.ok) {
        const data = await response.json();
        setPatients(data.results || data);
      }
    } catch (error) {
      toast.error('Failed to load patients');
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const loadWards = async () => {
    setIsLoadingWards(true);
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/wards/`
      );
      if (response.ok) {
        const data = await response.json();
        // Handle DRF pagination - extract results array
        setWards(data.results || data);
      }
    } catch (error) {
      toast.error('Failed to load wards');
    } finally {
      setIsLoadingWards(false);
    }
  };

  const loadPacsServers = async () => {
    setIsLoadingPacsServers(true);
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/upload-destinations/`
      );
      if (response.ok) {
        const data = await response.json();
        console.log('PACS servers API response:', data); // Debug log
        
        const servers = data.servers || [];
        setPacsServers(servers);
        
        if (servers.length === 0) {
          console.warn('No PACS servers returned from API');
          toast.warning('No PACS servers configured. Contact your administrator to set up PACS servers.');
        } else {
          console.log(`Found ${servers.length} PACS server(s):`, servers.map(s => s.name));
        }
        
        // Auto-select primary server if available
        const primaryServer = servers.find((server: PacsServer) => server.is_primary);
        if (primaryServer) {
          setSelectedPacsServer({
            value: primaryServer.id.toString(),
            label: `${primaryServer.name} (Primary)`
          });
          console.log('Auto-selected primary server:', primaryServer.name);
        } else if (servers.length === 1) {
          // Auto-select if only one server available
          setSelectedPacsServer({
            value: servers[0].id.toString(),
            label: servers[0].name
          });
          console.log('Auto-selected only available server:', servers[0].name);
        }
      } else {
        console.error('PACS servers API error:', response.status, response.statusText);
        const errorData = await response.text();
        console.error('Error response:', errorData);
        toast.error(`Failed to load PACS servers: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      toast.error('Failed to load PACS servers');
    } finally {
      setIsLoadingPacsServers(false);
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    const dicomFiles: DicomFile[] = fileArray.map(file => ({
      file,
      id: `${Date.now()}-${Math.random()}`,
      status: 'pending'
    }));
    
    // Validate DICOM files (basic check)
    const validFiles = dicomFiles.filter(fileData => {
      const { file } = fileData;
      // Check file extension or MIME type
      const isDicom = file.name.toLowerCase().endsWith('.dcm') || 
                      file.name.toLowerCase().endsWith('.dicom') ||
                      file.type === 'application/dicom';
      
      if (!isDicom) {
        fileData.status = 'error';
        fileData.error = 'Not a DICOM file';
      }
      
      return isDicom;
    });
    
    setFiles(prev => [...prev, ...validFiles]);
    
    // Extract metadata from first file if possible
    if (validFiles.length > 0 && !formData.studyDescription) {
      extractMetadata(validFiles[0]);
    }
  }, [formData.studyDescription]);

  // Extract basic metadata from DICOM file (limited without proper parser)
  const extractMetadata = async (fileData: DicomFile) => {
    try {
      // This is a simplified metadata extraction
      // In a real implementation, you'd use a proper DICOM parser
      const fileName = fileData.file.name;
      
      // Try to infer information from filename
      const metadata: any = {};
      
      // Look for common patterns in DICOM filenames
      if (fileName.includes('CT')) metadata.modality = 'CT';
      else if (fileName.includes('MR')) metadata.modality = 'MR';
      else if (fileName.includes('XR') || fileName.includes('CR') || fileName.includes('DX')) metadata.modality = 'XR';
      else if (fileName.includes('US')) metadata.modality = 'US';
      
      fileData.metadata = metadata;
      
      // Update form data if modality detected
      if (metadata.modality && !formData.modality) {
        setFormData(prev => ({ ...prev, modality: metadata.modality }));
      }
      
    } catch (error) {
      // Ignore metadata extraction errors
    }
  };

  // Handle drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles);
    }
  }, [handleFileSelect]);

  // Remove file from list
  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Handle upload
  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select DICOM files to upload');
      return;
    }

    if (!selectedPacsServer || !selectedPacsServer.value) {
      toast.error('Please select a PACS server for upload');
      return;
    }

    // Patient will be created from DICOM metadata if not selected

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Prepare form data for upload
      const uploadFormData = new FormData();
      
      // Add files
      files.forEach(fileData => {
        uploadFormData.append('dicom_files', fileData.file);
      });
      
      // Add metadata
      if (selectedPatient && selectedPatient.value) {
        uploadFormData.append('patient_id', selectedPatient.value);
      }
      if (selectedPacsServer && selectedPacsServer.value) {
        uploadFormData.append('pacs_server_id', selectedPacsServer.value);
      }
      uploadFormData.append('modality', formData.modality);
      uploadFormData.append('study_description', formData.studyDescription);
      uploadFormData.append('referring_physician', formData.referringPhysician);
      if (formData.wardId) {
        uploadFormData.append('ward_id', formData.wardId);
      }

      // Upload with progress tracking
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/upload/dicom/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AuthService.getAccessToken()}`
          },
          body: uploadFormData
        }
      );

      const result = await response.json();

      if (response.ok) {
        // Update file statuses based on upload results
        setFiles(prev => prev.map(fileData => {
          const uploadResult = result.data.uploaded_files.find(
            (uf: any) => uf.filename === fileData.file.name
          );
          
          return {
            ...fileData,
            status: uploadResult?.status === 'uploaded' ? 'success' : 'error',
            error: uploadResult?.error
          };
        }));

        toast.success(result.message);
        
        // Call completion callback
        if (onUploadComplete) {
          onUploadComplete(result.data);
        }

        // Auto-close after successful upload
        setTimeout(() => {
          if (onClose) onClose();
        }, 2000);

      } else {
        toast.error(result.message || 'Upload failed');
        setFiles(prev => prev.map(f => ({ ...f, status: 'error', error: result.error })));
      }

    } catch (error) {
      toast.error('Upload failed: Network error');
      setFiles(prev => prev.map(f => ({ ...f, status: 'error', error: 'Network error' })));
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  };

  // Reset form
  const handleReset = () => {
    setFiles([]);
    setFormData({
      modality: 'OT',
      studyDescription: '',
      referringPhysician: '',
      wardId: ''
    });
    setSelectedPatient(null);
    setSelectedPacsServer(null);
    setUploadProgress(0);
    
    // Re-select primary PACS server if available
    const primaryServer = pacsServers.find(server => server.is_primary);
    if (primaryServer) {
      setSelectedPacsServer({
        value: primaryServer.id.toString(),
        label: `${primaryServer.name} (Primary)`
      });
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload DICOM Images
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        
        {/* Patient Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Patient (Optional - auto-created from DICOM)
          </Label>
          <Select
            value={selectedPatient}
            onChange={(option: SingleValue<SelectOption>) => setSelectedPatient(option)}
            options={patientOptions}
            styles={getSelectStyles(isDark)}
            isLoading={isLoadingPatients}
            isSearchable
            isClearable
            placeholder="New patient auto-created from DICOM PatientName/PatientID"
            loadingMessage={() => "Loading patients..."}
            noOptionsMessage={() => "No patients found"}
            menuPortalTarget={isMounted ? document.body : undefined}
            menuPlacement="auto"
          />
          {isLoadingPatients && (
            <p className="text-sm text-muted-foreground">Loading patients...</p>
          )}
        </div>

        {/* PACS Server Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            PACS Server (Required)
          </Label>
          <Select
            value={selectedPacsServer}
            onChange={(option: SingleValue<SelectOption>) => setSelectedPacsServer(option)}
            options={pacsServerOptions}
            styles={getSelectStyles(isDark)}
            isLoading={isLoadingPacsServers}
            isSearchable={false}
            placeholder="Select PACS server for upload"
            loadingMessage={() => "Loading PACS servers..."}
            noOptionsMessage={() => "No PACS servers available"}
            menuPortalTarget={isMounted ? document.body : undefined}
            menuPlacement="auto"
          />
          {isLoadingPacsServers && (
            <p className="text-sm text-muted-foreground">Loading PACS servers...</p>
          )}
          {!isLoadingPacsServers && pacsServers.length === 0 && (
            <p className="text-sm text-red-600">No PACS servers configured. Contact your administrator.</p>
          )}
        </div>

        {/* Study Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Modality (Optional - auto-extracted from DICOM)</Label>
            <Select
              value={modalityOptions.find(option => option.value === formData.modality)}
              onChange={(option: SingleValue<SelectOption>) => setFormData(prev => ({ ...prev, modality: option?.value || 'OT' }))}
              options={modalityOptions}
              styles={getSelectStyles(isDark)}
              isSearchable={false}
              placeholder="Auto-extracted from DICOM Modality tag"
              menuPortalTarget={isMounted ? document.body : undefined}
              menuPlacement="auto"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Ward/Department
            </Label>
            <Select
              value={wardOptions.find(option => option.value === formData.wardId)}
              onChange={(option: SingleValue<SelectOption>) => setFormData(prev => ({ ...prev, wardId: option?.value || '' }))}
              options={wardOptions}
              styles={getSelectStyles(isDark)}
              isLoading={isLoadingWards}
              isSearchable
              isClearable
              placeholder="Select ward (optional)"
              loadingMessage={() => "Loading wards..."}
              noOptionsMessage={() => "No wards found"}
              menuPortalTarget={isMounted ? document.body : undefined}
              menuPlacement="auto"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Study Description (Optional - auto-extracted from DICOM)</Label>
          <Input
            value={formData.studyDescription}
            onChange={(e) => setFormData(prev => ({ ...prev, studyDescription: e.target.value }))}
            placeholder="Auto-extracted from DICOM StudyDescription tag"
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Referring Physician (Optional - auto-extracted from DICOM)
          </Label>
          <Input
            value={formData.referringPhysician}
            onChange={(e) => setFormData(prev => ({ ...prev, referringPhysician: e.target.value }))}
            placeholder="Auto-extracted from DICOM ReferringPhysicianName tag"
          />
        </div>

        {/* File Upload Area */}
        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <FileImage className="h-4 w-4" />
            DICOM Files
          </Label>
          
          <div
            ref={dragRef}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
              ${isUploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            `}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">
              {isDragging ? 'Drop DICOM files here' : 'Click to upload or drag and drop'}
            </p>
            <p className="text-sm text-muted-foreground">
              Supports .dcm, .dicom files
            </p>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".dcm,.dicom,application/dicom"
              className="hidden"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            />
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <Label>Selected Files ({files.length})</Label>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {files.map(fileData => (
                <div key={fileData.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{fileData.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(fileData.file.size / 1024 / 1024).toFixed(2)} MB
                        {fileData.metadata?.modality && ` • ${fileData.metadata.modality}`}
                      </p>
                      {fileData.error && (
                        <p className="text-xs text-red-600">{fileData.error}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {fileData.status === 'pending' && (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                    {fileData.status === 'uploading' && (
                      <Badge variant="secondary">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Uploading
                      </Badge>
                    )}
                    {fileData.status === 'success' && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Success
                      </Badge>
                    )}
                    {fileData.status === 'error' && (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Error
                      </Badge>
                    )}
                    
                    {!isUploading && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(fileData.id)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <div className="flex gap-2">
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={handleReset}
              disabled={isUploading}
            >
              Reset
            </Button>
          </div>
          
          <Button 
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading || !selectedPacsServer}
            className="min-w-32"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {files.length} File{files.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DicomUpload;