"""
Production Django settings for AI-Powered Radiology Information System (RIS)

This settings file is optimized for production deployment with:
- PostgreSQL database
- Redis caching and sessions
- Enhanced security measures
- Performance optimizations
- Comprehensive logging
- AI system configuration
"""

import os
import sys
from pathlib import Path
from datetime import timedelta

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent

# Clinic Configuration
KLINIK = os.environ.get('KLINIK_NAME', 'Klinik Kesihatan Puchong Batu 14')
KLINIKSHORT = os.environ.get('KLINIK_SHORT', 'KKP')

# ========== SECURITY SETTINGS ==========

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY environment variable is required")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() == 'true'

# Allowed hosts configuration
ALLOWED_HOSTS = [
    host.strip() for host in os.environ.get('DJANGO_ALLOWED_HOSTS', '').split(',')
    if host.strip()
]

if not ALLOWED_HOSTS:
    raise ValueError("DJANGO_ALLOWED_HOSTS environment variable is required")

# Security middleware settings
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True').lower() == 'true'
SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = 'DENY'

# ========== APPLICATION DEFINITION ==========

INSTALLED_APPS = [
    'daphne',  # ASGI server for WebSocket support
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django_htmx',
    'django_filters',
    'django_extensions',
    'crispy_forms',
    'crispy_bootstrap4',
    'ordered_model',
    'slippers',
    
    # Local apps
    'staff',
    'wad',
    'pesakit',
    'exam',
    'audit',
    
    # API and CORS
    'rest_framework',
    'corsheaders',
    'channels',
]

AUTH_USER_MODEL = 'staff.Staff'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'audit.middleware.AuditContextMiddleware',
    'login_required.middleware.LoginRequiredMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django_htmx.middleware.HtmxMiddleware',
    'audit.middleware.SimpleAuditMiddleware',
]

# Login required middleware configuration
LOGIN_REQUIRED_IGNORE_PATHS = [
    r'/api/',
    r'/login/',
    r'/logout/',
    r'/admin/',
    r'/health/',
    r'/static/',
    r'/media/',
]

ROOT_URLCONF = 'reez.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
            'builtins': ['slippers.templatetags.slippers'],
        },
    },
]

WSGI_APPLICATION = 'reez.wsgi.application'
ASGI_APPLICATION = 'reez.asgi.application'

# ========== DATABASE CONFIGURATION ==========

DATABASES = {
    'default': {
        'ENGINE': os.environ.get('DATABASE_ENGINE', 'django.db.backends.postgresql'),
        'NAME': os.environ.get('DATABASE_NAME', 'ris_production'),
        'USER': os.environ.get('DATABASE_USER', 'ris_user'),
        'PASSWORD': os.environ.get('DATABASE_PASSWORD'),
        'HOST': os.environ.get('DATABASE_HOST', 'localhost'),
        'PORT': os.environ.get('DATABASE_PORT', '5432'),
        'CONN_MAX_AGE': int(os.environ.get('DATABASE_CONN_MAX_AGE', '300')),
        'OPTIONS': {
            'sslmode': 'prefer',
        },
    }
}

if not DATABASES['default']['PASSWORD']:
    raise ValueError("DATABASE_PASSWORD environment variable is required")

# ========== REDIS AND CACHING CONFIGURATION ==========

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
REDIS_CACHE_URL = os.environ.get('REDIS_CACHE_URL', 'redis://localhost:6379/1')
REDIS_SESSION_URL = os.environ.get('REDIS_SESSION_URL', 'redis://localhost:6379/2')

# Cache configuration
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_CACHE_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'PASSWORD': os.environ.get('REDIS_PASSWORD'),
            'CONNECTION_POOL_KWARGS': {
                'max_connections': 20,
                'retry_on_timeout': True,
            },
        },
        'TIMEOUT': int(os.environ.get('CACHE_TIMEOUT', '300')),
        'KEY_PREFIX': 'ris',
        'VERSION': 1,
    }
}

