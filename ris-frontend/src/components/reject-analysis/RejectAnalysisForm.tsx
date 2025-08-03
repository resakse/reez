'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Save, ArrowLeft, Calculator, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import {
  MonthlyRejectAnalysis,
  MonthlyAnalysisFormData,
  RejectStatistics,
  Language,
  DEFAULT_TARGET_RATES
} from '@/types/reject-analysis';
import rejectAnalysisApi from '@/lib/reject-analysis-api';

interface RejectAnalysisFormProps {
  analysisId?: number;
  language?: Language;
  onSave?: (analysis: MonthlyRejectAnalysis) => void;
  onCancel?: () => void;
}

const translations = {
  en: {
    title: 'Monthly Reject Analysis',
    editTitle: 'Edit Monthly Analysis',
    createTitle: 'Create Monthly Analysis',
    subtitle: 'Analyze and document monthly image reject statistics',
    basicInfo: 'Basic Information',
    statistics: 'Current Statistics',
    analysis: 'Analysis & Notes',
    yearLabel: 'Year',
    monthLabel: 'Month',
    targetRateLabel: 'Target Reject Rate (%)',
    statusLabel: 'Status',
    analysisNotesLabel: 'Analysis Notes (Bahasa Malaysia)',
    analysisNotesEnglishLabel: 'Analysis Notes (English)',
    actionItemsLabel: 'Action Items (Bahasa Malaysia)',
    actionItemsEnglishLabel: 'Action Items (English)',
    currentStats: 'Current Month Statistics',
    totalExams: 'Total Examinations',
    totalRejects: 'Total Rejects',
    rejectRate: 'Reject Rate',
    target: 'Target',
    meetsTarget: 'Meets Target',
    aboveTarget: 'Above Target',
    improvementRate: 'Month-over-Month Change',
    categoryBreakdown: 'Category Breakdown',
    modalityBreakdown: 'Modality Breakdown',
    save: 'Save Analysis',
    saveDraft: 'Save as Draft',
    cancel: 'Cancel',
    loading: 'Loading analysis...',
    loadingStats: 'Loading statistics...',
    saving: 'Saving...',
    error: 'Error loading data',
    noData: 'No data available for the selected month',
    autoCalculated: 'Auto-calculated from incident data',
    validation: {
      yearRequired: 'Year is required',
      monthRequired: 'Month is required',
      targetRateRequired: 'Target reject rate is required',
      targetRateInvalid: 'Target reject rate must be between 0.1% and 10%',
    },
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ],
    statuses: {
      DRAFT: 'Draft',
      COMPLETED: 'Completed',
      APPROVED: 'Approved'
    },
    draft: 'Draft',
    completed: 'Completed',
    approved: 'Approved',
  },
  ms: {
    title: 'Analisis Penolakan Bulanan',
    editTitle: 'Edit Analisis Bulanan',
    createTitle: 'Cipta Analisis Bulanan',
    subtitle: 'Analisis dan dokumentasi statistik penolakan imej bulanan',
    basicInfo: 'Maklumat Asas',
    statistics: 'Statistik Semasa',
    analysis: 'Analisis & Nota',
    yearLabel: 'Tahun',
    monthLabel: 'Bulan',
    targetRateLabel: 'Kadar Sasaran Penolakan (%)',
    statusLabel: 'Status',
    analysisNotesLabel: 'Nota Analisis (Bahasa Malaysia)',
    analysisNotesEnglishLabel: 'Nota Analisis (English)',
    actionItemsLabel: 'Item Tindakan (Bahasa Malaysia)',
    actionItemsEnglishLabel: 'Item Tindakan (English)',
    currentStats: 'Statistik Bulan Semasa',
    totalExams: 'Jumlah Pemeriksaan',
    totalRejects: 'Jumlah Penolakan',
    rejectRate: 'Kadar Penolakan',
    target: 'Sasaran',
    meetsTarget: 'Mencapai Sasaran',
    aboveTarget: 'Melebihi Sasaran',
    improvementRate: 'Perubahan Bulan ke Bulan',
    categoryBreakdown: 'Pecahan Kategori',
    modalityBreakdown: 'Pecahan Modaliti',
    save: 'Simpan Analisis',
    saveDraft: 'Simpan sebagai Draf',
    cancel: 'Batal',
    loading: 'Memuatkan analisis...',
    loadingStats: 'Memuatkan statistik...',
    saving: 'Menyimpan...',
    error: 'Ralat memuatkan data',
    noData: 'Tiada data tersedia untuk bulan yang dipilih',
    autoCalculated: 'Auto-kira dari data insiden',
    validation: {
      yearRequired: 'Tahun diperlukan',
      monthRequired: 'Bulan diperlukan',
      targetRateRequired: 'Kadar sasaran penolakan diperlukan',
      targetRateInvalid: 'Kadar sasaran penolakan mestilah antara 0.1% dan 10%',
    },
    months: [
      'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
      'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
    ],
    statuses: {
      DRAFT: 'Draf',
      COMPLETED: 'Selesai',
      APPROVED: 'Diluluskan'
    },
    draft: 'Draf',
    completed: 'Selesai',
    approved: 'Diluluskan',
  }
};

