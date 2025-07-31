/**
 * Race inference from Malaysian names using pattern matching
 * Client-side implementation that mirrors the backend algorithm
 */

export type Race = 'MALAY' | 'CHINESE' | 'INDIAN' | 'OTHER' | 'FOREIGNER';

// Map backend race values to frontend display values
export const raceDisplayMap: Record<Race, string> = {
  'MALAY': 'Melayu',
  'CHINESE': 'Cina', 
  'INDIAN': 'India',
  'OTHER': 'Lain-Lain',
  'FOREIGNER': 'Warga Asing'
};

/**
 * Infer race/ethnicity from Malaysian names using pattern matching
 */
export function inferRaceFromName(fullName: string, isValidNric: boolean = true): Race {
  if (!fullName || typeof fullName !== 'string') {
    return 'OTHER';
  }

  // Normalize name: remove extra spaces, convert to uppercase
  const name = fullName.trim().toUpperCase().replace(/\s+/g, ' ');

  // Malaysian Malay patterns
  const malayPatterns = [
    // Common Malay prefixes and suffixes
    /\bBIN\b/, /\bBINTI\b/, /\bABD\b/, /\bABDUL\b/, /\bABDULLAH\b/,
    // Common Malay names
    /\bMUHAMMAD\b/, /\bMOHAMMAD\b/, /\bAHMAD\b/, /\bMOHD\b/, /\bMD\b/,
    /\bSITI\b/, /\bNUR\b/, /\bNURUL\b/, /\bFATIMAH\b/, /\bAISHAH\b/,
    // Malay surnames/components
    /\bRAHMAN\b/, /\bRAHIM\b/, /\bRASHID\b/, /\bHASAN\b/, /\bHUSAIN\b/,
    /\bISMAIL\b/, /\bYUSUF\b/, /\bIBRAHIM\b/, /\bOTHMAN\b/, /\bOMAR\b/,
    // Regional Malay names
    /\bWAN\b/, /\bCHE\b/, /\bMAT\b/, /\bNIK\b/
  ];

  // Chinese patterns (transliterated names)
  const chinesePatterns = [
    // Common Chinese surnames
    /\bLIM\b/, /\bTAN\b/, /\bLEE\b/, /\bWONG\b/, /\bCHAN\b/, /\bLAU\b/,
    /\bTEO\b/, /\bNG\b/, /\bONG\b/, /\bYAP\b/, /\bSIM\b/, /\bHO\b/,
    /\bKOH\b/, /\bGOH\b/, /\bCHUA\b/, /\bTAY\b/, /\bLOW\b/, /\bKUEK\b/,
    /\bCHIN\b/, /\bLOOI\b/, /\bTONG\b/, /\bFOO\b/, /\bYEO\b/, /\bKHOO\b/,
    /\bCHEN\b/, /\bLIU\b/, /\bZHANG\b/, /\bWANG\b/, /\bLI\b/, /\bZHAO\b/,
    // Hokkien/Teochew variations
    /\bLIAW\b/, /\bLIEW\b/, /\bTIAW\b/, /\bCHOW\b/, /\bHOW\b/,
    // Cantonese variations
    /\bYAM\b/, /\bLAM\b/, /\bMOK\b/, /\bCHEUNG\b/, /\bLEUNG\b/,
    // Hakka variations
    /\bTHONG\b/, /\bCHONG\b/, /\bFONG\b/, /\bYONG\b/
  ];

  // Indian patterns (Tamil, Malayalam, Telugu, Punjabi, etc.)
  const indianPatterns = [
    // Common Tamil names and components
    /\bA\/L\b/, /\bA\/P\b/, /\bS\/O\b/, /\bD\/O\b/, // Anak Lelaki/Perempuan, Son Of/Daughter Of
    /\bRAMAN\b/, /\bKRISHNAN\b/, /\bSUBRAMANIAM\b/, /\bRAJU\b/,
    /\bNAIR\b/, /\bKUMAR\b/, /\bDEVI\b/, /\bPRIYA\b/, /\bVANI\b/,
    // Telugu/Malayalam
    /\bRAO\b/, /\bREDDY\b/, /\bMENON\b/, /\bPILLAI\b/, /\bNAMBIAR\b/,
    // Punjabi/Sikh names
    /\bSINGH\b/, /\bKAUR\b/, /\bJIT\b/, /\bPAL\b/, /\bDEEP\b/,
    // General Indian patterns
    /\bSHARMA\b/, /\bGUPTA\b/, /\bVERMA\b/, /\bAGARWAL\b/, /\bMISHRA\b/,
    // South Indian specific
    /\bBALAKRISHNAN\b/, /\bRAMAKRISHNAN\b/, /\bVENKATESH\b/, /\bSRINIVASAN\b/,
    /\bMURALI\b/, /\bSUNIL\b/, /\bANIL\b/, /\bVIJAY\b/, /\bRAJESH\b/
  ];

  // Score each race based on pattern matches
  const malayScore = malayPatterns.reduce((score, pattern) => 
    score + (pattern.test(name) ? 1 : 0), 0
  );
  
  const chineseScore = chinesePatterns.reduce((score, pattern) => 
    score + (pattern.test(name) ? 1 : 0), 0
  );
  
  const indianScore = indianPatterns.reduce((score, pattern) => 
    score + (pattern.test(name) ? 1 : 0), 0
  );

  // Additional logic for specific patterns

  // If multiple BIN/BINTI found, strongly Malay
  const binBintiMatches = (name.match(/\b(BIN|BINTI)\b/g) || []).length;
  const adjustedMalayScore = malayScore + (binBintiMatches >= 2 ? 3 : 0);

  // If single Chinese character names (common pattern)
  const chineseSingleCharPattern = /\b[A-Z]\s+[A-Z]{2,4}\s+[A-Z]{2,6}\b/;
  const adjustedChineseScore = chineseScore + (chineseSingleCharPattern.test(name) ? 2 : 0);

  // Determine race based on highest score
  const maxScore = Math.max(adjustedMalayScore, adjustedChineseScore, indianScore);

  if (maxScore === 0) {
    return 'OTHER'; // No clear patterns found
  } else if (adjustedMalayScore === maxScore) {
    return 'MALAY';
  } else if (adjustedChineseScore === maxScore) {
    return 'CHINESE';
  } else if (indianScore === maxScore) {
    return 'INDIAN';
  } else {
    return 'OTHER';
  }
}

