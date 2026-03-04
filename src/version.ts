/**
 * Centralized version constant
 * Single source of truth: package.json
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json (works from both src/ and dist/)
const pkgPath = resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

export const VERSION: string = pkg.version;
export const SERVER_NAME = 'business-central-mcp-server';
