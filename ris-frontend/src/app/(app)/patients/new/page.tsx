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
import { autoPopulateRace } from '@/lib/raceInference';
import { ArrowLeft, User, Calendar, MapPin, Phone, Mail, Brain } from 'lucide-react';
import Link from 'next/link';

export default function NewPatientPage() {
    const router = useRouter();
    const { user } = useAuth();
    
    const [formData, setFormData] = useState({
        nama: '',
        no_kp: '',
        t_lahir: '',
        jantina: '',
        umur: '',
        alamat: '',
        telefon: '',
        email: '',
        bangsa: 'Melayu',
        mrn: '',
        catatan: ''
    });
    
    const [nricInfo, setNricInfo] = useState<NricInfo | null>(null);
    const [nricError, setNricError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [raceInference, setRaceInference] = useState<{ race: string; confidence: string } | null>(null);
    const [isRaceAutoPopulated, setIsRaceAutoPopulated] = useState(true); // Track if race was auto-populated

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
        
        // Always check race logic when NRIC changes (whether valid, invalid, or empty)
        if (formData.nama.trim() && isRaceAutoPopulated) {
            const info = value.trim() ? parseNric(value) : null;
            
            if (value.trim() && info) {
                if (!info.isValid || info.type === 'passport') {
                    // NRIC invalid OR passport format, change to Warga Asing
                    setFormData(prev => ({ ...prev, bangsa: 'Warga Asing' }));
                    setRaceInference(null); // Clear inference since we're overriding
                } else if (info.isValid && info.type === 'nric') {
                    // Valid Malaysian NRIC, use name-based inference
                    const inference = autoPopulateRace(formData.nama, true);
                    setRaceInference(inference);
                    setFormData(prev => ({ ...prev, bangsa: inference.race }));
                }
            } else if (!value.trim()) {
                // No NRIC entered, use name-based inference
                const inference = autoPopulateRace(formData.nama, true);
                setRaceInference(inference);
                setFormData(prev => ({ ...prev, bangsa: inference.race }));
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setFormData({ ...formData, [id]: value });
        
        // Auto-populate race when name changes (don't consider NRIC validity here)
        if (id === 'nama' && value.trim()) {
            const inference = autoPopulateRace(value, true); // Always use true for name-only inference
            setRaceInference(inference);
            
            // Auto-set race if it was previously auto-populated or still default
            if (isRaceAutoPopulated) {
                setFormData(prev => ({ ...prev, bangsa: inference.race }));
            }
        }
    };

    const handleSelectChange = (id: string, value: string) => {
        setFormData({ ...formData, [id]: value });
        
        // Clear race inference and auto-population when user manually changes race
        if (id === 'bangsa') {
            setRaceInference(null);
            setIsRaceAutoPopulated(false);
        }
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
                bangsa: formData.bangsa,
                mrn: formData.mrn || null,
                catatan: formData.catatan
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
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Patient Information</CardTitle>
                        <CardDescription>
                            Enter patient details. NRIC will automatically populate age and gender.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="nama">Full Name *</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="nama"
                                        placeholder="Enter patient name"
                                        value={formData.nama}
                                        onChange={handleChange}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="no_kp">NRIC Number *</Label>
                                <Input
                                    id="no_kp"
                                    placeholder="e.g., 791113-12-3456"
                                    value={formData.no_kp}
                                    onChange={(e) => handleNricChange(e.target.value)}
                                    maxLength={17}
                                    className={nricError ? 'border-red-500' : nricInfo?.isValid ? 'border-green-500' : ''}
                                    required
                                />
                                {nricError && (
                                    <Alert variant="destructive" className="py-2">
                                        <AlertDescription className="text-sm">{nricError}</AlertDescription>
                                    </Alert>
                                )}
                                {nricInfo?.isValid && (
                                    <Alert className="py-2 border-green-500">
                                        <AlertDescription className="text-sm">
                                            {nricInfo.type === 'nric' 
                                                ? `✓ Valid NRIC - Age: ${nricInfo.age}, Gender: ${nricInfo.gender === 'male' ? 'L' : 'P'}`
                                                : '✓ Valid Passport Format'
                                            }
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="mrn">Medical Record Number</Label>
                                <Input
                                    id="mrn"
                                    placeholder="e.g., MRN-2024-0001"
                                    value={formData.mrn}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="t_lahir">Date of Birth</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="t_lahir"
                                        type="date"
                                        value={formData.t_lahir}
                                        onChange={(e) => handleSelectChange('t_lahir', e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="jantina">Gender</Label>
                                <Select
                                    value={formData.jantina}
                                    onValueChange={(value) => handleSelectChange('jantina', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="L">Male (L)</SelectItem>
                                        <SelectItem value="P">Female (P)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="bangsa" className="flex items-center gap-2">
                                    Race
                                    {raceInference && (
                                        <Brain className="h-4 w-4 text-blue-500" title="AI inferred from name" />
                                    )}
                                </Label>
                                <Select
                                    value={formData.bangsa}
                                    onValueChange={(value) => handleSelectChange('bangsa', value)}
                                >
                                    <SelectTrigger className={raceInference ? 'border-blue-500' : ''}>
                                        <SelectValue placeholder="Select race" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Melayu">Melayu</SelectItem>
                                        <SelectItem value="Cina">Cina</SelectItem>
                                        <SelectItem value="India">India</SelectItem>
                                        <SelectItem value="Lain-Lain">Lain-Lain</SelectItem>
                                        <SelectItem value="Warga Asing">Warga Asing</SelectItem>
                                    </SelectContent>
                                </Select>
                                {raceInference && (
                                    <Alert className="py-2 border-blue-500">
                                        <Brain className="h-4 w-4" />
                                        <AlertDescription className="text-sm">
                                            AI suggestion: <strong>{raceInference.race}</strong> (confidence: {raceInference.confidence})
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="umur">Age</Label>
                                <Input
                                    id="umur"
                                    type="number"
                                    value={formData.umur}
                                    onChange={(e) => handleSelectChange('umur', e.target.value)}
                                    placeholder="Auto-calculated from NRIC"
                                    readOnly
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="alamat">Address</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="alamat"
                                    placeholder="Enter patient address"
                                    value={formData.alamat}
                                    onChange={handleChange}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="telefon">Phone Number</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="telefon"
                                        type="tel"
                                        placeholder="e.g., +6012-3456789"
                                        value={formData.telefon}
                                        onChange={handleChange}
                                        className="pl-10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="patient@email.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="catatan">Notes</Label>
                            <textarea
                                id="catatan"
                                placeholder="Enter any additional notes or remarks about the patient"
                                value={formData.catatan}
                                onChange={(e) => handleChange(e)}
                                className="w-full min-h-[80px] px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>

                        {error && (<p className="text-sm text-red-500">{error}</p>)}
                    </CardContent>
                </Card>

                <div className="flex justify-end space-x-4">
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isLoading || (!!nricError && !!formData.no_kp)}>
                        {isLoading ? 'Creating...' : 'Create Patient'}
                    </Button>
                </div>
            </form>
        </div>
    );
}