'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import AuthService from '@/lib/auth';

// Define a type for the form data to ensure type safety
type PatientFormData = {
    nama: string;
    nric: string;
    mrn: string;
    jantina: string;
    bangsa: string;
};

export default function NewPatientPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [formData, setFormData] = useState<PatientFormData>({
        nama: '',
        nric: '',
        mrn: '',
        jantina: '',
        bangsa: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    // Explicitly type the value as a string to fix the linter error
    const handleSelectChange = (id: keyof PatientFormData, value: string) => {
        setFormData({ ...formData, [id]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                // Flatten and join all error messages from the backend for a clear, detailed error
                const errorMessage = Object.values(errorData).flat().join(' ');
                throw new Error(errorMessage || 'Failed to create patient');
            }

            // Redirect on success
            router.push('/patients');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Add New Patient</CardTitle>
                <CardDescription>Enter the details for the new patient.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="nama">Name</Label>
                            <Input id="nama" placeholder="Full Name" value={formData.nama} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="nric">NRIC / Passport</Label>
                            <Input id="nric" placeholder="e.g., 900101-10-1234" value={formData.nric} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="mrn">MRN (Medical Record Number)</Label>
                            <Input id="mrn" placeholder="e.g., PAT005" value={formData.mrn} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="jantina">Gender</Label>
                            <Select onValueChange={(value) => handleSelectChange('jantina', value)} value={formData.jantina}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="L">Male</SelectItem>
                                    <SelectItem value="P">Female</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="bangsa">Race</Label>
                        <Select onValueChange={(value) => handleSelectChange('bangsa', value)} value={formData.bangsa}>
                            <SelectTrigger>
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
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" asChild>
                            <Link href="/patients">Cancel</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Patient'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
} 