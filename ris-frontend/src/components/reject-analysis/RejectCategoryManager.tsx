'use client';

import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import Swal from 'sweetalert2';
import {
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Folder,
  FileText
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Language } from '@/types/reject-analysis';
import rejectAnalysisApi from '@/lib/reject-analysis-api';

// Define proper types for the Django models
interface RejectCategory {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  order: number;
  reasons: RejectReason[];
  reasons_count: number;
  created: string;
  modified: string;
}

interface RejectReason {
  id: number;
  reason: string;
  description?: string;
  is_active: boolean;
  qap_code?: string;
  severity_level: string;
  severity_level_display: string;
  category: number;
  category_name: string;
  order: number;
  created: string;
  modified: string;
}

interface CategoryFormData {
  name: string;
  description?: string;
  is_active: boolean;
}

interface ReasonFormData {
  reason: string;
  description?: string;
  is_active: boolean;
  qap_code?: string;
  severity_level: string;
  category: number;
}

interface RejectCategoryManagerProps {
  language?: Language;
}

const translations = {
  en: {
    title: 'Reject Analysis Categories & Reasons',
    subtitle: 'Manage main categories (Human Faults, Equipment, etc.) and their reasons',
    addCategory: 'Add New Category',
    addReason: 'Add New Reason',
    editCategory: 'Edit Category',
    editReason: 'Edit Reason',
    deleteCategory: 'Delete Category', 
    deleteReason: 'Delete Reason',
    categoryName: 'Category Name',
    description: 'Description',
    reasonName: 'Reason Name',
    qapCode: 'QAP Code',
    severityLevel: 'Severity Level',
    active: 'Active',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirmDeleteCategory: 'Are you sure you want to delete this category?',
    confirmDeleteReason: 'Are you sure you want to delete this reason?',
    confirmDeleteDesc: 'This action cannot be undone.',
    loading: 'Loading categories...',
    noCategories: 'No categories found',
    noReasons: 'No reasons in this category',
    error: 'Error loading categories',
    reasons: 'reasons',
    // Note: categories ARE the main types now
    severityLevels: {
      LOW: 'Low Impact',
      MEDIUM: 'Medium Impact', 
      HIGH: 'High Impact',
      CRITICAL: 'Critical - Immediate Action Required'
    }
  },
  ms: {
    title: 'Pengurusan Kategori & Sebab Penolakan',
    subtitle: 'Urus kategori penolakan dan sebab yang berkaitan',
    addCategory: 'Tambah Kategori Baru',
    addReason: 'Tambah Sebab Baru',
    editCategory: 'Edit Kategori',
    editReason: 'Edit Sebab',
    deleteCategory: 'Padam Kategori',
    deleteReason: 'Padam Sebab',
    categoryName: 'Nama Kategori',
    description: 'Keterangan',
    reasonName: 'Nama Sebab',
    qapCode: 'Kod QAP',
    severityLevel: 'Tahap Keterukan',
    active: 'Aktif',
    save: 'Simpan',
    cancel: 'Batal',
    delete: 'Padam',
    confirmDeleteCategory: 'Adakah anda pasti ingin memadam kategori ini?',
    confirmDeleteReason: 'Adakah anda pasti ingin memadam sebab ini?',
    confirmDeleteDesc: 'Tindakan ini tidak boleh dibuat asal.',
    loading: 'Memuatkan kategori...',
    noCategories: 'Tiada kategori dijumpai',
    noReasons: 'Tiada sebab dalam kategori ini',
    error: 'Ralat memuatkan kategori',
    reasons: 'sebab',
    // Note: categories ARE the main types now
    severityLevels: {
      LOW: 'Kesan Rendah',
      MEDIUM: 'Kesan Sederhana',
      HIGH: 'Kesan Tinggi', 
      CRITICAL: 'Kritikal - Tindakan Segera Diperlukan'
    }
  }
};

