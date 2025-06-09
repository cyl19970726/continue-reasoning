import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logDir: string = '.logs';
  private logFile: string;

  private constructor() {
    // 确保 .logs 目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // 设置日志文件名（按日期）
    const today = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `agent-${today}.log`);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  private writeToFile(formattedMessage: string): void {
    try {
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private log(level: LogLevel, levelName: string, message: string, meta?: any): void {
    if (level >= this.logLevel) {
      const formattedMessage = this.formatMessage(levelName, message, meta);
      
      // 写入文件
      this.writeToFile(formattedMessage);
      
      // 根据级别输出到控制台
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.log(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
      }
    }
  }

  public debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, meta);
  }

  public info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, meta);
  }

  public error(message: string, meta?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, meta);
  }
}

// 创建全局logger实例
export const logger = Logger.getInstance(); 