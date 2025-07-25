export interface NricInfo {
  isValid: boolean;
  type: 'nric' | 'passport' | 'invalid';
  dateOfBirth?: string;
  gender?: 'male' | 'female';
  age?: number;
  error?: string;
}

export function parseNric(nric: string): NricInfo {
  const cleanNric = nric.replace(/[-\s]/g, '');
  
  // Check for NRIC format (12 digits)
  const nricRegex = /^\d{12}$/;
  if (nricRegex.test(cleanNric)) {
    const birthStr = cleanNric.substring(0, 6);
    const year = parseInt(birthStr.substring(0, 2));
    const month = parseInt(birthStr.substring(2, 4));
    const day = parseInt(birthStr.substring(4, 6));
    
    // Determine full year (assuming 1900s for now)
    const fullYear = year < 30 ? 2000 + year : 1900 + year;
    
    // Validate date
    const date = new Date(fullYear, month - 1, day);
    if (date.getFullYear() !== fullYear || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return {
        isValid: false,
        type: 'invalid',
        error: 'Invalid date in NRIC'
      };
    }
    
    // Gender determination (last digit of birth code)
    const lastDigit = parseInt(cleanNric.substring(11, 12));
    const gender = lastDigit % 2 === 0 ? 'female' : 'male';
    
    // Calculate age
    const today = new Date();
    let age = today.getFullYear() - fullYear;
    const monthDiff = today.getMonth() - (month - 1);
    const dayDiff = today.getDate() - day;
    
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age--;
    }
    
    return {
      isValid: true,
      type: 'nric',
      dateOfBirth: `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      gender,
      age
    };
  }
  
  // Check for passport format (alphanumeric)
  const passportRegex = /^[A-Z0-9]{6,15}$/;
  if (passportRegex.test(cleanNric.toUpperCase())) {
    return {
      isValid: true,
      type: 'passport'
    };
  }
  
  return {
    isValid: false,
    type: 'invalid',
    error: 'Invalid identification format'
  };
}

export function formatNric(nric: string): string {
  const cleanNric = nric.replace(/[-\s]/g, '');
  if (cleanNric.length === 12) {
    return `${cleanNric.substring(0, 6)}-${cleanNric.substring(6, 8)}-${cleanNric.substring(8, 12)}`;
  }
  return nric;
}