# Session configuration
SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'
SESSION_COOKIE_AGE = int(os.environ.get('SESSION_COOKIE_AGE', '28800'))  # 8 hours
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# Channels layer configuration
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [REDIS_URL],
            'capacity': 1500,
            'expiry': 10,
        },
    },
}

# ========== INTERNATIONALIZATION ==========

LANGUAGE_CODE = os.environ.get('LANGUAGE_CODE', 'ms-my')
TIME_ZONE = os.environ.get('TIMEZONE', 'Asia/Kuala_Lumpur')
USE_I18N = True
USE_TZ = True

# ========== STATIC AND MEDIA FILES ==========

STATIC_URL = os.environ.get('STATIC_URL', '/static/')
STATIC_ROOT = os.environ.get('STATIC_ROOT', '/var/www/ris/static')

MEDIA_URL = os.environ.get('MEDIA_URL', '/media/')
MEDIA_ROOT = os.environ.get('MEDIA_ROOT', '/var/www/ris/media')

STATICFILES_FINDERS = [
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
]

STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# ========== EMAIL CONFIGURATION ==========

EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.environ.get('EMAIL_HOST')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() == 'true'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'ris@localhost')

# ========== REST FRAMEWORK CONFIGURATION ==========

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle'
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour'
    },
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}

# ========== CORS CONFIGURATION ==========

CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'False').lower() == 'true'

# ========== JWT CONFIGURATION ==========

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=int(os.environ.get('JWT_ACCESS_TOKEN_LIFETIME_HOURS', '8'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.environ.get('JWT_REFRESH_TOKEN_LIFETIME_DAYS', '7'))),
    'ROTATE_REFRESH_TOKENS': os.environ.get('JWT_ROTATE_REFRESH_TOKENS', 'True').lower() == 'true',
    'BLACKLIST_AFTER_ROTATION': os.environ.get('JWT_BLACKLIST_AFTER_ROTATION', 'True').lower() == 'true',
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ========== PASSWORD VALIDATION ==========

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ========== CRISPY FORMS CONFIGURATION ==========

CRISPY_ALLOWED_TEMPLATE_PACKS = "bootstrap4"
CRISPY_TEMPLATE_PACK = "bootstrap4"

# ========== LOGIN CONFIGURATION ==========

LOGIN_URL = '/login/'
LOGOUT_REDIRECT_URL = '/'

# ========== FILE UPLOAD SETTINGS ==========

FILE_UPLOAD_MAX_MEMORY_SIZE = 100 * 1024 * 1024  # 100MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 100 * 1024 * 1024  # 100MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000

# ========== DICOM CONFIGURATION ==========

DICOM_ORG_ROOT = os.environ.get('DICOM_ORG_ROOT', '1.2.826.0.1.3680043.8.498')
DICOM_AE_TITLE = os.environ.get('DICOM_AE_TITLE', 'RIS_PROD_SCP')
DICOM_MWL_PORT = int(os.environ.get('DICOM_MWL_PORT', '11112'))

# ========== AI SYSTEM CONFIGURATION ==========

# Ollama Server Configuration
AI_OLLAMA_SERVER_URL = os.environ.get('AI_OLLAMA_SERVER_URL', 'http://localhost:11434')
AI_OLLAMA_TIMEOUT = int(os.environ.get('AI_OLLAMA_TIMEOUT', '300'))

# AI Model Configuration
AI_DEFAULT_VISION_MODEL = os.environ.get('AI_VISION_MODEL', 'llava-med:7b')
AI_DEFAULT_MEDICAL_LLM = os.environ.get('AI_MEDICAL_LLM', 'meditron:7b')
AI_DEFAULT_QA_MODEL = os.environ.get('AI_QA_MODEL', 'medalpaca:7b')

# AI Processing Configuration
AI_MAX_PROCESSING_TIME = int(os.environ.get('AI_MAX_PROCESSING_TIME', '300'))
AI_CONFIDENCE_THRESHOLD = float(os.environ.get('AI_CONFIDENCE_THRESHOLD', '0.75'))
AI_CRITICAL_FINDINGS_THRESHOLD = float(os.environ.get('AI_CRITICAL_FINDINGS_THRESHOLD', '0.85'))
AI_BATCH_SIZE = int(os.environ.get('AI_BATCH_SIZE', '4'))
AI_MAX_CONCURRENT_REQUESTS = int(os.environ.get('AI_MAX_CONCURRENT_REQUESTS', '2'))

