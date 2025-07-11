/**
 * Enhanced error handling utilities for coding tools
 */

/**
 * Format error object into a detailed, readable message
 */
export function formatDetailedError(error: any, context?: string): string {
  if (!error) {
    return 'No error information available';
  }

  const parts: string[] = [];
  
  // Add context if provided
  if (context) {
    parts.push(`Context: ${context}`);
  }

  // Handle different error types
  if (typeof error === 'string') {
    parts.push(`Error: ${error}`);
  } else if (error instanceof Error) {
    // Standard Error object
    parts.push(`Error: ${error.message || 'No message provided'}`);
    
    if (error.name && error.name !== 'Error') {
      parts.push(`Type: ${error.name}`);
    }
    
    if ((error as any).code) {
      parts.push(`Code: ${(error as any).code}`);
    }
    
    if ((error as any).errno) {
      parts.push(`Errno: ${(error as any).errno}`);
    }
    
    if ((error as any).path) {
      parts.push(`Path: ${(error as any).path}`);
    }
    
    if ((error as any).syscall) {
      parts.push(`Syscall: ${(error as any).syscall}`);
    }
    
    // Include stack trace in debug builds or if explicitly requested
    if (process.env.NODE_ENV === 'development' && error.stack) {
      parts.push(`Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  } else if (typeof error === 'object') {
    // Generic object error
    if (error.message) {
      parts.push(`Error: ${error.message}`);
    }
    
    if (error.error) {
      parts.push(`Details: ${error.error}`);
    }
    
    if (error.code) {
      parts.push(`Code: ${error.code}`);
    }
    
    if (error.status) {
      parts.push(`Status: ${error.status}`);
    }
    
    // Add other relevant properties
    const relevantKeys = ['type', 'errno', 'path', 'syscall', 'exitCode', 'signal'];
    for (const key of relevantKeys) {
      if (error[key] !== undefined) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${error[key]}`);
      }
    }
    
    // If we still don't have much info, stringify the object
    if (parts.length <= 1) {
      try {
        const stringified = JSON.stringify(error, null, 2);
        if (stringified !== '{}') {
          parts.push(`Raw: ${stringified}`);
        }
      } catch {
        parts.push(`Raw: ${String(error)}`);
      }
    }
  } else {
    // Primitive or unknown type
    parts.push(`Error: ${String(error)}`);
  }
  
  // If we still have no useful information
  if (parts.length === 0 || (parts.length === 1 && context)) {
    parts.push('Unknown error occurred with no additional details');
  }
  
  return parts.join(' | ');
}

/**
 * Extract relevant error information for tool responses
 */
export function extractErrorInfo(error: any): {
  message: string;
  code?: string;
  type?: string;
  details?: Record<string, any>;
} {
  if (!error) {
    return {
      message: 'Unknown error occurred',
      type: 'unknown'
    };
  }

  const info: any = {
    message: 'Unknown error occurred'
  };

  if (typeof error === 'string') {
    info.message = error;
    info.type = 'string';
  } else if (error instanceof Error) {
    info.message = error.message || 'Error object with no message';
    info.type = error.name || 'Error';
    
    if ((error as any).code) {
      info.code = (error as any).code;
    }
    
    // Collect additional details
    const details: Record<string, any> = {};
    const relevantKeys = ['errno', 'path', 'syscall', 'exitCode', 'signal'];
    
    for (const key of relevantKeys) {
      if ((error as any)[key] !== undefined) {
        details[key] = (error as any)[key];
      }
    }
    
    if (Object.keys(details).length > 0) {
      info.details = details;
    }
  } else if (typeof error === 'object') {
    info.message = error.message || error.error || 'Object error with no message';
    info.type = error.type || error.constructor?.name || 'object';
    
    if (error.code) {
      info.code = error.code;
    }
    
    // Collect additional details
    const details: Record<string, any> = {};
    for (const [key, value] of Object.entries(error)) {
      if (!['message', 'error', 'type', 'code'].includes(key) && value !== undefined) {
        details[key] = value;
      }
    }
    
    if (Object.keys(details).length > 0) {
      info.details = details;
    }
  } else {
    info.message = String(error);
    info.type = typeof error;
  }

  return info;
}

/**
 * Create a standardized error response for tools
 */
export function createErrorResponse(error: any, operation: string, additionalContext?: Record<string, any>) {
  const errorInfo = extractErrorInfo(error);
  const detailedMessage = formatDetailedError(error, operation);
  
  return {
    success: false,
    message: detailedMessage,
    error: {
      operation,
      ...errorInfo,
      ...additionalContext
    }
  };
}

/**
 * Log error with enhanced formatting
 */
export function logEnhancedError(error: any, operation: string, logger?: any) {
  const errorMsg = formatDetailedError(error, operation);
  
  if (logger && typeof logger.error === 'function') {
    logger.error(errorMsg);
  } else {
    console.error(`[Enhanced Error] ${errorMsg}`);
  }
  
  // In development, also log the raw error for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('[Raw Error Object]:', error);
  }
} 