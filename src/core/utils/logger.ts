import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

/**
 * Log levels in order of increasing severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 100 // Special level that disables all logging
}

/**
 * Configuration options for the logger
 */
export interface LoggerOptions {
  /**
   * Minimum log level to output (defaults to LogLevel.INFO)
   */
  minLevel?: LogLevel;
  
  /**
   * Whether to log to console (defaults to true)
   */
  console?: boolean;
  
  /**
   * Whether to log to file (defaults to false)
   */
  file?: boolean;
  
  /**
   * Log file path (defaults to './logs')
   */
  logDir?: string;
  
  /**
   * Log file name format (defaults to 'hhh-agi-{date}.log')
   */
  logFileFormat?: string;
  
  /**
   * Whether to include timestamps in log messages (defaults to true)
   */
  timestamp?: boolean;
  
  /**
   * Whether to colorize console output (defaults to true)
   */
  colors?: boolean;
  
  /**
   * Maximum log file size in bytes before rotation (defaults to 5MB)
   */
  maxFileSize?: number;
  
  /**
   * Maximum number of log files to keep (defaults to 5)
   */
  maxFiles?: number;
  
  /**
   * Custom formatters for specific content types
   */
  formatters?: {
    [key: string]: (data: any) => string;
  };
}

/**
 * Console colors for different log levels
 */
const COLORS = {
  reset: '\x1b[0m',
  debug: '\x1b[90m', // Gray
  info: '\x1b[36m',  // Cyan
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  highlight: '\x1b[1m\x1b[35m', // Bold Magenta
};

/**
 * Logger class that handles logging to console and file
 */
export class Logger {
  private static instance: Logger;
  private options: Required<LoggerOptions>;
  private logStream: fs.WriteStream | null = null;
  private currentLogFile: string = '';
  private currentLogSize: number = 0;
  
  /**
   * Create a new Logger instance
   */
  private constructor(options: LoggerOptions = {}) {
    // Set default options
    this.options = {
      minLevel: options.minLevel ?? LogLevel.INFO,
      console: options.console ?? true,
      file: options.file ?? false,
      logDir: options.logDir ?? './logs',
      logFileFormat: options.logFileFormat ?? 'hhh-agi-{date}.log',
      timestamp: options.timestamp ?? true,
      colors: options.colors ?? true,
      maxFileSize: options.maxFileSize ?? 5 * 1024 * 1024, // 5MB
      maxFiles: options.maxFiles ?? 5,
      formatters: options.formatters ?? {},
    };
    
    // Initialize file logging if enabled
    if (this.options.file) {
      this.initFileLogging();
    }
  }
  