# AI Quality Assurance Settings
AI_ENABLE_QA_VALIDATION = os.environ.get('AI_ENABLE_QA_VALIDATION', 'True').lower() == 'true'
AI_REQUIRE_PEER_REVIEW_CRITICAL = os.environ.get('AI_REQUIRE_PEER_REVIEW_CRITICAL', 'True').lower() == 'true'
AI_AUTO_APPROVE_ROUTINE = os.environ.get('AI_AUTO_APPROVE_ROUTINE', 'False').lower() == 'true'

# AI Notification Settings
AI_NOTIFY_CRITICAL_FINDINGS = os.environ.get('AI_NOTIFY_CRITICAL_FINDINGS', 'True').lower() == 'true'
AI_NOTIFICATION_EMAILS = [
    email.strip() for email in os.environ.get('AI_NOTIFICATION_EMAILS', '').split(',')
    if email.strip()
]

# AI System Settings
AI_REPORTING_ENABLED = os.environ.get('AI_REPORTING_ENABLED', 'True').lower() == 'true'
AI_MAINTENANCE_MODE = os.environ.get('AI_MAINTENANCE_MODE', 'False').lower() == 'true'

# ========== AUDIT TRAIL CONFIGURATION ==========

AUDIT_LOG_RETENTION_DAYS = int(os.environ.get('AUDIT_LOG_RETENTION_DAYS', '730'))
AUDIT_LOG_CLEANUP_BATCH_SIZE = int(os.environ.get('AUDIT_LOG_CLEANUP_BATCH_SIZE', '1000'))
AUDIT_SENSITIVE_FIELDS = [
    'ic', 'nric', 'phone', 'email', 'address', 
    'telefon', 'alamat', 'no_telefon', 'emel'
]

# ========== LOGGING CONFIGURATION ==========

LOG_ROOT = os.environ.get('LOG_ROOT', '/var/log/ris')
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
DJANGO_LOG_LEVEL = os.environ.get('DJANGO_LOG_LEVEL', 'WARNING')

# Ensure log directory exists
os.makedirs(LOG_ROOT, exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {asctime} {message}',
            'style': '{',
        },
        'json': {
            'format': '{"level": "{levelname}", "time": "{asctime}", "module": "{module}", "message": "{message}"}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'level': LOG_LEVEL,
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'level': LOG_LEVEL,
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': f'{LOG_ROOT}/django.log',
            'maxBytes': 50*1024*1024,  # 50MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'audit_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': f'{LOG_ROOT}/audit.log',
            'maxBytes': 100*1024*1024,  # 100MB
            'backupCount': 10,
            'formatter': 'json',
        },
        'ai_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': f'{LOG_ROOT}/ai_system.log',
            'maxBytes': 50*1024*1024,  # 50MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'security_file': {
            'level': 'WARNING',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': f'{LOG_ROOT}/security.log',
            'maxBytes': 50*1024*1024,  # 50MB
            'backupCount': 10,
            'formatter': 'json',
        },
    },
    'root': {
        'level': LOG_LEVEL,
        'handlers': ['console', 'file'],
    },
    'loggers': {
        'django': {
            'level': DJANGO_LOG_LEVEL,
            'handlers': ['console', 'file'],
            'propagate': False,
        },
        'django.security': {
            'level': 'WARNING',
            'handlers': ['security_file', 'console'],
            'propagate': False,
        },
        'audit': {
            'level': 'INFO',
            'handlers': ['audit_file', 'console'],
            'propagate': False,
        },
        'exam.ai_services': {
            'level': 'INFO',
            'handlers': ['ai_file', 'console'],
            'propagate': False,
        },
        'exam.ai_views': {
            'level': 'INFO',
            'handlers': ['ai_file', 'console'],
            'propagate': False,
        },
    },
}

