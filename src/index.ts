#!/usr/bin/env node
/**
 * Business Central MCP Server - Main Entry Point
 * Supports both stdio (Claude Desktop) and HTTP (Copilot Studio) transports
 */

import { logger } from './utils/logger.js';
import { validateAndExit } from './config/validator.js';
import { parseCLIArgs } from './config.js';

async function main() {
  // Validate environment before starting
  validateAndExit();

  const args = process.argv.slice(2);
  const useStdio = args.includes('--stdio');

  // Parse CLI configuration (both modes can use this)
  const cliConfig = parseCLIArgs(args);

  if (useStdio) {
    logger.info('═══════════════════════════════════════════');
    logger.info('Starting MCP Server in stdio mode');
    logger.info('Client: Claude Desktop, Cline, etc.');
    logger.info('Transport: stdin/stdout (JSON-RPC)');
    logger.info('═══════════════════════════════════════════');

    const { startStdioServer } = await import('./transports/stdio-server.js');
    await startStdioServer(cliConfig);
  } else {
    logger.info('═══════════════════════════════════════════');
    logger.info('Starting MCP Server in HTTP mode');
    logger.info('Client: Copilot Studio, web clients');
    logger.info('Transport: HTTP/HTTPS (JSON-RPC)');
    logger.info('═══════════════════════════════════════════');

    // If API key provided via CLI (rare case), set it
    if (cliConfig.apiKey) {
      process.env.MCP_API_KEYS = cliConfig.apiKey;
      logger.info('MCP API key set from CLI argument');
    }

    const { startHttpServer } = await import('./server.js');
    await startHttpServer();
  }
}

main().catch((error) => {
  logger.error('Failed to start MCP Server', error instanceof Error ? error : undefined);
  logger.error('See .env.example for configuration requirements');
  process.exit(1);
});