  /**
   * Get the singleton Logger instance
   */
  public static getInstance(options?: LoggerOptions): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    } else if (options) {
      // Update options if provided
      Logger.instance.configure(options);
    }
    return Logger.instance;
  }
  
  /**
   * Update logger configuration
   */
  public configure(options: LoggerOptions): void {
    // Update options
    Object.assign(this.options, options);
    
    // Reinitialize file logging if needed
    if (this.options.file) {
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
      this.initFileLogging();
    } else if (!this.options.file && this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * Set the minimum log level
   * @param level The new minimum log level
   */
  public static setLevel(level: LogLevel): void {
    const instance = Logger.getInstance();
    instance.options.minLevel = level;
    instance.debug(`Log level set to: ${LogLevel[level]}`);
  }

  /**
   * Get the current minimum log level
   * @returns The current minimum log level
   */
  public static getLevel(): LogLevel {
    return Logger.getInstance().options.minLevel;
  }
  
  /**
   * Initialize file logging
   */
  private initFileLogging(): void {
    try {
      // Create log directory if it doesn't exist
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
      }
      
      // Create log file
      this.rotateLogFile();
    } catch (error) {
      console.error('Failed to initialize file logging:', error);
      this.options.file = false;
    }
  }
  
  /**
   * Create a new log file
   */
  private rotateLogFile(): void {
    try {
      // Close existing stream if any
      if (this.logStream) {
        this.logStream.end();
      }
      
      // Create new log file name based on date
      const date = new Date().toISOString().split('T')[0];
      let counter = 0;
      let logFileName = this.options.logFileFormat.replace('{date}', date);
      
      // Add counter if file already exists
      while (fs.existsSync(path.join(this.options.logDir, logFileName)) && counter < 100) {
        counter++;
        logFileName = this.options.logFileFormat
          .replace('{date}', `${date}-${counter}`);
      }
      
      this.currentLogFile = path.join(this.options.logDir, logFileName);
      this.currentLogSize = 0;
      
      // Create a new write stream
      this.logStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
      
      // Clean up old log files
      this.cleanOldLogFiles();
    } catch (error) {
      console.error('Failed to rotate log file:', error);
      this.options.file = false;
    }
  }
  
  /**
   * Remove old log files if exceeding the maximum number
   */
  private cleanOldLogFiles(): void {
    try {
      // Get all log files
      const logFiles = fs.readdirSync(this.options.logDir)
        .filter(file => file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.options.logDir, file),
          mtime: fs.statSync(path.join(this.options.logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime); // Sort by modification time (newest first)
      
      // Remove old files exceeding the maximum
      if (logFiles.length > this.options.maxFiles) {
        for (let i = this.options.maxFiles; i < logFiles.length; i++) {
          fs.unlinkSync(logFiles[i].path);
        }
      }
    } catch (error) {
      console.error('Failed to clean old log files:', error);
    }
  }
  
  /**
   * Format a log message with optional timestamp and colors
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.options.timestamp ? `[${new Date().toISOString()}] ` : '';
    let levelStr = '';
    
    // Add level prefix
    switch (level) {
      case LogLevel.DEBUG:
        levelStr = '[DEBUG] ';
        break;
      case LogLevel.INFO:
        levelStr = '[INFO] ';
        break;
      case LogLevel.WARN:
        levelStr = '[WARN] ';
        break;
      case LogLevel.ERROR:
        levelStr = '[ERROR] ';
        break;
    }
    
    return `${timestamp}${levelStr}${message}`;
  }
  
  /**
   * Add colors to a console message based on log level
   */
  private colorize(level: LogLevel, message: string): string {
    if (!this.options.colors) return message;
    
    let color = '';
    switch (level) {
      case LogLevel.DEBUG:
        color = COLORS.debug;
        break;
      case LogLevel.INFO:
        color = COLORS.info;
        break;
      case LogLevel.WARN:
        color = COLORS.warn;
        break;
      case LogLevel.ERROR:
        color = COLORS.error;
        break;
    }
    
    return `${color}${message}${COLORS.reset}`;
  }
  
  /**
   * Write a log message to the specified destinations
   */
  private log(level: LogLevel, ...args: any[]): void {
    // Skip if log level is below minimum
    if (level < this.options.minLevel) return;
    
    // Format the message
    const formattedArgs = args.map(arg => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      } else if (typeof arg === 'object') {
        return util.inspect(arg, { depth: 5, colors: false });
      } else if (arg === undefined) {
        return 'undefined';
      } else if (arg === null) {
        return 'null';
      }
      return String(arg);
    });
    
    const message = formattedArgs.join(' ');
    const formattedMessage = this.formatMessage(level, message);
    
    // Log to console
    if (this.options.console) {
      const colorizedMessage = this.colorize(level, formattedMessage);
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(colorizedMessage);
          break;
        case LogLevel.INFO:
          console.info(colorizedMessage);
          break;
        case LogLevel.WARN:
          console.warn(colorizedMessage);
          break;
        case LogLevel.ERROR:
          console.error(colorizedMessage);
          break;
      }
    }
    
    // Log to file
    if (this.options.file && this.logStream) {
      try {
        const logLine = `${formattedMessage}\n`;
        this.currentLogSize += Buffer.byteLength(logLine);
        this.logStream.write(logLine);
        
        // Rotate log file if it exceeds the maximum size
        if (this.currentLogSize >= this.options.maxFileSize) {
          this.rotateLogFile();
        }
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }
  
  /**
   * Log a debug message
   */
  public debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, ...args);
  }
  
  /**
   * Log an info message
   */
  public info(...args: any[]): void {
    this.log(LogLevel.INFO, ...args);
  }
  
  /**
   * Log a warning message
   */
  public warn(...args: any[]): void {
    this.log(LogLevel.WARN, ...args);
  }
  
  /**
   * Log an error message
   */
  public error(...args: any[]): void {
    this.log(LogLevel.ERROR, ...args);
  }
  
  /**
   * Log a prompt for debugging purposes
   * This method provides special formatting for prompt content
   */
  public logPrompt(name: string, content: string): void {
    if (this.options.minLevel > LogLevel.DEBUG) return;
    
    const divider = '-'.repeat(80);
    const header = `---- PROMPT: ${name} `;
    const header2 = header + '-'.repeat(Math.max(0, divider.length - header.length));
    
    this.debug('\n' + header2);
    this.debug(content);
    this.debug(divider + '\n');
  }
  
  /**
   * Log an object with special formatting
   */
  public logObject(label: string, obj: any, level: LogLevel = LogLevel.DEBUG): void {
    if (level < this.options.minLevel) return;
    
    const formatted = util.inspect(obj, { depth: null, colors: this.options.colors });
    this.log(level, `${label}:\n${formatted}`);
  }
  
  /**
   * Temporary increase log level for a specific operation
   * @returns A function to restore the previous log level
   */
  public withLogLevel(level: LogLevel, fn: () => void): void {
    const previousLevel = this.options.minLevel;
    this.options.minLevel = level;
    
    try {
      fn();
    } finally {
      this.options.minLevel = previousLevel;
    }
  }
}

// Create default export for easier importing
export default Logger;

// Create a convenience function to get a logger instance
export function getLogger(options?: LoggerOptions): Logger {
  return Logger.getInstance(options);
} 