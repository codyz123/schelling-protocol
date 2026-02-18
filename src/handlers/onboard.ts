import type { HandlerContext, HandlerResult } from "../types.js";
import { getVertical } from "../verticals/registry.js";

interface OnboardParams {
  vertical_id: string;
}

interface OnboardingGuide {
  vertical_id: string;
  vertical_name: string;
  required_fields: string[];
  optional_fields: string[];
  collection_strategies: Record<string, any>;
  red_flags: string[];
  minimum_interaction_hours?: number;
  roles: Record<string, any>;
}

export function handleOnboard(
  params: OnboardParams,
  ctx: HandlerContext
): HandlerResult<OnboardingGuide> {
  try {
    const { vertical_id } = params;
    
    if (!vertical_id || typeof vertical_id !== 'string') {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "vertical_id is required and must be a string"
        }
      };
    }

    const descriptor = getVertical(vertical_id);

    if (!descriptor) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Unknown vertical_id: ${vertical_id}. Use schelling.verticals to list available verticals.`
        }
      };
    }

    // Extract onboarding information from the descriptor
    // For now, we'll construct this from the existing descriptor structure
    // In the future, descriptors will have explicit onboarding sections
    
    let guide: OnboardingGuide;

    if (vertical_id === 'matchmaking') {
      const role = descriptor.roles.seeker;
      guide = {
        vertical_id,
        vertical_name: descriptor.display_name,
        required_fields: role.required_fields,
        optional_fields: role.optional_fields,
        collection_strategies: {
          embedding_generation: {
            method: "observe_and_interview",
            minimum_hours: 10,
            preferred_approach: "natural_conversation",
            fallback: "structured_interview"
          },
          personality_assessment: {
            observe_not_ask: [
              "communication_style",
              "conflict_response", 
              "values_hierarchy",
              "social_energy",
              "intellectual_curiosity"
            ],
            interview_topics: [
              "relationship_history",
              "lifestyle_preferences", 
              "future_goals",
              "deal_breakers",
              "communication_preferences"
            ]
          },
          profile_writing: {
            perspective: "third_person",
            tone: "honest_specific_non_performative",
            avoid: ["generic_superlatives", "unrealistic_idealization"],
            focus: ["authentic_traits", "specific_interests", "real_values"]
          }
        },
        red_flags: [
          "user_requests_embedding_manipulation",
          "user_wants_to_hide_real_traits", 
          "user_asks_for_specific_scores",
          "insufficient_interaction_history",
          "user_seems_to_be_gaming_system"
        ],
        minimum_interaction_hours: 10,
        roles: descriptor.roles
      };
    } else if (vertical_id === 'marketplace') {
      guide = {
        vertical_id,
        vertical_name: descriptor.display_name,
        required_fields: [],
        optional_fields: [],
        collection_strategies: {
          seller_onboarding: {
            required_fields: descriptor.roles.seller.required_fields,
            optional_fields: descriptor.roles.seller.optional_fields,
            collection_focus: [
              "item_category_and_specifics",
              "condition_assessment",
              "pricing_strategy",
              "shipping_preferences",
              "payment_methods"
            ],
            photo_requirements: {
              minimum: 1,
              recommended: 3,
              types: ["main_item", "condition_details", "accessories"]
            }
          },
          buyer_onboarding: {
            required_fields: descriptor.roles.buyer.required_fields, 
            optional_fields: descriptor.roles.buyer.optional_fields,
            collection_focus: [
              "budget_and_flexibility",
              "specific_requirements",
              "location_and_shipping",
              "urgency_timeline",
              "deal_breakers"
            ]
          }
        },
        red_flags: [
          "unrealistic_item_descriptions",
          "suspiciously_low_prices",
          "unwillingness_to_provide_photos",
          "vague_item_condition_descriptions",
          "pressure_for_immediate_payment",
          "inconsistent_information"
        ],
        roles: descriptor.roles
      };
    } else {
      // Generic fallback for other verticals
      const firstRole = Object.values(descriptor.roles)[0];
      guide = {
        vertical_id,
        vertical_name: descriptor.display_name,
        required_fields: firstRole.required_fields,
        optional_fields: firstRole.optional_fields,
        collection_strategies: {
          general: {
            approach: "collect_required_fields_first",
            validation: "ensure_data_quality",
            privacy: "respect_user_boundaries"
          }
        },
        red_flags: [
          "incomplete_required_information",
          "contradictory_user_statements",
          "signs_of_gaming_or_manipulation"
        ],
        roles: descriptor.roles
      };
    }

    return {
      ok: true,
      data: guide
    };

  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}