/**
 * Get display value for race
 */
export function getRaceDisplayValue(race: Race): string {
  return raceDisplayMap[race] || 'Lain-Lain';
}

/**
 * Auto-populate race field based on name with confidence indicator
 */
export function autoPopulateRace(name: string, isValidNric: boolean = true): { race: string; confidence: 'high' | 'medium' | 'low' } {
  const inferredRace = inferRaceFromName(name, isValidNric);
  const displayValue = getRaceDisplayValue(inferredRace);
  
  // Determine confidence based on specific patterns
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  // High confidence for invalid NRIC -> Foreigner
  if (inferredRace === 'FOREIGNER') {
    confidence = 'high';
  } else if (inferredRace !== 'OTHER') {
    const normalizedName = name.trim().toUpperCase();
    
    // High confidence patterns
    if (
      /\bBIN\b|\bBINTI\b/.test(normalizedName) || // Clear Malay indicators
      /\bA\/L\b|\bA\/P\b|\bSINGH\b|\bKAUR\b/.test(normalizedName) || // Clear Indian indicators
      /\b(LIM|TAN|LEE|WONG|CHAN)\s+[A-Z]+/.test(normalizedName) // Common Chinese surname patterns
    ) {
      confidence = 'high';
    } 
    // Medium confidence patterns
    else if (
      /\b(MUHAMMAD|SITI|NUR|AHMAD)\b/.test(normalizedName) || // Common Malay names
      /\b(KUMAR|DEVI|RAO|NAIR)\b/.test(normalizedName) || // Common Indian names
      /\b(NG|ONG|GOH|CHUA)\b/.test(normalizedName) // Common Chinese names
    ) {
      confidence = 'medium';
    }
  }
  
  return { race: displayValue, confidence };
}