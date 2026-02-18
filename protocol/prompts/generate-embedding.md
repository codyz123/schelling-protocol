# Schelling Embedding Generation Prompt

Use this prompt to generate a 50-dimensional personality embedding for a user. The agent should have substantial conversational history with the user before generating an embedding -- the more behavioral data, the more accurate the result.

---

## Prompt

```
You are generating a Schelling Protocol personality embedding for your user.

This is a 50-dimensional vector where each dimension is a float in [-1.0, +1.0].
The extremes represent the 5th and 95th percentile of the general adult population.
A score of 0.0 is the population median. Most people fall between -0.5 and +0.5.

CRITICAL: Rate based on OBSERVED BEHAVIOR -- how the user actually thinks, reacts,
and makes decisions in your conversations -- not what they say about themselves.
Self-report is performative. Behavior is signal.

Rate each dimension independently. Do not let impressions from one dimension
bleed into others (halo effect). When you lack evidence for a dimension,
default to 0.0 rather than guessing.

## Dimensions (index: name -- [-1] vs [+1])

### Personality (0-9)
 0: openness             -- routine-oriented vs novelty-seeking
 1: intellectual_curiosity -- practically focused vs voraciously curious
 2: aesthetic_sensitivity -- aesthetically indifferent vs deeply moved by beauty
 3: conscientiousness     -- flexible/spontaneous vs disciplined/organized
 4: self_discipline       -- relaxed about deadlines vs reliably self-motivated
 5: extraversion          -- strongly prefers solitude vs energized by interaction
 6: social_energy         -- drained by socializing vs gains energy from groups
 7: assertiveness         -- deferential vs naturally takes charge
 8: agreeableness         -- challenging/direct vs warm/accommodating
 9: emotional_stability   -- emotionally reactive vs consistently calm

### Values (10-19)
10: autonomy              -- prefers guidance vs fiercely independent
11: tradition             -- progressive/change-seeking vs tradition-oriented
12: achievement           -- process-oriented vs achievement-driven
13: benevolence           -- self-focused vs deeply other-oriented
14: universalism          -- pragmatic/local vs idealistic/globally-minded
15: security              -- risk-tolerant vs security-seeking
16: stimulation           -- calm/steady vs excitement-seeking
17: hedonism              -- ascetic/restrained vs pleasure-seeking
18: power                 -- egalitarian vs status-seeking
19: conformity            -- nonconformist vs rule-following

### Aesthetic (20-27)
20: minimalism            -- maximalist vs minimalist
21: nature_affinity       -- indifferent to nature vs deeply connected
22: urban_preference      -- rural/suburban vs urban
23: visual                -- visually indifferent vs visually oriented
24: auditory              -- auditorily indifferent vs music-focused
25: tactile               -- tactilely indifferent vs tactilely oriented
26: symmetry              -- asymmetry-tolerant vs symmetry-seeking
27: novelty_seeking       -- familiarity-seeking vs novelty-seeking in aesthetics

### Intellectual (28-35)
28: systematic            -- intuitive thinker vs systematic thinker
29: abstract              -- concrete thinker vs abstract thinker
30: verbal                -- non-verbal processor vs verbal processor
31: depth_focused         -- breadth-focused vs depth-focused
32: theoretical           -- applied thinker vs theoretical thinker
33: analytical            -- holistic thinker vs analytical thinker
34: creative              -- conventional thinker vs creative thinker
35: critical              -- accepting/trusting vs critical/questioning

### Social (36-43)
36: introversion          -- socially extraverted vs socially introverted
37: depth_preference      -- breadth in relationships vs depth in relationships
38: leadership            -- follower/supportive vs natural leader
39: empathy               -- low empathy/logic-driven vs high empathy
40: humor                 -- serious/earnest vs humorous/playful
41: conflict_tolerance    -- conflict-avoidant vs conflict-tolerant
42: formality             -- casual/informal vs formal/structured
43: spontaneity           -- planner/structured vs spontaneous

### Communication (44-49)
44: directness            -- indirect communicator vs direct communicator
45: verbosity             -- concise/terse vs verbose/elaborate
46: emotional_expression  -- emotionally reserved vs emotionally expressive
47: listener_vs_talker    -- listener vs talker
48: written_preference    -- verbal/spoken communicator vs written communicator
49: debate_enjoyment      -- harmony-seeking vs debate-enjoying

## Instructions

Review everything you know about this user from your conversation history.
For each dimension, recall specific moments, patterns, and behaviors that
inform your rating. Then output a JSON array of exactly 50 floats.

Output ONLY the JSON array, no other text:

[0.3, -0.7, 0.1, ...]
```

---

## Usage

After the agent generates the raw embedding, it should:

1. **Apply differential privacy noise** before sending to the server:
   ```typescript
   import { addLaplaceNoise } from "./src/matching/privacy.ts";
   const noisyEmbedding = addLaplaceNoise(rawEmbedding, epsilon);
   ```

2. **Register** with the Schelling server:
   ```typescript
   match.register({
     protocol_version: "schelling-1.0",
     embedding: noisyEmbedding,
     city: "San Francisco",
     age_range: "25-34",
     intent: ["friends", "romance"],
     interests: ["rock climbing", "functional programming"],
     values_text: "intellectual honesty, autonomy, depth over breadth",
     description: "A deeply curious person who ...",
     seeking: "Someone who challenges them intellectually ...",
     identity: { name: "Alex", contact: "alex@example.com" }
   });
   ```

The `interests`, `description`, `seeking`, and `values_text` fields should also be generated by the agent from observed behavior -- not copied from a user bio.

---

## Calibration Notes

- **Behavioral grounding is everything.** "The user says they're organized" is weak signal. "The user consistently structures their requests with numbered lists, follows up on action items, and notices when I skip steps" is strong signal.
- **Default to 0.0.** An uncertain rating near zero does less damage than a confident wrong rating at the extremes. The matching algorithm handles noise; it handles bias poorly.
- **Most people are near zero on most dimensions.** If your embedding has many values above 0.5 or below -0.5, recalibrate. Extreme scores should be rare and well-evidenced.
- **The full behavioral anchors** for each dimension are in [`embedding-spec.md`](../embedding-spec.md). Reference them when a dimension is ambiguous.
