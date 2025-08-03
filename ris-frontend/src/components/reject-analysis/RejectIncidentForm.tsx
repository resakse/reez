'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Calendar } from 'lucide-react';
import { 
  AlertTriangle, 
  Save, 
  ArrowLeft, 
  Search,
  CheckCircle,
  Clock,
  User
} from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  RejectIncident,
  RejectCategory,
  RejectIncidentFormData,
  Language,
  SEVERITY_CONFIG
} from '@/types/reject-analysis';
import rejectAnalysisApi from '@/lib/reject-analysis-api';

interface RejectIncidentFormProps {
  incidentId?: number;
  language?: Language;
  onSave?: (incident: RejectIncident) => void;
  onCancel?: () => void;
  preFilledData?: Partial<RejectIncidentFormData>;
}

const translations = {
  en: {
    title: 'Reject Incident Report',
    editTitle: 'Edit Reject Incident',
    createTitle: 'Log New Reject Incident',
    subtitle: 'Document individual image reject incidents for quality analysis',
    studyInfo: 'Study Information',
    incidentDetails: 'Incident Details',
    followUp: 'Follow-up Actions',
    studyUidLabel: 'Study Instance UID',
    accessionLabel: 'Accession Number',
    patientNameLabel: 'Patient Name',
    patientMrnLabel: 'Patient MRN',
    examDateLabel: 'Exam Date',
    modalityLabel: 'Modality',
    examDescLabel: 'Exam Description',
    categoryLabel: 'Reject Category',
    subcategoryLabel: 'Subcategory (Optional)',
    reasonDetailLabel: 'Reason Detail (Bahasa Malaysia)',
    reasonDetailEnglishLabel: 'Reason Detail (English)',
    incidentDateLabel: 'Incident Date',
    severityLabel: 'Severity',
    retakePerformedLabel: 'Retake Performed',
    retakeDateLabel: 'Retake Date',
    correctiveActionLabel: 'Corrective Action (Bahasa Malaysia)',
    correctiveActionEnglishLabel: 'Corrective Action (English)',
    followUpRequiredLabel: 'Follow-up Required',
    save: 'Save Incident',
    cancel: 'Cancel',
    loading: 'Loading incident...',
    loadingCategories: 'Loading categories...',
    saving: 'Saving...',
    error: 'Error loading data',
    searchStudy: 'Search Study',
    selectCategory: 'Select a category',
    selectModality: 'Select modality',
    selectSeverity: 'Select severity',
    validation: {
      studyUidRequired: 'Study Instance UID is required',
      accessionRequired: 'Accession Number is required',
      patientNameRequired: 'Patient Name is required',
      examDateRequired: 'Exam Date is required',
      modalityRequired: 'Modality is required',
      examDescRequired: 'Exam Description is required',
      categoryRequired: 'Reject Category is required',
      reasonDetailRequired: 'Reason Detail (Bahasa Malaysia) is required',
      reasonDetailEnglishRequired: 'Reason Detail (English) is required',
      incidentDateRequired: 'Incident Date is required',
      severityRequired: 'Severity is required',
      retakeDateRequired: 'Retake Date is required when retake is performed',
    },
    modalities: [
      'CR', 'CT', 'MR', 'US', 'MG', 'RF', 'XA', 'PT', 'NM', 'DX'
    ],
    severities: {
      LOW: 'Low Impact',
      MEDIUM: 'Medium Impact',
      HIGH: 'High Impact',
      CRITICAL: 'Critical Impact'
    },
    severityDescriptions: {
      LOW: 'Minor issue, minimal impact on diagnosis',
      MEDIUM: 'Moderate issue, may affect diagnosis',
      HIGH: 'Significant issue, likely affects diagnosis',
      CRITICAL: 'Critical issue, prevents diagnosis'
    },
    placeholders: {
      studyUid: '1.2.840.113619.2.55.3.604688119.868.1234567890.123',
      accession: 'ACC20250001',
      patientName: 'Ahmad bin Ali',
      patientMrn: 'MRN001234',
      examDesc: 'Chest X-Ray PA View',
      subcategory: 'e.g., Positioning, Exposure, Processing',
      reasonDetail: 'Keterangan terperinci mengenai sebab penolakan...',
      reasonDetailEnglish: 'Detailed description of rejection reason...',
      correctiveAction: 'Tindakan pembetulan yang telah diambil...',
      correctiveActionEnglish: 'Corrective actions taken...'
    }
  },
  ms: {
    title: 'Laporan Insiden Penolakan',
    editTitle: 'Edit Insiden Penolakan',
    createTitle: 'Catat Insiden Penolakan Baru',
    subtitle: 'Dokumentasi insiden penolakan imej individu untuk analisis kualiti',
    studyInfo: 'Maklumat Kajian',
    incidentDetails: 'Butiran Insiden',
    followUp: 'Tindakan Susulan',
    studyUidLabel: 'Study Instance UID',
    accessionLabel: 'Nombor Akses',
    patientNameLabel: 'Nama Pesakit',
    patientMrnLabel: 'MRN Pesakit',
    examDateLabel: 'Tarikh Pemeriksaan',
    modalityLabel: 'Modaliti',
    examDescLabel: 'Keterangan Pemeriksaan',
    categoryLabel: 'Kategori Penolakan',
    subcategoryLabel: 'Subkategori (Pilihan)',
    reasonDetailLabel: 'Butiran Sebab (Bahasa Malaysia)',
    reasonDetailEnglishLabel: 'Butiran Sebab (English)',
    incidentDateLabel: 'Tarikh Insiden',
    severityLabel: 'Tahap Keterukan',
    retakePerformedLabel: 'Retake Dilakukan',
    retakeDateLabel: 'Tarikh Retake',
    correctiveActionLabel: 'Tindakan Pembetulan (Bahasa Malaysia)',
    correctiveActionEnglishLabel: 'Tindakan Pembetulan (English)',
    followUpRequiredLabel: 'Susulan Diperlukan',
    save: 'Simpan Insiden',
    cancel: 'Batal',
    loading: 'Memuatkan insiden...',
    loadingCategories: 'Memuatkan kategori...',
    saving: 'Menyimpan...',
    error: 'Ralat memuatkan data',
    searchStudy: 'Cari Kajian',
    selectCategory: 'Pilih kategori',
    selectModality: 'Pilih modaliti',
    selectSeverity: 'Pilih tahap keterukan',
    validation: {
      studyUidRequired: 'Study Instance UID diperlukan',
      accessionRequired: 'Nombor Akses diperlukan',
      patientNameRequired: 'Nama Pesakit diperlukan',
      examDateRequired: 'Tarikh Pemeriksaan diperlukan',
      modalityRequired: 'Modaliti diperlukan',
      examDescRequired: 'Keterangan Pemeriksaan diperlukan',
      categoryRequired: 'Kategori Penolakan diperlukan',
      reasonDetailRequired: 'Butiran Sebab (Bahasa Malaysia) diperlukan',
      reasonDetailEnglishRequired: 'Butiran Sebab (English) diperlukan',
      incidentDateRequired: 'Tarikh Insiden diperlukan',
      severityRequired: 'Tahap Keterukan diperlukan',
      retakeDateRequired: 'Tarikh Retake diperlukan apabila retake dilakukan',
    },
    modalities: [
      'CR', 'CT', 'MR', 'US', 'MG', 'RF', 'XA', 'PT', 'NM', 'DX'
    ],
    severities: {
      LOW: 'Impak Rendah',
      MEDIUM: 'Impak Sederhana',
      HIGH: 'Impak Tinggi',
      CRITICAL: 'Impak Kritikal'
    },
    severityDescriptions: {
      LOW: 'Isu kecil, impak minimum pada diagnosis',
      MEDIUM: 'Isu sederhana, mungkin mempengaruhi diagnosis',
      HIGH: 'Isu signifikan, berkemungkinan mempengaruhi diagnosis',
      CRITICAL: 'Isu kritikal, menghalang diagnosis'
    },
    placeholders: {
      studyUid: '1.2.840.113619.2.55.3.604688119.868.1234567890.123',
      accession: 'ACC20250001',
      patientName: 'Ahmad bin Ali',
      patientMrn: 'MRN001234',
      examDesc: 'X-Ray Dada PA View',
      subcategory: 'cth: Positioning, Exposure, Processing',
      reasonDetail: 'Keterangan terperinci mengenai sebab penolakan...',
      reasonDetailEnglish: 'Detailed description of rejection reason...',
      correctiveAction: 'Tindakan pembetulan yang telah diambil...',
      correctiveActionEnglish: 'Corrective actions taken...'
    }
  }
};