export default function RejectAnalysisForm({
  analysisId,
  language = 'en',
  onSave,
  onCancel
}: RejectAnalysisFormProps) {
  const t = translations[language];
  
  const [analysis, setAnalysis] = useState<MonthlyRejectAnalysis | null>(null);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(!!analysisId);
  const [statsLoading, setStatsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<MonthlyAnalysisFormData>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    target_reject_rate: DEFAULT_TARGET_RATES.OVERALL,
    status: 'DRAFT',
    analysis_notes: '',
    analysis_notes_english: '',
    action_items: '',
    action_items_english: ''
  });

  const [formErrors, setFormErrors] = useState<Partial<Record<keyof MonthlyAnalysisFormData, string>>>({});

  useEffect(() => {
    if (analysisId) {
      loadAnalysis();
    }
  }, [analysisId]);

  useEffect(() => {
    if (formData.year && formData.month) {
      loadMonthStatistics();
    }
  }, [formData.year, formData.month]);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await rejectAnalysisApi.monthly.getAnalysis(analysisId!);
      setAnalysis(data);
      
      // Populate form with existing data
      setFormData({
        year: data.year,
        month: data.month,
        target_reject_rate: data.target_reject_rate,
        status: data.status,
        analysis_notes: data.analysis_notes || '',
        analysis_notes_english: data.analysis_notes_english || '',
        action_items: data.action_items || '',
        action_items_english: data.action_items_english || ''
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthStatistics = async () => {
    try {
      setStatsLoading(true);

      // Note: This endpoint might need adjustment in the API service to accept year/month params
      const data = await rejectAnalysisApi.statistics.getStatistics();
      setStatistics(data);
    } catch (err) {
      console.error('Error loading statistics:', err);
      setStatistics(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof MonthlyAnalysisFormData, string>> = {};

    if (!formData.year) {
      errors.year = t.validation.yearRequired;
    }

    if (!formData.month) {
      errors.month = t.validation.monthRequired;
    }

    if (!formData.target_reject_rate) {
      errors.target_reject_rate = t.validation.targetRateRequired;
    } else if (formData.target_reject_rate < 0.1 || formData.target_reject_rate > 10) {
      errors.target_reject_rate = t.validation.targetRateInvalid;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (saveStatus: 'DRAFT' | 'COMPLETED' = 'COMPLETED') => {
    if (!validateForm()) return;

    try {
      setSaving(true);

      const submitData = {
        ...formData,
        status: saveStatus
      };

      const savedAnalysis = analysisId
        ? await rejectAnalysisApi.monthly.updateAnalysis(analysisId, submitData)
        : await rejectAnalysisApi.monthly.createAnalysis(submitData);

      if (onSave) {
        onSave(savedAnalysis);
      }

    } catch (err) {
      // Error handling is already done in the API service
      console.error('Error saving analysis:', err);
    } finally {
      setSaving(false);
    }
  };

  const getTargetBadge = (actualRate: number, targetRate: number) => {
    const meetsTarget = actualRate <= targetRate;
    return (
      <Badge variant={meetsTarget ? "default" : "destructive"}>
        {meetsTarget ? t.meetsTarget : t.aboveTarget}
      </Badge>
    );
  };

  const getImprovementIndicator = (rate?: number) => {
    if (!rate) return null;
    
    const isImprovement = rate < 0; // Negative rate means improvement (lower reject rate)
    return (
      <div className={`flex items-center gap-1 text-sm ${isImprovement ? 'text-green-600' : 'text-red-600'}`}>
        {isImprovement ? (
          <TrendingDown className="h-4 w-4" />
        ) : (
          <TrendingUp className="h-4 w-4" />
        )}
        <span>{Math.abs(rate).toFixed(1)}%</span>
      </div>
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
            {Array.from({ length: 4 }).map((_, i) => (
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
                {analysisId ? t.editTitle : t.createTitle}
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
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-medium mb-4">{t.basicInfo}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">{t.yearLabel}</Label>
                <Select
                  value={formData.year.toString()}
                  onValueChange={(value) => setFormData({ ...formData, year: parseInt(value) })}
                  disabled={!!analysisId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.year && (
                  <p className="text-sm text-red-500">{formErrors.year}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="month">{t.monthLabel}</Label>
                <Select
                  value={formData.month.toString()}
                  onValueChange={(value) => setFormData({ ...formData, month: parseInt(value) })}
                  disabled={!!analysisId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {t.months.map((month, index) => (
                      <SelectItem key={index + 1} value={(index + 1).toString()}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.month && (
                  <p className="text-sm text-red-500">{formErrors.month}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="target_rate">{t.targetRateLabel}</Label>
                <Input
                  id="target_rate"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={formData.target_reject_rate}
                  onChange={(e) => setFormData({ ...formData, target_reject_rate: parseFloat(e.target.value) })}
                />
                {formErrors.target_reject_rate && (
                  <p className="text-sm text-red-500">{formErrors.target_reject_rate}</p>
                )}
              </div>
            </div>
            
            <div className="mt-4">
              <Label htmlFor="status">{t.statusLabel}</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as any })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">{t.statuses.DRAFT}</SelectItem>
                  <SelectItem value="COMPLETED">{t.statuses.COMPLETED}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Statistics Section */}
          <div>
            <h3 className="text-lg font-medium mb-4">{t.statistics}</h3>
            
            {statsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : statistics ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">{t.totalExams}</div>
                    <div className="text-2xl font-bold">{statistics.total_examinations?.toLocaleString() || 0}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">{t.totalRejects}</div>
                    <div className="text-2xl font-bold">{statistics.total_rejects?.toLocaleString() || 0}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">{t.rejectRate}</div>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-bold">
                        {statistics.reject_rate?.toFixed(2) || '0.00'}%
                      </div>
                      {getTargetBadge(statistics.reject_rate || 0, formData.target_reject_rate)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">{t.improvementRate}</div>
                    <div className="text-2xl font-bold">
                      {getImprovementIndicator(statistics.improvement_rate)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                {t.noData}
              </div>
            )}
            
            <p className="text-sm text-muted-foreground mt-2">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {t.autoCalculated}
            </p>
          </div>

          <Separator />

          {/* Analysis & Notes */}
          <div>
            <h3 className="text-lg font-medium mb-4">{t.analysis}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="analysis_notes">{t.analysisNotesLabel}</Label>
                <Textarea
                  id="analysis_notes"
                  value={formData.analysis_notes}
                  onChange={(e) => setFormData({ ...formData, analysis_notes: e.target.value })}
                  placeholder="Analisis terperinci mengenai kadar penolakan bulan ini..."
                  rows={6}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="analysis_notes_english">{t.analysisNotesEnglishLabel}</Label>
                <Textarea
                  id="analysis_notes_english"
                  value={formData.analysis_notes_english}
                  onChange={(e) => setFormData({ ...formData, analysis_notes_english: e.target.value })}
                  placeholder="Detailed analysis of this month's reject rates..."
                  rows={6}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="action_items">{t.actionItemsLabel}</Label>
                <Textarea
                  id="action_items"
                  value={formData.action_items}
                  onChange={(e) => setFormData({ ...formData, action_items: e.target.value })}
                  placeholder="Tindakan yang perlu diambil untuk mengurangkan kadar penolakan..."
                  rows={6}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="action_items_english">{t.actionItemsEnglishLabel}</Label>
                <Textarea
                  id="action_items_english"
                  value={formData.action_items_english}
                  onChange={(e) => setFormData({ ...formData, action_items_english: e.target.value })}
                  placeholder="Actions needed to reduce reject rates..."
                  rows={6}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave('DRAFT')}
              disabled={saving}
            >
              {saving ? t.saving : t.saveDraft}
            </Button>
            
            <Button
              onClick={() => handleSave('COMPLETED')}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? t.saving : t.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}