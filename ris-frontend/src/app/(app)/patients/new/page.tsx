'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AuthService from '@/lib/auth';
import { parseNric, formatNric, type NricInfo } from '@/lib/nric';
import { ArrowLeft, User, Calendar, MapPin, Phone, Mail } from 'lucide-react';
import Link from 'next/link';

interface Ward {
  id: number;
  nama: string;
}

export default function NewPatientPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [wards, setWards] = useState<Ward[]>([]);
    
    const [formData, setFormData] = useState({
        nama: '',
        no_kp: '',
        t_lahir: '',
        jantina: '',
        umur: '',
        alamat: '',
        telefon: '',
        email: '',
        wad: '',
        bangsa: 'Melayu',
        mrn: ''
    });
    
    const [nricInfo, setNricInfo] = useState<NricInfo | null>(null);
    const [nricError, setNricError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchWards();
    }, [user]);

    const fetchWards = async () => {
        try {
            const res = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/wards/`);
            if (res.ok) {
                const data = await res.json();
                setWards(data);
            }
        } catch (error) {
            console.error('Error fetching wards:', error);
        }
    };

    const handleNricChange = (value: string) => {
        const formatted = formatNric(value);
        setFormData(prev => ({ ...prev, no_kp: formatted }));
        
        if (value.trim()) {
            const info = parseNric(value);
            setNricInfo(info);
            
            if (info.isValid) {
                setNricError('');
                if (info.dateOfBirth) {
                    setFormData(prev => ({ 
                        ...prev, 
                        t_lahir: info.dateOfBirth!,
                        jantina: info.gender === 'male' ? 'L' : 'P',
                        umur: info.age?.toString() || ''
                    }));
                }
            } else {
                setNricError(info.error || 'Invalid NRIC format');
            }
        } else {
            setNricInfo(null);
            setNricError('');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleSelectChange = (id: string, value: string) => {
        setFormData({ ...formData, [id]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const payload = {
                nama: formData.nama,
                no_kp: formData.no_kp.replace(/[-\s]/g, ''),
                t_lahir: formData.t_lahir,
                jantina: formData.jantina,
                umur: parseInt(formData.umur) || null,
                alamat: formData.alamat,
                telefon: formData.telefon,
                email: formData.email,
                wad: formData.wad ? parseInt(formData.wad) : null,
                bangsa: formData.bangsa,
                mrn: formData.mrn || null
            };

            const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = Object.values(errorData).flat().join(' ');
                throw new Error(errorMessage || 'Failed to create patient');
            }

            const newPatient = await response.json();
            router.push(`/patients/${newPatient.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">New Patient Registration</h1>
                    <p className="text-muted-foreground">
                        Create a new patient record with NRIC auto-parsing
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/patients">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Patients
                    </Link>
                </Button>
            \u003c/div\u003e

            \u003cform onSubmit={handleSubmit} className="space-y-6"\u003e
                \u003cCard\u003e
                    \u003cCardHeader\u003e
                        \u003cCardTitle\u003ePatient Information\u003c/CardTitle\u003e
                        \u003cCardDescription\u003e
                            Enter patient details. NRIC will automatically populate age and gender.
                        \u003c/CardDescription\u003e
                    \u003c/CardHeader\u003e
                    \u003cCardContent className="space-y-4"\u003e
                        \u003cdiv className="grid grid-cols-1 md:grid-cols-2 gap-4"\u003e
                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="nama"\u003eFull Name *\u003c/Label\u003e
                                \u003cdiv className="relative"\u003e
                                    \u003cUser className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /\u003e
                                    \u003cInput
                                        id="nama"
                                        placeholder="Enter patient name"
                                        value={formData.nama}
                                        onChange={handleChange}
                                        className="pl-10"
                                        required
                                    /\u003e
                                \u003c/div\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="no_kp"\u003eNRIC Number *\u003c/Label\u003e
                                \u003cInput
                                    id="no_kp"
                                    placeholder="e.g., 791113-12-3456"
                                    value={formData.no_kp}
                                    onChange={(e) =\u003e handleNricChange(e.target.value)}
                                    maxLength={17}
                                    className={nricError ? 'border-red-500' : nricInfo?.isValid ? 'border-green-500' : ''}
                                    required
                                /\u003e
                                {nricError \u0026\u0026 (
                                    \u003cAlert variant="destructive" className="py-2"\u003e
                                        \u003cAlertDescription className="text-sm"\u003e{nricError}\u003c/AlertDescription\u003e
                                    \u003c/Alert\u003e
                                )}
                                {nricInfo?.isValid \u0026\u0026 (
                                    \u003cAlert className="py-2 bg-green-50 border-green-200"\u003e
                                        \u003cAlertDescription className="text-sm"\u003e
                                            {nricInfo.type === 'nric' 
                                                ? `✓ Valid NRIC - Age: ${nricInfo.age}, Gender: ${nricInfo.gender === 'male' ? 'L' : 'P'}`
                                                : '✓ Valid Passport Format'
                                            }
                                        \u003c/AlertDescription\u003e
                                    \u003c/Alert\u003e
                                )}
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="mrn"\u003eMedical Record Number\u003c/Label\u003e
                                \u003cInput
                                    id="mrn"
                                    placeholder="e.g., MRN-2024-0001"
                                    value={formData.mrn}
                                    onChange={handleChange}
                                /\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="t_lahir"\u003eDate of Birth\u003c/Label\u003e
                                \u003cdiv className="relative"\u003e
                                    \u003cCalendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /\u003e
                                    \u003cInput
                                        id="t_lahir"
                                        type="date"
                                        value={formData.t_lahir}
                                        onChange={(e) =\u003e handleSelectChange('t_lahir', e.target.value)}
                                        className="pl-10"
                                    /\u003e
                                \u003c/div\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="jantina"\u003eGender\u003c/Label\u003e
                                \u003cSelect
                                    value={formData.jantina}
                                    onValueChange={(value) =\u003e handleSelectChange('jantina', value)}
                                \u003e
                                    \u003cSelectTrigger\u003e
                                        \u003cSelectValue placeholder="Select gender" /\u003e
                                    \u003c/SelectTrigger\u003e
                                    \u003cSelectContent\u003e
                                        \u003cSelectItem value="L"\u003eMale (L)\u003c/SelectItem\u003e
                                        \u003cSelectItem value="P"\u003eFemale (P)\u003c/SelectItem\u003e
                                    \u003c/SelectContent\u003e
                                \u003c/Select\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="umur"\u003eAge\u003c/Label\u003e
                                \u003cInput
                                    id="umur"
                                    type="number"
                                    value={formData.umur}
                                    onChange={(e) =\u003e handleSelectChange('umur', e.target.value)}
                                    placeholder="Auto-calculated from NRIC"
                                    readOnly={!!nricInfo?.age}
                                /\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="bangsa"\u003eRace\u003c/Label\u003e
                                \u003cSelect
                                    value={formData.bangsa}
                                    onValueChange={(value) =\u003e handleSelectChange('bangsa', value)}
                                \u003e
                                    \u003cSelectTrigger\u003e
                                        \u003cSelectValue placeholder="Select race" /\u003e
                                    \u003c/SelectTrigger\u003e
                                    \u003cSelectContent\u003e
                                        \u003cSelectItem value="Melayu"\u003eMelayu\u003c/SelectItem\u003e
                                        \u003cSelectItem value="Cina"\u003eCina\u003c/SelectItem\u003e
                                        \u003cSelectItem value="India"\u003eIndia\u003c/SelectItem\u003e
                                        \u003cSelectItem value="Lain-Lain"\u003eLain-Lain\u003c/SelectItem\u003e
                                        \u003cSelectItem value="Warga Asing"\u003eWarga Asing\u003c/SelectItem\u003e
                                    \u003c/SelectContent\u003e
                                \u003c/Select\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="wad"\u003eWard\u003c/Label\u003e
                                \u003cSelect
                                    value={formData.wad}
                                    onValueChange={(value) =\u003e handleSelectChange('wad', value)}
                                \u003e
                                    \u003cSelectTrigger\u003e
                                        \u003cSelectValue placeholder="Select ward" /\u003e
                                    \u003c/SelectTrigger\u003e
                                    \u003cSelectContent\u003e
                                        {wards.map((ward) =\u003e (
                                            \u003cSelectItem key={ward.id} value={ward.id.toString()}\u003e
                                                {ward.nama}
                                            \u003c/SelectItem\u003e
                                        ))}
                                    \u003c/SelectContent\u003e
                                \u003c/Select\u003e
                            \u003c/div\u003e
                        \u003c/div\u003e

                        \u003cdiv className="space-y-2"\u003e
                            \u003cLabel htmlFor="alamat"\u003eAddress\u003c/Label\u003e
                            \u003cdiv className="relative"\u003e
                                \u003cMapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /\u003e
                                \u003cInput
                                    id="alamat"
                                    placeholder="Enter patient address"
                                    value={formData.alamat}
                                    onChange={handleChange}
                                    className="pl-10"
                                /\u003e
                            \u003c/div\u003e
                        \u003c/div\u003e

                        \u003cdiv className="grid grid-cols-1 md:grid-cols-2 gap-4"\u003e
                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="telefon"\u003ePhone Number\u003c/Label\u003e
                                \u003cdiv className="relative"\u003e
                                    \u003cPhone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /\u003e
                                    \u003cInput
                                        id="telefon"
                                        type="tel"
                                        placeholder="e.g., +6012-3456789"
                                        value={formData.telefon}
                                        onChange={handleChange}
                                        className="pl-10"
                                    /\u003e
                                \u003c/div\u003e
                            \u003c/div\u003e

                            \u003cdiv className="space-y-2"\u003e
                                \u003cLabel htmlFor="email"\u003eEmail\u003c/Label\u003e
                                \u003cdiv className="relative"\u003e
                                    \u003cMail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /\u003e
                                    \u003cInput
                                        id="email"
                                        type="email"
                                        placeholder="patient@email.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="pl-10"
                                    /\u003e
                                \u003c/div\u003e
                            \u003c/div\u003e
                        \u003c/div\u003e

                        {error \u0026\u0026 (\u003cp className="text-sm text-red-500"\u003e{error}\u003c/p\u003e)}
                    \u003c/CardContent\u003e
                \u003c/Card\u003e

                \u003cdiv className="flex justify-end space-x-4"\u003e
                    \u003cButton type="button" variant="outline" onClick={() =\u003e router.back()}\u003e
                        Cancel
                    \u003c/Button\u003e
                    \u003cButton type="submit" disabled={isLoading || (!!nricError \u0026\u0026 !!formData.no_kp)}\u003e
                        {isLoading ? 'Creating...' : 'Create Patient'}
                    \u003c/Button\u003e
                \u003c/div\u003e
            \u003c/form\u003e
        \u003c/div\u003e
    );
} 