export default function RejectIncidentForm({
  incidentId,
  language = 'en',
  onSave,
  onCancel,
  preFilledData
}: RejectIncidentFormProps) {
  const t = translations[language];
  
  const [incident, setIncident] = useState<RejectIncident | null>(null);
  const [categories, setCategories] = useState<RejectCategory[]>([]);
  const [loading, setLoading] = useState(!!incidentId);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<RejectIncidentFormData>({
    study_instance_uid: '',
    accession_number: '',
    patient_name: '',
    patient_mrn: '',
    exam_date: new Date().toISOString().split('T')[0],
    modality: '',
    exam_description: '',
    category_id: 0,
    subcategory: '',
    reason_detail: '',
    reason_detail_english: '',
    incident_date: new Date().toISOString().split('T')[0],
    retake_performed: false,
    retake_date: '',
    severity: 'MEDIUM',
    corrective_action: '',
    corrective_action_english: '',
    follow_up_required: false,
    ...preFilledData
  });

  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RejectIncidentFormData, string>>>({});

  useEffect(() => {
    loadCategories();
    if (incidentId) {
      loadIncident();
    }
  }, [incidentId]);

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);

      const data = await rejectAnalysisApi.categories.getCategories({ 
        is_active: true, 
        ordering: 'position' 
      });
      setCategories(data.results || data);
    } catch (err) {
      console.error('Error loading categories:', err);
      toast.error('Failed to load reject categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadIncident = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await rejectAnalysisApi.incidents.getIncident(incidentId!);
      setIncident(data);
      
      // Populate form with existing data
      setFormData({
        study_instance_uid: data.study_instance_uid,
        accession_number: data.accession_number,
        patient_name: data.patient_name,
        patient_mrn: data.patient_mrn || '',
        exam_date: data.exam_date,
        modality: data.modality,
        exam_description: data.exam_description,
        category_id: data.category.id,
        subcategory: data.subcategory || '',
        reason_detail: data.reason_detail,
        reason_detail_english: data.reason_detail_english,
        incident_date: data.incident_date,
        retake_performed: data.retake_performed,
        retake_date: data.retake_date || '',
        severity: data.severity,
        corrective_action: data.corrective_action || '',
        corrective_action_english: data.corrective_action_english || '',
        follow_up_required: data.follow_up_required,
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof RejectIncidentFormData, string>> = {};

    if (!formData.study_instance_uid.trim()) {
      errors.study_instance_uid = t.validation.studyUidRequired;
    }

    if (!formData.accession_number.trim()) {
      errors.accession_number = t.validation.accessionRequired;
    }

    if (!formData.patient_name.trim()) {
      errors.patient_name = t.validation.patientNameRequired;
    }

    if (!formData.exam_date) {
      errors.exam_date = t.validation.examDateRequired;
    }

    if (!formData.modality) {
      errors.modality = t.validation.modalityRequired;
    }

    if (!formData.exam_description.trim()) {
      errors.exam_description = t.validation.examDescRequired;
    }

    if (!formData.category_id || formData.category_id === 0) {
      errors.category_id = t.validation.categoryRequired;
    }

    if (!formData.reason_detail.trim()) {
      errors.reason_detail = t.validation.reasonDetailRequired;
    }

    if (!formData.reason_detail_english.trim()) {
      errors.reason_detail_english = t.validation.reasonDetailEnglishRequired;
    }

    if (!formData.incident_date) {
      errors.incident_date = t.validation.incidentDateRequired;
    }

    if (!formData.severity) {
      errors.severity = t.validation.severityRequired;
    }

    if (formData.retake_performed && !formData.retake_date) {
      errors.retake_date = t.validation.retakeDateRequired;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);

      const savedIncident = incidentId
        ? await rejectAnalysisApi.incidents.updateIncident(incidentId, formData)
        : await rejectAnalysisApi.incidents.createIncident(formData);

      if (onSave) {
        onSave(savedIncident);
      }

    } catch (err) {
      // Error handling is already done in the API service
      console.error('Error saving incident:', err);
    } finally {
      setSaving(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
    if (!config) return null;

    return (
      <Badge className={config.color}>
        {language === 'ms' ? config.label_ms : config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {incidentId ? t.editTitle : t.createTitle}
              </CardTitle>
              <CardDescription>{t.subtitle}</CardDescription>
            </div>
            
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t.cancel}
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Study Information */}
          <div>
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Search className="h-5 w-5" />
              {t.studyInfo}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="study_uid">{t.studyUidLabel}</Label>
                <Input
                  id="study_uid"
                  value={formData.study_instance_uid}
                  onChange={(e) => setFormData({ ...formData, study_instance_uid: e.target.value })}
                  placeholder={t.placeholders.studyUid}
                />
                {formErrors.study_instance_uid && (
                  <p className="text-sm text-red-500">{formErrors.study_instance_uid}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="accession">{t.accessionLabel}</Label>
                <Input
                  id="accession"
                  value={formData.accession_number}
                  onChange={(e) => setFormData({ ...formData, accession_number: e.target.value })}
                  placeholder={t.placeholders.accession}
                />
                {formErrors.accession_number && (
                  <p className="text-sm text-red-500">{formErrors.accession_number}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="patient_name">{t.patientNameLabel}</Label>
                <Input
                  id="patient_name"
                  value={formData.patient_name}
                  onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                  placeholder={t.placeholders.patientName}
                />
                {formErrors.patient_name && (
                  <p className="text-sm text-red-500">{formErrors.patient_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="patient_mrn">{t.patientMrnLabel}</Label>
                <Input
                  id="patient_mrn"
                  value={formData.patient_mrn}
                  onChange={(e) => setFormData({ ...formData, patient_mrn: e.target.value })}
                  placeholder={t.placeholders.patientMrn}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="exam_date">{t.examDateLabel}</Label>
                <Input
                  id="exam_date"
                  type="date"
                  value={formData.exam_date}
                  onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                />
                {formErrors.exam_date && (
                  <p className="text-sm text-red-500">{formErrors.exam_date}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="modality">{t.modalityLabel}</Label>
                <Select
                  value={formData.modality}
                  onValueChange={(value) => setFormData({ ...formData, modality: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectModality} />
                  </SelectTrigger>
                  <SelectContent>
                    {t.modalities.map((modality) => (
                      <SelectItem key={modality} value={modality}>
                        {modality}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.modality && (
                  <p className="text-sm text-red-500">{formErrors.modality}</p>
                )}
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <Label htmlFor="exam_desc">{t.examDescLabel}</Label>
              <Input
                id="exam_desc"
                value={formData.exam_description}
                onChange={(e) => setFormData({ ...formData, exam_description: e.target.value })}
                placeholder={t.placeholders.examDesc}
              />
              {formErrors.exam_description && (
                <p className="text-sm text-red-500">{formErrors.exam_description}</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Incident Details */}
          <div>
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t.incidentDetails}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">{t.categoryLabel}</Label>
                {categoriesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.category_id.toString()}
                    onValueChange={(value) => setFormData({ ...formData, category_id: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.selectCategory} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.color_code || '#3b82f6' }}
                            />
                            {language === 'ms' ? category.nama : category.nama_english}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {formErrors.category_id && (
                  <p className="text-sm text-red-500">{formErrors.category_id}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subcategory">{t.subcategoryLabel}</Label>
                <Input
                  id="subcategory"
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  placeholder={t.placeholders.subcategory}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="incident_date">{t.incidentDateLabel}</Label>
                <Input
                  id="incident_date"
                  type="date"
                  value={formData.incident_date}
                  onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })}
                />
                {formErrors.incident_date && (
                  <p className="text-sm text-red-500">{formErrors.incident_date}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="severity">{t.severityLabel}</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) => setFormData({ ...formData, severity: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectSeverity} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(t.severities).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          {getSeverityBadge(key)}
                          <div>
                            <div>{label}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.severityDescriptions[key as keyof typeof t.severityDescriptions]}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.severity && (
                  <p className="text-sm text-red-500">{formErrors.severity}</p>
                )}
              </div>
            </div>
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reason_detail">{t.reasonDetailLabel}</Label>
                <Textarea
                  id="reason_detail"
                  value={formData.reason_detail}
                  onChange={(e) => setFormData({ ...formData, reason_detail: e.target.value })}
                  placeholder={t.placeholders.reasonDetail}
                  rows={4}
                />
                {formErrors.reason_detail && (
                  <p className="text-sm text-red-500">{formErrors.reason_detail}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reason_detail_english">{t.reasonDetailEnglishLabel}</Label>
                <Textarea
                  id="reason_detail_english"
                  value={formData.reason_detail_english}
                  onChange={(e) => setFormData({ ...formData, reason_detail_english: e.target.value })}
                  placeholder={t.placeholders.reasonDetailEnglish}
                  rows={4}
                />
                {formErrors.reason_detail_english && (
                  <p className="text-sm text-red-500">{formErrors.reason_detail_english}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Retake Information */}
          <div>
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Retake Information
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="retake_performed"
                    checked={formData.retake_performed}
                    onCheckedChange={(checked) => setFormData({ 
                      ...formData, 
                      retake_performed: checked,
                      retake_date: checked ? formData.retake_date : ''
                    })}
                  />
                  <Label htmlFor="retake_performed">{t.retakePerformedLabel}</Label>
                </div>
              </div>
              
              {formData.retake_performed && (
                <div className="space-y-2">
                  <Label htmlFor="retake_date">{t.retakeDateLabel}</Label>
                  <Input
                    id="retake_date"
                    type="date"
                    value={formData.retake_date}
                    onChange={(e) => setFormData({ ...formData, retake_date: e.target.value })}
                  />
                  {formErrors.retake_date && (
                    <p className="text-sm text-red-500">{formErrors.retake_date}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Follow-up Actions */}
          <div>
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {t.followUp}
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="follow_up_required"
                  checked={formData.follow_up_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, follow_up_required: checked })}
                />
                <Label htmlFor="follow_up_required">{t.followUpRequiredLabel}</Label>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corrective_action">{t.correctiveActionLabel}</Label>
                  <Textarea
                    id="corrective_action"
                    value={formData.corrective_action}
                    onChange={(e) => setFormData({ ...formData, corrective_action: e.target.value })}
                    placeholder={t.placeholders.correctiveAction}
                    rows={4}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="corrective_action_english">{t.correctiveActionEnglishLabel}</Label>
                  <Textarea
                    id="corrective_action_english"
                    value={formData.corrective_action_english}
                    onChange={(e) => setFormData({ ...formData, corrective_action_english: e.target.value })}
                    placeholder={t.placeholders.correctiveActionEnglish}
                    rows={4}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                {t.cancel}
              </Button>
            )}
            
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? t.saving : t.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}