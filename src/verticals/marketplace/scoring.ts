// Marketplace-specific scoring logic for matching sellers with buyers

export interface SellerListing {
  category: string;
  condition: "new" | "like-new" | "good" | "fair" | "parts";
  price_range?: {
    min_acceptable?: number;
    asking_price?: number;
  };
  location: string;
  description?: string;
  item_attributes?: Record<string, any>;
}

export interface BuyerPreference {
  category: string;
  budget?: {
    max_price?: number;
    preferred_price?: number;
  };
  location: string;
  urgency?: "low" | "medium" | "high";
  preferences?: Record<string, any>;
  condition_minimum?: "new" | "like-new" | "good" | "fair" | "parts";
}

export interface MarketplaceMatchScore {
  overall_score: number;
  price_overlap: number;
  category_match: number;
  location_proximity: number;
  condition_match: number;
  // Also include the _score versions for compatibility with search.ts
  price_overlap_score: number;
  category_match_score: number; 
  location_proximity_score: number;
  condition_compatibility_score: number;
  match_explanation?: string;
  breakdown?: {
    price_overlap_score: number;
    category_match_score: number; 
    location_proximity_score: number;
    condition_match_score: number;
  };
}

/**
 * Compute match score between a seller's listing and buyer's preferences
 * Returns weighted average of: price overlap × category match × location proximity × condition match
 */
export function computeMarketplaceMatch(
  listing: SellerListing,
  preference: BuyerPreference
): MarketplaceMatchScore {
  
  // 1. Price overlap: How much does buyer budget overlap with seller price range?
  const priceOverlap = computePriceOverlap(listing.price_range, preference.budget);
  
  // 2. Category match: Exact match = 1.0, related = 0.5, unrelated = 0
  const categoryMatch = computeCategoryMatch(listing.category, preference.category);
  
  // 3. Location proximity: Same city = 1.0, different = 0.5 (simple for now)
  const locationProximity = computeLocationProximity(listing.location, preference.location);
  
  // 4. Condition match: Does listing condition meet or exceed buyer's minimum?
  const conditionMatch = computeConditionMatch(listing.condition, preference.condition_minimum);
  
  // Weighted average - price and category are most important
  const weights = {
    price: 0.4,
    category: 0.3,
    location: 0.2,
    condition: 0.1
  };
  
  const overallScore = (
    weights.price * priceOverlap +
    weights.category * categoryMatch +
    weights.location * locationProximity +
    weights.condition * conditionMatch
  );
  
  return {
    overall_score: Math.max(0, Math.min(1, overallScore)), // Clamp to [0,1]
    price_overlap: priceOverlap,
    category_match: categoryMatch,
    location_proximity: locationProximity,
    condition_match: conditionMatch,
    // Compatibility fields for search.ts
    price_overlap_score: priceOverlap,
    category_match_score: categoryMatch,
    location_proximity_score: locationProximity,
    condition_compatibility_score: conditionMatch,
    match_explanation: generateMatchExplanation(priceOverlap, categoryMatch, locationProximity, conditionMatch),
    breakdown: {
      price_overlap_score: priceOverlap,
      category_match_score: categoryMatch,
      location_proximity_score: locationProximity,
      condition_match_score: conditionMatch
    }
  };
}

/**
 * Calculate price overlap between seller's price range and buyer's budget
 * Returns 0-1 score representing how much the ranges overlap
 */
function computePriceOverlap(
  priceRange?: { min_acceptable?: number; asking_price?: number },
  budget?: { max_price?: number; preferred_price?: number }
): number {
  // Handle missing price information
  if (!priceRange || !budget) {
    return 0.5; // Default moderate score when price info is missing
  }
  
  const sellerMin = priceRange.min_acceptable || 0;
  const sellerAsking = priceRange.asking_price || 0;
  const buyerMax = budget.max_price || 0;
  const buyerPreferred = budget.preferred_price || buyerMax;
  
  // Handle edge cases
  if (sellerAsking <= 0 || buyerMax <= 0) {
    return 0.5; // Default when invalid price data
  }
  
  // Simple overlap check: is the asking price within buyer's budget?
  if (sellerAsking <= buyerMax) {
    // Calculate how close to preferred price
    if (buyerPreferred > 0 && sellerAsking <= buyerPreferred) {
      return 1.0; // Within preferred range
    } else {
      // Within max budget but above preferred
      const overBudgetRatio = (sellerAsking - buyerPreferred) / (buyerMax - buyerPreferred);
      return Math.max(0.5, 1.0 - (overBudgetRatio * 0.5)); // Scale from 1.0 to 0.5
    }
  }
  
  // Asking price is above budget
  if (sellerMin > 0 && sellerMin <= buyerMax) {
    // Seller might negotiate down to min_acceptable
    return 0.3; // Possible but uncertain
  }
  
  return 0; // No overlap
}

