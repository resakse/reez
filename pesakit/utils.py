import re
from datetime import datetime, date

def parse_identification_number(id_number):
    """
    Parse NRIC or Passport number and extract relevant information.
    
    Args:
        id_number (str): Raw identification number input
        
    Returns:
        dict: Parsed information including type, DOB, gender, etc.
    """
    if not id_number:
        return None
    
    # Clean the input - remove all non-alphanumeric characters
    clean_number = re.sub(r'[^0-9A-Za-z]', '', str(id_number))
    
    # Check if it's an NRIC (12 digits, YYMMDD followed by 6 digits)
    if len(clean_number) == 12 and clean_number.isdigit():
        try:
            # Extract date parts
            year_part = clean_number[:2]
            month_part = clean_number[2:4]
            day_part = clean_number[4:6]
            
            # Determine full year (assuming 1900-2099 range)
            year = int(year_part)
            current_year = date.today().year % 100
            if year > current_year:
                year += 1900  # 20th century
            else:
                year += 2000  # 21st century
            
            # Create date object
            dob = date(year, int(month_part), int(day_part))
            
            # Extract gender from last digit
            last_digit = int(clean_number[-1])
            gender = 'L' if last_digit % 2 else 'P'
            
            # Calculate age
            today = date.today()
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            
            return {
                'type': 'nric',
                'clean_number': clean_number,
                'formatted': f"{clean_number[:6]}-{clean_number[6:8]}-{clean_number[8:]}",
                'dob': dob,
                'gender': gender,
                'age': age,
                'is_valid': True
            }
            
        except ValueError:
            # Invalid date format
            return {
                'type': 'nric',
                'clean_number': clean_number,
                'is_valid': False,
                'error': 'Invalid date format in NRIC'
            }
    
    # Passport format (alphanumeric)
    else:
        return {
            'type': 'passport',
            'clean_number': clean_number.upper(),
            'formatted': clean_number.upper(),
            'dob': None,
            'gender': None,
            'age': None,
            'is_valid': True
        }

def format_nric(nric):
    """
    Format NRIC with dashes.
    """
    if not nric:
        return None
    
    clean = re.sub(r'[^0-9]', '', str(nric))
    if len(clean) == 12:
        return f"{clean[:6]}-{clean[6:8]}-{clean[8:]}"
    
    return clean

def validate_nric(nric):
    """
    Validate NRIC format.
    """
    if not nric:
        return False
    
    clean = re.sub(r'[^0-9]', '', str(nric))
    return len(clean) == 12 and clean.isdigit()

def calculate_age(dob):
    """
    Calculate age from date of birth.
    """
    if not dob:
        return None
    
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))