// Memoized Category Item to prevent unnecessary re-renders
const CategoryItem = memo(({ 
  category, 
  index, 
  draggedItem, 
  draggedReason,
  openCategories,
  t,
  onDragStart,
  onDragOver, 
  onDrop,
  onToggleCategory,
  onAddReason,
  onEditCategory,
  onDeleteCategory,
  onEditReason,
  onReasonDragStart,
  onReasonDragOver,
  onReasonDrop
}: {
  category: RejectCategory;
  index: number;
  draggedItem: number | null;
  draggedReason: number | null;
  openCategories: Record<number, boolean>;
  t: any;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, dropIndex: number) => void;
  onToggleCategory: (categoryId: number) => void;
  onAddReason: (categoryId: number) => void;
  onEditCategory: (category: RejectCategory) => void;
  onDeleteCategory: (category: RejectCategory) => void;
  onEditReason: (reason: RejectReason) => void;
  onReasonDragStart: (e: React.DragEvent, categoryId: number, reasonIndex: number) => void;
  onReasonDragOver: (e: React.DragEvent) => void;
  onReasonDrop: (e: React.DragEvent, categoryId: number, dropIndex: number) => void;
}) => {
  return (
    <div 
      className={`border rounded-lg cursor-move hover:bg-muted transition-colors ${
        draggedItem === index ? 'opacity-50' : ''
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
    >
      <Collapsible 
        open={openCategories[category.id]} 
        onOpenChange={() => onToggleCategory(category.id)}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <GripVertical className="h-5 w-5 text-gray-400" />
            
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {openCategories[category.id] ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            
            <Folder className="h-5 w-5 text-blue-500" />
            
            <div>
              <div className="font-medium">{category.name}</div>
              <div className="text-sm text-muted-foreground">
                {category.reasons_count} {t.reasons}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge 
              variant={category.is_active ? "default" : "secondary"}
              className={`${category.is_active ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}
            >
              {category.is_active ? (
                <Eye className="h-3 w-3 mr-1" />
              ) : (
                <EyeOff className="h-3 w-3 mr-1" />
              )}
              {category.is_active ? 'Active' : 'Inactive'}
            </Badge>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddReason(category.id)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Reason
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditCategory(category)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onDeleteCategory(category)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
        
        <CollapsibleContent>
          <div className="px-4 pb-4 pl-16">
            {category.reasons.length === 0 ? (
              <div className="text-center text-muted-foreground py-4 text-sm">
                {t.noReasons}
              </div>
            ) : (
              <div className="space-y-2">
                {category.reasons.map((reason, reasonIndex) => (
                  <ReasonItem
                    key={reason.id}
                    reason={reason}
                    reasonIndex={reasonIndex}
                    categoryId={category.id}
                    draggedReason={draggedReason}
                    onEditReason={onEditReason}
                    onReasonDragStart={onReasonDragStart}
                    onReasonDragOver={onReasonDragOver}
                    onReasonDrop={onReasonDrop}
                  />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

// Memoized Reason Item
const ReasonItem = memo(({
  reason,
  reasonIndex,
  categoryId,
  draggedReason,
  onEditReason,
  onReasonDragStart,
  onReasonDragOver,
  onReasonDrop
}: {
  reason: RejectReason;
  reasonIndex: number;
  categoryId: number;
  draggedReason: number | null;
  onEditReason: (reason: RejectReason) => void;
  onReasonDragStart: (e: React.DragEvent, categoryId: number, reasonIndex: number) => void;
  onReasonDragOver: (e: React.DragEvent) => void;
  onReasonDrop: (e: React.DragEvent, categoryId: number, dropIndex: number) => void;
}) => {
  return (
    <div 
      className={`flex items-center justify-between p-3 bg-muted/50 rounded cursor-move hover:bg-muted transition-colors ${
        draggedReason === reasonIndex ? 'opacity-50' : ''
      }`}
      draggable
      onDragStart={(e) => onReasonDragStart(e, categoryId, reasonIndex)}
      onDragOver={onReasonDragOver}
      onDrop={(e) => onReasonDrop(e, categoryId, reasonIndex)}
    >
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-gray-400" />
        <FileText className="h-4 w-4 text-green-500" />
        <div>
          <div className="font-medium text-sm">{reason.reason}</div>
          {reason.qap_code && (
            <div className="text-xs text-muted-foreground">
              QAP: {reason.qap_code}
            </div>
          )}
          {reason.description && reason.description.trim() && (
            <div className="text-xs text-muted-foreground italic mt-1">
              {reason.description.length > 60 
                ? `${reason.description.substring(0, 60)}...` 
                : reason.description
              }
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge 
          variant={
            reason.severity_level === 'CRITICAL' ? 'destructive' :
            reason.severity_level === 'HIGH' ? 'default' :
            reason.severity_level === 'MEDIUM' ? 'secondary' :
            'outline'
          }
          className={`text-xs pointer-events-none ${
            reason.severity_level === 'CRITICAL' ? 'bg-red-500 text-white' :
            reason.severity_level === 'HIGH' ? 'bg-orange-500 text-white' :
            reason.severity_level === 'MEDIUM' ? 'bg-yellow-500 text-black' :
            'bg-green-100 text-green-800'
          }`}
        >
          {reason.severity_level === 'CRITICAL' ? 'Critical' :
           reason.severity_level === 'HIGH' ? 'High' :
           reason.severity_level === 'MEDIUM' ? 'Medium' :
           'Low'
          }
        </Badge>
        
        <Badge 
          variant={reason.is_active ? "default" : "secondary"} 
          className={`text-xs pointer-events-none ${reason.is_active ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}
        >
          {reason.is_active ? 'Active' : 'Inactive'}
        </Badge>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEditReason(reason)}
        >
          <Edit className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});

export default function RejectCategoryManager({ language = 'en' }: RejectCategoryManagerProps) {
  const t = translations[language];
  
  const [categories, setCategories] = useState<RejectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<RejectCategory | null>(null);
  const [editingReason, setEditingReason] = useState<RejectReason | null>(null);
  const [selectedCategoryForReason, setSelectedCategoryForReason] = useState<number | null>(null);
  
  // Form states
  const [categoryFormData, setCategoryFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    is_active: true
  });
  
  const [reasonFormData, setReasonFormData] = useState<ReasonFormData>({
    reason: '',
    description: '',
    is_active: true,
    qap_code: '',
    severity_level: 'MEDIUM',
    category: 0
  });

  // Collapsible states for each category
  const [openCategories, setOpenCategories] = useState<Record<number, boolean>>({});
  
  // Drag and drop states
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [draggedReason, setDraggedReason] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await rejectAnalysisApi.categories.getCategories({ ordering: 'order,name' });
      const categoriesData = data.results || data;
      
      setCategories(categoriesData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Update refs when form data changes (for editing)
  useEffect(() => {
    if (categoryNameRef.current) {
      categoryNameRef.current.value = categoryFormData.name;
    }
    if (categoryDescRef.current) {
      categoryDescRef.current.value = categoryFormData.description || '';
    }
  }, [categoryFormData]);

  useEffect(() => {
    if (reasonNameRef.current) {
      reasonNameRef.current.value = reasonFormData.reason;
    }
    if (reasonDescRef.current) {
      reasonDescRef.current.value = reasonFormData.description || '';
    }
    if (reasonQapRef.current) {
      reasonQapRef.current.value = reasonFormData.qap_code || '';
    }
  }, [reasonFormData]);

  // Form refs for uncontrolled inputs
  const categoryNameRef = useRef<HTMLInputElement>(null);
  const categoryDescRef = useRef<HTMLTextAreaElement>(null);
  const reasonNameRef = useRef<HTMLInputElement>(null);
  const reasonDescRef = useRef<HTMLTextAreaElement>(null);
  const reasonQapRef = useRef<HTMLInputElement>(null);

  // Category management
  const handleAddCategory = useCallback(() => {
    setCategoryFormData({
      name: '',
      description: '',
      is_active: true
    });
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  }, []);

  const handleEditCategory = useCallback((category: RejectCategory) => {
    setCategoryFormData({
      name: category.name,
      description: category.description || '',
      is_active: category.is_active
    });
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  }, []);

  const handleSaveCategory = async () => {
    const name = categoryNameRef.current?.value.trim() || '';
    const description = categoryDescRef.current?.value || '';
    
    if (!name) {
      toast.error('Please fill in all required fields');
      return;
    }

    const formData = {
      name,
      description,
      is_active: categoryFormData.is_active
    };

    try {
      setSaving(true);

      if (editingCategory) {
        const updatedCategory = await rejectAnalysisApi.categories.updateCategory(editingCategory.id, formData);
        // Update the category in state
        setCategories(prev => prev.map(cat => 
          cat.id === editingCategory.id 
            ? { ...cat, ...updatedCategory, reasons: cat.reasons } 
            : cat
        ));
      } else {
        const newCategory = await rejectAnalysisApi.categories.createCategory(formData);
        // Add new category to state
        setCategories(prev => [...prev, { ...newCategory, reasons: [], reasons_count: 0 }]);
      }

      setCategoryDialogOpen(false);
    } catch (err) {
      console.error('Error saving category:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category: RejectCategory) => {
    const result = await Swal.fire({
      title: t.confirmDeleteCategory,
      text: t.confirmDeleteDesc,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: t.delete,
      cancelButtonText: t.cancel,
      reverseButtons: true
    });

    if (result.isConfirmed) {
      try {
        await rejectAnalysisApi.categories.deleteCategory(category.id);
        setCategories(prev => prev.filter(cat => cat.id !== category.id));
      } catch (err) {
        console.error('Error deleting category:', err);
      }
    }
  };

  // Reason management  
  const handleAddReason = (categoryId: number) => {
    setReasonFormData({
      reason: '',
      description: '',
      is_active: true,
      qap_code: '',
      severity_level: 'MEDIUM',
      category: categoryId
    });
    setSelectedCategoryForReason(categoryId);
    setEditingReason(null);
    setReasonDialogOpen(true);
  };

  const handleEditReason = (reason: RejectReason) => {
    setReasonFormData({
      reason: reason.reason,
      description: reason.description || '',
      is_active: reason.is_active,
      qap_code: reason.qap_code || '',
      severity_level: reason.severity_level,
      category: reason.category
    });
    setEditingReason(reason);
    setReasonDialogOpen(true);
  };

  const handleSaveReason = async () => {
    const reason = reasonNameRef.current?.value.trim() || '';
    const description = reasonDescRef.current?.value || '';
    const qap_code = reasonQapRef.current?.value || '';
    
    if (!reason) {
      toast.error('Please fill in all required fields');
      return;
    }

    const formData = {
      reason,
      description,
      qap_code,
      is_active: reasonFormData.is_active,
      severity_level: reasonFormData.severity_level,
      category: reasonFormData.category
    };

    try {
      setSaving(true);

      if (editingReason) {
        // Update existing reason
        const updatedReason = await rejectAnalysisApi.reasons.updateReason(editingReason.id, formData);
        setCategories(prev => prev.map(cat => ({
          ...cat,
          reasons: cat.reasons.map(r => 
            r.id === editingReason.id ? updatedReason : r
          )
        })));
      } else {
        // Create new reason
        const newReason = await rejectAnalysisApi.reasons.createReason(formData);
        setCategories(prev => prev.map(cat => 
          cat.id === formData.category 
            ? { 
                ...cat, 
                reasons: [...cat.reasons, newReason],
                reasons_count: cat.reasons_count + 1
              }
            : cat
        ));
      }

      setReasonDialogOpen(false);
    } catch (err) {
      console.error('Error saving reason:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (categoryId: number) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Drag and drop handlers for categories
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedItem === null || draggedItem === dropIndex) {
      setDraggedItem(null);
      return;
    }

    const newCategories = [...categories];
    const draggedCategory = newCategories[draggedItem];
    
    // Remove dragged item and insert at new position
    newCategories.splice(draggedItem, 1);
    newCategories.splice(dropIndex, 0, draggedCategory);
    
    // Update positions
    const reorderedCategories = newCategories.map((cat, index) => ({
      ...cat,
      order: index + 1
    }));

    setCategories(reorderedCategories);
    setDraggedItem(null);

    try {
      // Send reorder request to backend
      await rejectAnalysisApi.categories.reorderCategories(
        reorderedCategories.map(cat => ({
          id: cat.id,
          position: cat.order
        }))
      );
    } catch (err) {
      // Revert on error
      loadCategories();
      console.error('Error reordering categories:', err);
    }
  };

  // Drag and drop handlers for reasons
  const handleReasonDragStart = (e: React.DragEvent, categoryId: number, reasonIndex: number) => {
    setDraggedReason(reasonIndex);
    e.dataTransfer.setData('categoryId', categoryId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleReasonDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleReasonDrop = async (e: React.DragEvent, categoryId: number, dropIndex: number) => {
    e.preventDefault();
    
    const sourceCategoryId = parseInt(e.dataTransfer.getData('categoryId'));
    
    if (draggedReason === null || draggedReason === dropIndex || sourceCategoryId !== categoryId) {
      setDraggedReason(null);
      return;
    }

    // Find the category and update its reasons
    const updatedCategories = categories.map(cat => {
      if (cat.id === categoryId) {
        const newReasons = [...cat.reasons];
        const draggedReasonItem = newReasons[draggedReason];
        
        // Remove dragged item and insert at new position
        newReasons.splice(draggedReason, 1);
        newReasons.splice(dropIndex, 0, draggedReasonItem);
        
        // Update positions
        const reorderedReasons = newReasons.map((reason, index) => ({
          ...reason,
          order: index + 1
        }));

        return {
          ...cat,
          reasons: reorderedReasons
        };
      }
      return cat;
    });

    setCategories(updatedCategories);
    setDraggedReason(null);

    try {
      // Send reorder request to backend for reasons
      const category = updatedCategories.find(cat => cat.id === categoryId);
      if (category) {
        await rejectAnalysisApi.categories.reorderReasons(
          categoryId,
          category.reasons.map(r => ({ id: r.id, position: r.order }))
        );
      }
    } catch (err) {
      // Revert on error
      loadCategories();
      console.error('Error reordering reasons:', err);
    }
  };

  // Categories are the main categories, reasons are the items in each category

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.subtitle}</CardDescription>
        </div>
        
        <Button onClick={handleAddCategory}>
          <Plus className="h-4 w-4 mr-2" />
          {t.addCategory}
        </Button>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="text-red-500 text-center py-4">{error}</div>
        )}
        
        {categories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {t.noCategories}
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category, index) => (
              <CategoryItem
                key={category.id}
                category={category}
                index={index}
                draggedItem={draggedItem}
                draggedReason={draggedReason}
                openCategories={openCategories}
                t={t}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onToggleCategory={toggleCategory}
                onAddReason={handleAddReason}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                onEditReason={handleEditReason}
                onReasonDragStart={handleReasonDragStart}
                onReasonDragOver={handleReasonDragOver}
                onReasonDrop={handleReasonDrop}
              />
            ))}
          </div>
        )}
      </CardContent>
      
      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? t.editCategory : t.addCategory}
            </DialogTitle>
            <DialogDescription>
              {editingCategory 
                ? 'Modify the category details below'
                : 'Add a new reject category to the system'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">{t.categoryName}</Label>
              <Input
                id="category-name"
                ref={categoryNameRef}
                defaultValue={categoryFormData.name}
                placeholder="e.g., Human Faults, Equipment, Processing, Others"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category-description">{t.description}</Label>
              <Textarea
                id="category-description"
                ref={categoryDescRef}
                defaultValue={categoryFormData.description}
                placeholder="Detailed description of this category..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category-active">{t.active}</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="category-active"
                  checked={categoryFormData.is_active}
                  onCheckedChange={(checked) => setCategoryFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <span className="text-sm text-muted-foreground">
                  {categoryFormData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              {t.cancel}
            </Button>
            <Button onClick={handleSaveCategory} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reason Dialog */}
      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingReason ? t.editReason : t.addReason}
            </DialogTitle>
            <DialogDescription>
              {editingReason 
                ? 'Modify the reason details below'
                : 'Add a new reason to the selected category'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason-name">{t.reasonName}</Label>
              <Input
                id="reason-name"
                ref={reasonNameRef}
                defaultValue={reasonFormData.reason}
                placeholder="e.g., Over Exposure"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qap-code">{t.qapCode}</Label>
                <Input
                  id="qap-code"
                  ref={reasonQapRef}
                  defaultValue={reasonFormData.qap_code}
                  placeholder="e.g., HF-EXP-01"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="severity-level">{t.severityLevel}</Label>
                <Select 
                  value={reasonFormData.severity_level}
                  onValueChange={(value) => setReasonFormData(prev => ({ ...prev, severity_level: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low Impact</SelectItem>
                    <SelectItem value="MEDIUM">Medium Impact</SelectItem>
                    <SelectItem value="HIGH">High Impact</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reason-description">{t.description}</Label>
              <Textarea
                id="reason-description"
                ref={reasonDescRef}
                defaultValue={reasonFormData.description}
                placeholder="Detailed description of this reason..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reason-active">{t.active}</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="reason-active"
                  checked={reasonFormData.is_active}
                  onCheckedChange={(checked) => setReasonFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <span className="text-sm text-muted-foreground">
                  {reasonFormData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              {t.cancel}
            </Button>
            <Button onClick={handleSaveReason} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}