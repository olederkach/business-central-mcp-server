/**
 * Business Central Metadata Parser
 * Parses EDMX (Entity Data Model XML) from BC OData endpoints
 * 
 * Supports two modes:
 * 1. Parse all entities in environment
 * 2. Parse only custom extension entities
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';
import { parseStringPromise } from 'xml2js';
import { BCConfig, BCConfigParser } from './config.js';

export interface EntityMetadata {
  name: string;
  entitySetName: string;
  namespace: string;
  key: string[];
  properties: PropertyMetadata[];
  navigationProperties: NavigationProperty[];
  operations: string[];
}

export interface PropertyMetadata {
  name: string;
  type: string;
  nullable: boolean;
  maxLength?: string;
  isKey: boolean;
}

export interface NavigationProperty {
  name: string;
  type: string;
  relationship: string;
  isCollection: boolean;
}

export type MetadataMode = 'all' | 'extensions-only';

export class MetadataParser {
  private bcConfig: BCConfig;
  private accessToken: string;
  private mode: MetadataMode;

  constructor(bcConfig: BCConfig, accessToken: string, mode: MetadataMode = 'all') {
    this.bcConfig = bcConfig;
    this.accessToken = accessToken;
    this.mode = mode;
  }

  async parse(): Promise<EntityMetadata[]> {
    const metadataUrl = BCConfigParser.buildMetadataUrl(this.bcConfig);
    
    try {
      logger.info('Fetching BC metadata from: ' + metadataUrl);
      
      const response = await axios.get(metadataUrl, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/xml'
        },
        timeout: 30000
      });

      logger.debug('BC metadata response', { status: response.status, contentType: response.headers['content-type'] });

      // Parse XML with proper options for EDMX format
      const edmx = await parseStringPromise(response.data, {
        explicitArray: true,
        mergeAttrs: false,
        explicitCharkey: false,
        tagNameProcessors: [],
        attrNameProcessors: [],
        valueProcessors: [],
        attrValueProcessors: []
      });

      const entities = this.extractEntities(edmx);

      if (this.mode === 'extensions-only') {
        return this.filterExtensionEntities(entities);
      }

      return entities;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch metadata: ${error.message}`);
      }
      throw error;
    }
  }

  private extractEntities(edmx: any): EntityMetadata[] {
    // Try to locate DataServices - edmx:Edmx is an object, edmx:DataServices is an array
    let dataServices = edmx['edmx:Edmx']?.['edmx:DataServices']?.[0];

    // Fallback: try without namespace prefix
    if (!dataServices && edmx['Edmx']) {
      dataServices = edmx['Edmx']?.['DataServices']?.[0];
    }

    if (!dataServices) {
      logger.error('Failed to locate DataServices in EDMX. Available structure:', undefined, {
        rootKeys: Object.keys(edmx),
        edmxEdmxKeys: edmx['edmx:Edmx'] ? Object.keys(edmx['edmx:Edmx']) : 'N/A',
        edmxKeys: edmx['Edmx'] ? Object.keys(edmx['Edmx']) : 'N/A'
      });
      throw new Error('Invalid EDMX format: missing DataServices. Check logs for structure details.');
    }

    logger.debug('DataServices found. Schema keys: ' + Object.keys(dataServices).join(', '));

    const schemas = Array.isArray(dataServices.Schema) ? dataServices.Schema : [dataServices.Schema];

    // First, build a map of EntityType -> EntitySet names from EntityContainer
    const entitySetMap = new Map<string, string>();

    for (const schema of schemas) {
      if (!schema) continue;

      const entityContainer = schema.EntityContainer?.[0];
      if (entityContainer?.EntitySet) {
        const entitySets = Array.isArray(entityContainer.EntitySet) ?
          entityContainer.EntitySet : [entityContainer.EntitySet];

        for (const entitySet of entitySets) {
          if (entitySet.$ && entitySet.$.Name && entitySet.$.EntityType) {
            // EntityType is usually "Namespace.TypeName", extract just the TypeName
            const typeName = entitySet.$.EntityType.split('.').pop() || entitySet.$.EntityType;
            entitySetMap.set(typeName, entitySet.$.Name);
          }
        }
      }
    }

    logger.debug(`Extracted ${entitySetMap.size} entity set mappings`);

    const entities: EntityMetadata[] = [];

    logger.debug(`Processing ${schemas.length} schema(s)`);

    for (const schema of schemas) {
      if (!schema) continue;

      const namespace = schema.$?.Namespace || '';
      const entityTypes = Array.isArray(schema.EntityType) ? schema.EntityType :
                         schema.EntityType ? [schema.EntityType] : [];

      for (const entity of entityTypes) {
        if (!entity?.$ || !entity.$.Name) continue;

        const entityTypeName = entity.$.Name;
        const entitySetName = entitySetMap.get(entityTypeName) || entityTypeName;

        const key = this.extractKey(entity);
        const properties = this.extractProperties(entity, key);
        const navigationProperties = this.extractNavigationProperties(entity);
        const operations = this.determineOperations(entity);

        entities.push({
          name: entityTypeName,
          entitySetName,
          namespace,
          key,
          properties,
          navigationProperties,
          operations
        });
      }
    }

    logger.info(`Successfully extracted ${entities.length} entities from BC metadata`);
    if (entities.length > 0) {
      logger.debug(`Sample entities: ${entities.slice(0, 5).map(e => e.name).join(', ')}`);
    }

    return entities;
  }

  private extractKey(entity: any): string[] {
    const key = entity.Key?.[0]?.PropertyRef;
    if (!key) return [];
    
    const keyProps = Array.isArray(key) ? key : [key];
    return keyProps.map((k: any) => k.$.Name);
  }

  private extractProperties(entity: any, keyNames: string[]): PropertyMetadata[] {
    const properties = entity.Property;
    if (!properties) return [];

    const propArray = Array.isArray(properties) ? properties : [properties];
    
    return propArray.map((prop: any) => ({
      name: prop.$.Name,
      type: this.mapEdmType(prop.$.Type),
      nullable: prop.$.Nullable !== 'false',
      maxLength: prop.$.MaxLength,
      isKey: keyNames.includes(prop.$.Name)
    }));
  }

  private extractNavigationProperties(entity: any): NavigationProperty[] {
    const navProps = entity.NavigationProperty;
    if (!navProps) return [];

    const navArray = Array.isArray(navProps) ? navProps : [navProps];
    
    return navArray.map((nav: any) => {
      const type = nav.$.Type || '';
      return {
        name: nav.$.Name,
        type: type.replace(/^Collection\(|\)$/g, ''),
        relationship: nav.$.Relationship || '',
        isCollection: type.startsWith('Collection(')
      };
    });
  }

  private determineOperations(entity: any): string[] {
    const ops: string[] = ['list', 'get'];
    
    const annotations = entity.Annotation || [];
    const annArray = Array.isArray(annotations) ? annotations : annotations ? [annotations] : [];
    
    const hasRestriction = (term: string) => 
      annArray.some((a: any) => a.$.Term === term && a.$.Bool === 'false');

    if (!hasRestriction('Org.OData.Capabilities.V1.InsertRestrictions')) {
      ops.push('create');
    }
    if (!hasRestriction('Org.OData.Capabilities.V1.UpdateRestrictions')) {
      ops.push('update');
    }
    if (!hasRestriction('Org.OData.Capabilities.V1.DeleteRestrictions')) {
      ops.push('delete');
    }

    return ops;
  }

  private filterExtensionEntities(entities: EntityMetadata[]): EntityMetadata[] {
    if (this.bcConfig.apiType !== 'custom') {
      return entities;
    }

    const { apiPublisher, apiGroup } = this.bcConfig;
    
    return entities.filter(entity => {
      const ns = entity.namespace.toLowerCase();
      return ns.includes(apiPublisher?.toLowerCase() || '') &&
             ns.includes(apiGroup?.toLowerCase() || '');
    });
  }

  private mapEdmType(edmType: string): string {
    const typeMap: Record<string, string> = {
      'Edm.String': 'string',
      'Edm.Int32': 'integer',
      'Edm.Int64': 'integer',
      'Edm.Decimal': 'number',
      'Edm.Double': 'number',
      'Edm.Boolean': 'boolean',
      'Edm.Date': 'string',
      'Edm.DateTime': 'string',
      'Edm.DateTimeOffset': 'string',
      'Edm.Guid': 'string'
    };

    return typeMap[edmType] || 'string';
  }
}
