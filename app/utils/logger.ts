/**
 * URide Logger Utility
 * 
 * Provides consistent, structured logging across the app.
 * Logs are formatted for easy parsing and debugging.
 * 
 * Usage:
 *   import { logger } from '@/utils/logger';
 *   
 *   logger.info('UserAction', 'Button pressed', { buttonId: 'submit' });
 *   logger.error('API', 'Request failed', { endpoint: '/search', error });
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, any>;
}

// Categories for different parts of the app
export const LogCategory = {
  // Navigation & UI
  NAVIGATION: 'Navigation',
  UI: 'UI',
  
  // Core Features
  SEARCH: 'Search',
  BOOKING: 'Booking',
  RIDES: 'Rides',
  NEARBY_REQUESTS: 'NearbyRequests',
  CHAT: 'Chat',
  
  // Auth & User
  AUTH: 'Auth',
  USER: 'User',
  ONBOARDING: 'Onboarding',
  
  // Data & API
  API: 'API',
  SUPABASE: 'Supabase',
  STORAGE: 'Storage',
  
  // Location & Maps
  LOCATION: 'Location',
  MAPS: 'Maps',
  
  // Payments
  PAYMENT: 'Payment',
  STRIPE: 'Stripe',
  
  // System
  APP: 'App',
  ERROR: 'Error',
} as const;

type CategoryType = typeof LogCategory[keyof typeof LogCategory] | (string & {});

// Enable/disable logging in production
const IS_DEV = __DEV__;
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Minimum log level (can be configured)
let minLogLevel: LogLevel = IS_DEV ? 'DEBUG' : 'WARN';

// Color codes for terminal (React Native debugger)
const COLORS = {
  DEBUG: '\x1b[36m', // Cyan
  INFO: '\x1b[32m',  // Green
  WARN: '\x1b[33m',  // Yellow
  ERROR: '\x1b[31m', // Red
  RESET: '\x1b[0m',
};

// Emoji prefixes for visual scanning
const EMOJI = {
  DEBUG: '🔍',
  INFO: '📝',
  WARN: '⚠️',
  ERROR: '❌',
};

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLogLevel];
}

function formatLogEntry(entry: LogEntry): string {
  const { level, category, message, data } = entry;
  const emoji = EMOJI[level];
  const time = new Date(entry.timestamp).toLocaleTimeString();
  
  let formatted = `${emoji} [${time}] [${category}] ${message}`;
  
  if (data && Object.keys(data).length > 0) {
    // Format data nicely for console
    const dataStr = Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === 'object') {
          return `${key}=${JSON.stringify(value)}`;
        }
        return `${key}=${value}`;
      })
      .join(' | ');
    formatted += ` { ${dataStr} }`;
  }
  
  return formatted;
}

function log(level: LogLevel, category: CategoryType, message: string, data?: Record<string, any>) {
  if (!shouldLog(level)) return;
  
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    category,
    message,
    data,
  };
  
  const formatted = formatLogEntry(entry);
  
  switch (level) {
    case 'ERROR':
      console.error(formatted);
      break;
    case 'WARN':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
  
  return entry;
}

// Performance tracking
const performanceMarks: Record<string, number> = {};

function startTimer(name: string): void {
  performanceMarks[name] = Date.now();
  log('DEBUG', 'App', `⏱️ Timer started: ${name}`);
}

function endTimer(name: string, category: CategoryType = 'App'): number {
  const startTime = performanceMarks[name];
  if (!startTime) {
    log('WARN', category, `Timer "${name}" was never started`);
    return 0;
  }
  
  const duration = Date.now() - startTime;
  delete performanceMarks[name];
  
  log('INFO', category, `⏱️ ${name} completed`, { durationMs: duration });
  return duration;
}

// Request/Response logging for API calls
function logRequest(
  endpoint: string, 
  method: string, 
  body?: Record<string, any>
): string {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  log('INFO', 'API', `🚀 ${method} ${endpoint}`, {
    requestId,
    body: body ? JSON.stringify(body).slice(0, 200) + '...' : undefined,
  });
  
  performanceMarks[requestId] = Date.now();
  return requestId;
}

function logResponse(
  requestId: string,
  endpoint: string,
  status: 'success' | 'error',
  data?: Record<string, any>
): void {
  const startTime = performanceMarks[requestId];
  const duration = startTime ? Date.now() - startTime : 0;
  delete performanceMarks[requestId];
  
  if (status === 'success') {
    log('INFO', 'API', `✅ ${endpoint} completed`, {
      requestId,
      durationMs: duration,
      ...data,
    });
  } else {
    log('ERROR', 'API', `❌ ${endpoint} failed`, {
      requestId,
      durationMs: duration,
      ...data,
    });
  }
}

// Search-specific logging
function logSearch(phase: string, data?: Record<string, any>): void {
  log('INFO', 'Search', `🔍 ${phase}`, data);
}

// Booking-specific logging
function logBooking(action: string, data?: Record<string, any>): void {
  log('INFO', 'Booking', `🎫 ${action}`, data);
}

// User action logging
function logUserAction(action: string, data?: Record<string, any>): void {
  log('INFO', 'UI', `👆 ${action}`, data);
}

// Navigation logging
function logNavigation(from: string, to: string, params?: Record<string, any>): void {
  log('DEBUG', 'Navigation', `📱 ${from} → ${to}`, params);
}

// Export the logger object
export const logger = {
  // Basic logging
  debug: (category: CategoryType, message: string, data?: Record<string, any>) => 
    log('DEBUG', category, message, data),
  info: (category: CategoryType, message: string, data?: Record<string, any>) => 
    log('INFO', category, message, data),
  warn: (category: CategoryType, message: string, data?: Record<string, any>) => 
    log('WARN', category, message, data),
  error: (category: CategoryType, message: string, data?: Record<string, any>) => 
    log('ERROR', category, message, data),
  
  // Performance
  startTimer,
  endTimer,
  
  // API
  logRequest,
  logResponse,
  
  // Feature-specific
  search: logSearch,
  booking: logBooking,
  userAction: logUserAction,
  navigation: logNavigation,
  
  // Configuration
  setMinLevel: (level: LogLevel) => {
    minLogLevel = level;
  },
  
  // Categories export for convenience
  Category: LogCategory,
};

export default logger;

