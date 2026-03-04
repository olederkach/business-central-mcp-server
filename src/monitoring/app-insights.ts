/**
 * Azure Application Insights Integration
 * Provides telemetry, monitoring, and diagnostics
 */

import * as appInsights from 'applicationinsights';
import { Request, Response, NextFunction } from 'express';

let telemetryClient: appInsights.TelemetryClient | null = null;

export function initializeAppInsights(): appInsights.TelemetryClient | null {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

  if (!connectionString) {
    console.warn('Application Insights not configured. Set APPLICATIONINSIGHTS_CONNECTION_STRING for telemetry.');
    return null;
  }

  try {
    appInsights.setup(connectionString)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, true)
      .setUseDiskRetryCaching(true)
      .setSendLiveMetrics(true)
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
      .start();

    telemetryClient = appInsights.defaultClient;

    // Set cloud role for filtering telemetry
    if (telemetryClient && telemetryClient.context && telemetryClient.context.tags) {
      telemetryClient.context.tags[telemetryClient.context.keys.cloudRole] = 'business-central-mcp-server';
      telemetryClient.context.tags[telemetryClient.context.keys.cloudRoleInstance] = process.env.CONTAINER_APP_NAME || 'local';
    }

    console.log('✅ Application Insights initialized');
    return telemetryClient;
  } catch (error) {
    console.error('Failed to initialize Application Insights:', error);
    return null;
  }
}

export function getTelemetryClient(): appInsights.TelemetryClient | null {
  return telemetryClient;
}

export function trackMcpRequest(method: string, duration: number, success: boolean, properties?: Record<string, string>) {
  telemetryClient?.trackEvent({
    name: 'MCPRequest',
    properties: {
      method,
      success: success.toString(),
      ...properties
    },
    measurements: {
      duration
    }
  });
}

export function trackToolExecution(toolName: string, duration: number, success: boolean, tenant?: string) {
  telemetryClient?.trackEvent({
    name: 'ToolExecution',
    properties: {
      toolName,
      success: success.toString(),
      tenant: tenant || 'unknown'
    },
    measurements: {
      duration
    }
  });
}

export function trackBCApiCall(operation: string, duration: number, statusCode: number, tenant?: string) {
  telemetryClient?.trackDependency({
    target: 'api.businesscentral.dynamics.com',
    name: operation,
    data: operation,
    duration,
    resultCode: statusCode,
    success: statusCode >= 200 && statusCode < 300,
    dependencyTypeName: 'HTTP',
    properties: {
      tenant: tenant || 'unknown'
    }
  });
}

export function appInsightsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    telemetryClient?.trackRequest({
      name: `${req.method} ${req.path}`,
      url: req.originalUrl,
      duration,
      resultCode: res.statusCode.toString(),
      success: res.statusCode >= 200 && res.statusCode < 400,
      properties: {
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'] || 'unknown'
      }
    });
  });

  next();
}
