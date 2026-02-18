import type { VerticalDescriptor } from "../types.js";

export const marketplaceVertical: VerticalDescriptor = {
  vertical_id: "marketplace",
  version: "1.0",
  display_name: "Buy/Sell Marketplace",
  description: "Find buyers or sellers for items through asymmetric matching with price negotiation",
  
  // Asymmetric roles - sellers and buyers have different schemas
  roles: {
    seller: {
      name: "Seller",
      description: "Someone selling an item",
      data_schema: "marketplace_listing",
      required_fields: ["category", "condition", "price_range", "location"],
      optional_fields: ["description", "photos", "shipping_options", "item_attributes"]
    },
    buyer: {
      name: "Buyer", 
      description: "Someone looking to buy an item",
      data_schema: "marketplace_preference",
      required_fields: ["category", "budget", "location"],
      optional_fields: ["preferred_condition", "max_distance", "urgency", "specific_requirements"]
    }
  },
  symmetric: false,
  
  // Minimal embedding schema - marketplace uses structured data matching instead
  embedding_schema: {
    dimensions: 1, // Minimal dimensions to pass validation
    groups: {
      "placeholder": { start: 0, end: 1 }
    },
    validation_rules: {
      range: [-1, 1],
      require_non_zero_norm: false,
      allow_nan_infinity: true
    }
  },
  
  // Progressive disclosure funnel
  funnel_config: {
    discovery_fields: [
      "category",
      "condition", 
      "price_range",
      "location",
      "reputation_score"
    ],
    evaluation_fields: [
      "description",
      "photos_watermarked",
      "item_condition_details",
      "shipping_options",
      "seller_reputation_breakdown"
    ],
    exchange_fields: [
      "photos_full_resolution",
      "exact_condition_description",
      "payment_methods",
      "shipping_timeline",
      "contact_preferences"
    ],
    connection_fields: [
      "seller_name",
      "seller_contact",
      "payment_details",
      "shipping_address"
    ],
    mutual_gate_stage: "EXCHANGED"
  },
  
  // Negotiation enabled with structured proposals
  negotiation: {
    enabled: true,
    max_rounds: 5,
    timeout_hours: 48,
    proposal_schema: {
      price: "number",
      terms: "string",
      shipping_method: "string", 
      delivery_date: "string",
      notes: "string"
    }
  },
  
  // Exclusive commitment - one item, one buyer
  exclusive_commitment: true,
  
  // Deal breakers for hard constraints
  deal_breakers: {
    enabled: true,
    hard_filters: ["category", "location", "price_range"],
    filter_before_scoring: true
  },

  // Phase 5: Onboarding configuration
  onboarding: {
    seller_collection: {
      required_accuracy: 0.95,
      photo_requirements: {
        minimum: 1,
        recommended: 3,
        types: ["main_item", "condition_details", "accessories"],
        quality_standards: "clear, well-lit, representative"
      },
      condition_assessment: {
        method: "honest_detailed_description",
        categories: ["new", "like-new", "good", "fair", "parts"],
        require_explanation: true
      },
      pricing_guidance: {
        research_comparable: true,
        consider_market_rates: true,
        allow_negotiation_room: true
      },
      red_flags: [
        "unrealistic_item_descriptions",
        "suspiciously_low_prices",
        "unwillingness_to_provide_photos",
        "vague_condition_descriptions",
        "inconsistent_information"
      ]
    },
    buyer_collection: {
      budget_realism: {
        check_market_rates: true,
        allow_flexibility: true,
        consider_total_cost: true
      },
      requirements_clarity: {
        specific_needs: true,
        deal_breakers: true,
        nice_to_haves: true
      },
      red_flags: [
        "unrealistic_budget_expectations",
        "vague_requirements",
        "pressure_for_immediate_decisions",
        "unwillingness_to_provide_payment_info"
      ]
    }
  }
};