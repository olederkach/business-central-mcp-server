/**
 * Structured Logger with Application Insights Integration
 * Logs to console and optionally to Azure Application Insights
 */

import { getTelemetryClient } from '../monitoring/app-insights.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  debug(message: string, properties?: Record<string, any>): void {
    this.log('debug', message, properties);
  }

  info(message: string, properties?: Record<string, any>): void {
    this.log('info', message, properties);
  }

  warn(message: string, properties?: Record<string, any>): void {
    this.log('warn', message, properties);
  }

  error(message: string, error?: Error, properties?: Record<string, any>): void {
    this.log('error', message, properties);

    // Send exceptions to App Insights
    const telemetry = getTelemetryClient();
    if (telemetry && error) {
      telemetry.trackException({
        exception: error,
        properties: this.stringifyProperties({
          message,
          ...properties
        })
      });
    }
  }

  private log(level: LogLevel, message: string, properties?: Record<string, any>): void {
    if (this.levels[level] < this.levels[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formatted = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...properties
    };

    // Console output
    const output = process.env.NODE_ENV === 'production'
      ? JSON.stringify(formatted)
      : `[${timestamp}] ${level.toUpperCase()}: ${message}${properties ? ' ' + JSON.stringify(properties) : ''}`;

    console.log(output);

    // Send to Application Insights
    const telemetry = getTelemetryClient();
    if (telemetry) {
      telemetry.trackTrace({
        message,
        severity: this.getSeverityLevel(level),
        properties: this.stringifyProperties({
          level,
          ...properties
        })
      });
    }
  }

  private stringifyProperties(properties?: Record<string, any>): Record<string, string> {
    if (!properties) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined || value === null) {
        result[key] = String(value);
      } else if (typeof value === 'string') {
        result[key] = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        result[key] = String(value);
      } else if (Array.isArray(value)) {
        result[key] = JSON.stringify(value);
      } else if (typeof value === 'object') {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = String(value);
      }
    }
    return result;
  }

  private getSeverityLevel(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return 'Verbose';
      case 'info':
        return 'Information';
      case 'warn':
        return 'Warning';
      case 'error':
        return 'Error';
      default:
        return 'Information';
    }
  }
}

export const logger = new Logger();