# ========== MONITORING AND HEALTH CHECKS ==========

# Sentry configuration for error tracking
SENTRY_DSN = os.environ.get('SENTRY_DSN')
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    
    sentry_logging = LoggingIntegration(
        level=logging.INFO,
        event_level=logging.WARNING
    )
    
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), sentry_logging],
        traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        send_default_pii=False,
        environment=os.environ.get('SENTRY_ENVIRONMENT', 'production'),
    )

# Health check configuration
HEALTH_CHECK_ENABLED = os.environ.get('HEALTH_CHECK_ENABLED', 'True').lower() == 'true'
HEALTH_CHECK_PATH = os.environ.get('HEALTH_CHECK_PATH', '/health/')
HEALTH_CHECK_AI_TIMEOUT = int(os.environ.get('HEALTH_CHECK_AI_TIMEOUT', '30'))

# ========== FEATURE FLAGS ==========

FEATURE_AI_REPORTING = os.environ.get('FEATURE_AI_REPORTING', 'True').lower() == 'true'
FEATURE_COLLABORATIVE_REPORTING = os.environ.get('FEATURE_COLLABORATIVE_REPORTING', 'True').lower() == 'true'
FEATURE_ADVANCED_ANALYTICS = os.environ.get('FEATURE_ADVANCED_ANALYTICS', 'True').lower() == 'true'
FEATURE_AUDIT_TRAILS = os.environ.get('FEATURE_AUDIT_TRAILS', 'True').lower() == 'true'

# ========== MAINTENANCE MODE ==========

MAINTENANCE_MODE = os.environ.get('MAINTENANCE_MODE', 'False').lower() == 'true'
MAINTENANCE_MESSAGE = os.environ.get('MAINTENANCE_MESSAGE', 'System is under maintenance. Please try again later.')

# ========== DEFAULT FIELD CONFIGURATION ==========

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ========== BACKUP CONFIGURATION ==========

BACKUP_ENABLED = os.environ.get('BACKUP_ENABLED', 'True').lower() == 'true'
BACKUP_RETENTION_DAYS = int(os.environ.get('BACKUP_RETENTION_DAYS', '30'))

# AWS S3 backup configuration (optional)
BACKUP_S3_BUCKET = os.environ.get('BACKUP_S3_BUCKET')
BACKUP_S3_REGION = os.environ.get('BACKUP_S3_REGION', 'us-east-1')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')

# ========== PERFORMANCE SETTINGS ==========

# Database connection pooling
DATABASES['default']['CONN_MAX_AGE'] = int(os.environ.get('DATABASE_CONN_MAX_AGE', '300'))

# Static files compression (if using whitenoise)
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

# ========== GPU CONFIGURATION ==========

os.environ['CUDA_VISIBLE_DEVICES'] = os.environ.get('CUDA_VISIBLE_DEVICES', '0')
GPU_MEMORY_FRACTION = float(os.environ.get('GPU_MEMORY_FRACTION', '0.8'))
AI_MODEL_CACHE_SIZE = int(os.environ.get('AI_MODEL_CACHE_SIZE', '2'))

# ========== VALIDATION ==========

# Validate critical environment variables
required_env_vars = [
    'DJANGO_SECRET_KEY',
    'DJANGO_ALLOWED_HOSTS',
    'DATABASE_PASSWORD',
]

missing_vars = [var for var in required_env_vars if not os.environ.get(var)]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")

# Validate AI system configuration
if AI_REPORTING_ENABLED and not AI_OLLAMA_SERVER_URL:
    raise ValueError("AI_OLLAMA_SERVER_URL is required when AI reporting is enabled")

print(f"Production settings loaded successfully for {KLINIK}")
print(f"AI Reporting: {'Enabled' if AI_REPORTING_ENABLED else 'Disabled'}")
print(f"Debug Mode: {'On' if DEBUG else 'Off'}")
print(f"Database: {DATABASES['default']['ENGINE']}")
print(f"Cache Backend: {CACHES['default']['BACKEND']}")