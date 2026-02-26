/**
 * Structured logging utility with JSON format and sensitive data sanitization
 * 
 * Requirements:
 * - 10.1: Log errors with timestamps, component names, and stack traces
 * - 10.2: Log request details and response status for API failures
 * - 10.3: Log which accounts/operations succeeded during partial failures
 * - 7.4: Sanitize sensitive data (PATs, webhook URLs)
 * - 10.4: Classify errors as recoverable vs fatal
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type ErrorClassification = 'recoverable' | 'fatal' | 'partial';

export interface LogContext {
  component?: string;
  operation?: string;
  userId?: string;
  accountName?: string;
  fileKey?: string;
  projectId?: string;
  teamId?: string;
  status?: number;
  duration?: number;
  [key: string]: any;
}

export interface ErrorContext extends LogContext {
  error?: string;
  stack?: string;
  classification?: ErrorClassification;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext | ErrorContext;
}

/**
 * Patterns for sensitive data that should be redacted
 */
const SENSITIVE_PATTERNS = [
  // Figma PATs (typically start with figd_)
  /figd_[A-Za-z0-9_-]+/g,
  // Generic tokens
  /token["\s:=]+[A-Za-z0-9_-]{20,}/gi,
  // Webhook URLs
  /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9\/]+/gi,
  // Authorization headers
  /authorization["\s:=]+[A-Za-z0-9_-]+/gi,
  // Bearer tokens
  /bearer\s+[A-Za-z0-9_-]+/gi,
];

/**
 * Keys that should be redacted if they contain sensitive data
 */
const SENSITIVE_KEYS = [
  'pat',
  'token',
  'password',
  'secret',
  'authorization',
  'webhook',
  'webhookUrl',
  'accessToken',
  'encryptedPAT',
];

/**
 * Sanitize sensitive data from a value
 */
function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    let sanitized = value;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }
  
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  
  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }
  
  return value;
}

/**
 * Sanitize sensitive data from an object
 */
function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key is sensitive
    if (SENSITIVE_KEYS.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
      // If the value is an array or object, still redact but maintain structure
      if (Array.isArray(value)) {
        sanitized[key] = value.map(() => '[REDACTED]');
      } else if (value && typeof value === 'object') {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else {
      sanitized[key] = sanitizeValue(value);
    }
  }
  
  return sanitized;
}

/**
 * Format a log entry as JSON
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Logger class with structured logging
 */
export class Logger {
  private component: string;
  
  constructor(component: string) {
    this.component = component;
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context);
  }
  
  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }
  
  /**
   * Log an error message
   */
  error(message: string, context?: ErrorContext): void {
    this.log('ERROR', message, context);
  }
  
  /**
   * Log an error with classification
   */
  errorWithClassification(
    message: string,
    error: Error,
    classification: ErrorClassification,
    context?: LogContext
  ): void {
    this.error(message, {
      ...context,
      error: error.message,
      stack: error.stack,
      classification,
    });
  }
  
  /**
   * Log a recoverable error
   */
  recoverableError(message: string, error: Error, context?: LogContext): void {
    this.errorWithClassification(message, error, 'recoverable', context);
  }
  
  /**
   * Log a fatal error
   */
  fatalError(message: string, error: Error, context?: LogContext): void {
    this.errorWithClassification(message, error, 'fatal', context);
  }
  
  /**
   * Log a partial failure
   */
  partialFailure(message: string, error: Error, context?: LogContext): void {
    this.errorWithClassification(message, error, 'partial', context);
  }
  
  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext | ErrorContext): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context ? {
        component: this.component,
        ...sanitizeObject(context),
      } : {
        component: this.component,
      },
    };
    
    const formatted = formatLogEntry(entry);
    
    // Output to console based on level
    switch (level) {
      case 'DEBUG':
        console.debug(formatted);
        break;
      case 'INFO':
        console.log(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      case 'ERROR':
        console.error(formatted);
        break;
    }
  }
}

/**
 * Create a logger for a component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

/**
 * Sanitize data for logging (exported for testing)
 */
export function sanitize(data: any): any {
  return sanitizeValue(data);
}
