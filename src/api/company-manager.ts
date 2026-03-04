/**
 * Company Manager
 * Manages Business Central companies and company context
 * Adapted from Python implementation
 */

import { BCApiClient } from '../bc/client.js';
import { logger } from '../utils/logger.js';

export interface Company {
  id: string;
  name: string;
  displayName?: string;
  businessProfileId?: string;
}

export class CompanyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyNotFoundError';
  }
}

/**
 * Manages Business Central companies and company context
 */
export class CompanyManager {
  private bcClient: BCApiClient;
  private companiesCache: Company[] | null = null;
  private selectedCompanyId: string | null = null;

  constructor(bcClient: BCApiClient) {
    this.bcClient = bcClient;
  }

  /**
   * Discover available companies
   * @param refreshCache Whether to refresh the company cache
   * @returns List of available companies
   */
  async discoverCompanies(refreshCache = false): Promise<Company[]> {
    if (!this.companiesCache || refreshCache) {
      try {
        const response = await this.bcClient.get<Company>('companies');
        this.companiesCache = response.value || [];
        logger.info(`Discovered ${this.companiesCache.length} companies`);
      } catch (error) {
        logger.error('Failed to discover companies', error instanceof Error ? error : undefined);
        throw error;
      }
    }
    return this.companiesCache;
  }

  /**
   * Get a company by its ID
   * @param companyId The company ID to search for
   * @returns Company object
   * @throws CompanyNotFoundError if company is not found
   */
  async getCompanyById(companyId: string): Promise<Company> {
    const companies = await this.discoverCompanies();

    const company = companies.find(c => c.id === companyId);
    if (!company) {
      throw new CompanyNotFoundError(`Company with ID ${companyId} not found`);
    }

    return company;
  }

  /**
   * Set the active company by ID
   * @param companyId Company ID to set as active
   * @returns The selected company
   * @throws CompanyNotFoundError if company is not found
   */
  async setActiveCompany(companyId: string): Promise<Company> {
    const company = await this.getCompanyById(companyId);
    this.selectedCompanyId = companyId;

    logger.info(`Set active company to: ${company.name} (ID: ${companyId})`);
    return company;
  }

  /**
   * Get the currently active company
   * @returns Active company or null if no company is selected
   */
  async getActiveCompany(): Promise<Company | null> {
    if (!this.selectedCompanyId) {
      return null;
    }

    try {
      return await this.getCompanyById(this.selectedCompanyId);
    } catch (error) {
      if (error instanceof CompanyNotFoundError) {
        // Clear invalid company selection
        this.selectedCompanyId = null;
        logger.warn('Previously selected company no longer exists, cleared selection');
      }
      return null;
    }
  }

  /**
   * Get the active company ID, defaulting to first available if none selected
   * @returns Active company ID or null if no companies available
   */
  async getActiveCompanyId(): Promise<string | null> {
    if (this.selectedCompanyId) {
      return this.selectedCompanyId;
    }

    // Default to first company if none selected
    const companies = await this.discoverCompanies();
    if (companies.length > 0) {
      this.selectedCompanyId = companies[0].id;
      logger.info(`Auto-selected first company: ${companies[0].name}`);
      return this.selectedCompanyId;
    }

    return null;
  }

  /**
   * Get the default (first available) company
   * @returns First available company or null if no companies exist
   */
  async getDefaultCompany(): Promise<Company | null> {
    const companies = await this.discoverCompanies();
    return companies.length > 0 ? companies[0] : null;
  }

  /**
   * Clear the companies cache
   */
  clearCache(): void {
    this.companiesCache = null;
    logger.debug('Company cache cleared');
  }

  /**
   * Clear the active company selection
   */
  clearSelection(): void {
    this.selectedCompanyId = null;
    logger.info('Active company selection cleared');
  }

  /**
   * Get current cache and selection state (for debugging/monitoring)
   */
  getState(): { cached: number; selectedId: string | null } {
    return {
      cached: this.companiesCache?.length || 0,
      selectedId: this.selectedCompanyId
    };
  }
}
