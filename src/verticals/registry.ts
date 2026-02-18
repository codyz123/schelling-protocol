import type { VerticalDescriptor, VerticalRegistry } from "./types.js";
import { matchmakingVertical } from "./matchmaking/descriptor.js";
import { marketplaceVertical } from "./marketplace/descriptor.js";

// Global vertical registry
let _registry: VerticalRegistry = {};

export function resetVerticalRegistry(): void {
  _registry = {};
}

export function initVerticalRegistry(): void {
  // Reset first to ensure clean state
  resetVerticalRegistry();
  
  // Load built-in verticals
  registerVertical(matchmakingVertical);
  registerVertical(marketplaceVertical);
  
  // TODO: Load external verticals from config/plugins
}

export function registerVertical(descriptor: VerticalDescriptor): void {
  // Validate descriptor
  const validation = validateVerticalDescriptor(descriptor);
  if (!validation.valid) {
    throw new Error(`Invalid vertical descriptor for ${descriptor.vertical_id}: ${validation.errors.join(", ")}`);
  }
  
  _registry[descriptor.vertical_id] = descriptor;
}

export function getVertical(vertical_id: string): VerticalDescriptor | null {
  return _registry[vertical_id] || null;
}

export function listVerticals(): VerticalDescriptor[] {
  return Object.values(_registry);
}

export function getVerticalIds(): string[] {
  return Object.keys(_registry);
}

export function getVerticalRegistry(): Map<string, VerticalDescriptor> {
  return new Map(Object.entries(_registry));
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateVerticalDescriptor(descriptor: VerticalDescriptor): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!descriptor.vertical_id) errors.push("vertical_id is required");
  if (!descriptor.version) errors.push("version is required");
  if (!descriptor.display_name) errors.push("display_name is required");
  if (!descriptor.description) errors.push("description is required");
  
  // Roles validation
  if (!descriptor.roles || Object.keys(descriptor.roles).length === 0) {
    errors.push("At least one role must be defined");
  }
  
  // Embedding schema validation
  if (!descriptor.embedding_schema) {
    errors.push("embedding_schema is required");
  } else {
    if (descriptor.embedding_schema.dimensions <= 0) {
      errors.push("embedding_schema.dimensions must be positive");
    }
    if (!descriptor.embedding_schema.groups || Object.keys(descriptor.embedding_schema.groups).length === 0) {
      errors.push("embedding_schema.groups must be defined");
    }
  }
  
  // Funnel config validation
  if (!descriptor.funnel_config) {
    errors.push("funnel_config is required");
  } else {
    const required = ["discovery_fields", "evaluation_fields", "exchange_fields", "connection_fields"];
    for (const field of required) {
      if (!descriptor.funnel_config[field as keyof typeof descriptor.funnel_config]) {
        errors.push(`funnel_config.${field} is required`);
      }
    }
  }
  
  // Asymmetric role validation
  if (!descriptor.symmetric && Object.keys(descriptor.roles).length !== 2) {
    errors.push("Asymmetric verticals must define exactly 2 roles");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}