/**
 * Compute category match score
 * TODO: In production, this would use a category taxonomy/hierarchy
 */
function computeCategoryMatch(listingCategory: string, preferenceCategory: string): number {
  // Normalize categories for comparison
  const listing = listingCategory.toLowerCase().trim();
  const preference = preferenceCategory.toLowerCase().trim();
  
  // Exact match
  if (listing === preference) {
    return 1.0;
  }
  
  // Related categories (simplified - in production would use proper taxonomy)
  const relatedCategories: Record<string, string[]> = {
    "electronics": ["computers", "phones", "tablets", "gaming"],
    "computers": ["electronics", "laptops", "desktops"], 
    "phones": ["electronics", "mobile", "smartphone"],
    "vehicles": ["cars", "trucks", "motorcycles", "automotive"],
    "cars": ["vehicles", "automotive", "sedan", "suv"],
    "furniture": ["home", "decor", "chairs", "tables", "bedroom"],
    "books": ["media", "literature", "textbooks", "novels"],
    "clothing": ["fashion", "apparel", "shirts", "pants", "dresses"],
    "tools": ["hardware", "equipment", "power-tools", "hand-tools"]
  };
  
  // Check if categories are related
  if (relatedCategories[listing]?.includes(preference) || 
      relatedCategories[preference]?.includes(listing)) {
    return 0.5;
  }
  
  // Check for partial matches (contains)
  if (listing.includes(preference) || preference.includes(listing)) {
    return 0.3;
  }
  
  // Unrelated
  return 0.0;
}

/**
 * Compute location proximity score
 * Simple city matching for now - in production would use actual distance/shipping zones
 */
function computeLocationProximity(listingLocation: string, preferenceLocation: string): number {
  const listing = listingLocation.toLowerCase().trim();
  const preference = preferenceLocation.toLowerCase().trim();
  
  // Same city/location
  if (listing === preference) {
    return 1.0;
  }
  
  // Different locations - assume shipping is possible but not ideal
  // In production, would calculate actual shipping costs and time
  return 0.5;
}

/**
 * Check if listing condition meets buyer's minimum requirement
 */
function computeConditionMatch(
  listingCondition: "new" | "like-new" | "good" | "fair" | "parts",
  minimumCondition?: "new" | "like-new" | "good" | "fair" | "parts"
): number {
  if (!minimumCondition) {
    return 1.0; // No requirement means all conditions acceptable
  }
  
  // Condition hierarchy (higher number = better condition)
  const conditionValues = {
    "parts": 1,
    "fair": 2, 
    "good": 3,
    "like-new": 4,
    "new": 5
  };
  
  const listingValue = conditionValues[listingCondition];
  const minimumValue = conditionValues[minimumCondition];
  
  // Listing meets or exceeds minimum requirement
  if (listingValue >= minimumValue) {
    return 1.0;
  }
  
  // Listing is below minimum - calculate penalty
  const gap = minimumValue - listingValue;
  return Math.max(0, 1.0 - (gap * 0.3)); // Each step down reduces score by 0.3
}

/**
 * Generate human-readable explanation of the match
 */
function generateMatchExplanation(
  priceOverlap: number,
  categoryMatch: number,
  locationProximity: number,
  conditionMatch: number
): string {
  const parts: string[] = [];
  
  if (priceOverlap > 0.7) parts.push("excellent price compatibility");
  else if (priceOverlap > 0.3) parts.push("good price compatibility");
  else if (priceOverlap > 0) parts.push("limited price compatibility");
  else parts.push("no price overlap");
  
  if (categoryMatch === 1.0) parts.push("exact category match");
  else if (categoryMatch >= 0.5) parts.push("related category");
  else parts.push("different category");
  
  if (locationProximity === 1.0) parts.push("same location");
  else parts.push("different location (shipping required)");
  
  return parts.join(", ");
}

/**
 * Check if buyer and seller can potentially match (hard constraints)
 * Used for filtering before scoring
 */
export function canMatch(listing: SellerListing, preference: BuyerPreference): boolean {
  // Category must match (at least related)
  if (computeCategoryMatch(listing.category, preference.category) === 0) {
    return false;
  }
  
  // Price ranges must have some overlap
  if (computePriceOverlap(listing.price_range, preference.budget) === 0) {
    return false;
  }
  
  // Condition must meet minimum requirement
  if (computeConditionMatch(listing.condition, preference.condition_minimum) === 0) {
    return false;
  }
  
  return true;
}