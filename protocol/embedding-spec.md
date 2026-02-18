# Schelling Protocol -- Embedding Specification v1.0

## Overview

The Schelling embedding is a 50-dimensional personality vector. Each dimension is a float in the range [-1.0, +1.0], where the extremes are anchored at the 5th and 95th percentiles of the general adult population. A score of 0.0 represents the population median for that dimension. Most individuals will have scores between -0.5 and +0.5 on most dimensions; scores beyond that range indicate meaningfully unusual placement.

The embedding is designed to capture durable behavioral tendencies -- not momentary states, not self-reported preferences, but observable patterns in how a person thinks, communicates, and makes decisions over time.

---

# Dimension Reference

---

## Category: Personality (indices 0--9)

---

## 0. openness

### -1.0 -- Routine-oriented, uncomfortable with ambiguity

Prefers familiar restaurants, predictable routines, and well-trodden paths. When presented with an unfamiliar situation, the first instinct is to find a known framework to apply. Feels genuine discomfort when plans are undefined or when asked to "just see what happens." Vacations are planned in detail; spontaneous detours feel stressful rather than exciting.

### 0.0 -- Balances novelty and familiarity

Enjoys trying new things occasionally but also appreciates comfortable routines. Can handle ambiguity when necessary without strong feelings either way.

### +1.0 -- Actively seeks novel experiences

Gravitates toward the unfamiliar -- new cuisines, unfamiliar neighborhoods, genres they've never tried. Boredom sets in quickly with repetition. Finds ambiguity energizing rather than threatening. Likely to rearrange furniture on a whim, take an unplanned trip, or pick up an entirely new hobby every few months. Reads widely across unrelated fields for the sheer pleasure of encountering new ideas.

---

## 1. intellectual_curiosity

### -1.0 -- Practically focused, learns what is needed

Learns skills and information when there is a clear, immediate use for them. Does not read for pleasure about topics outside their domain. When a question arises that is not directly relevant to a task at hand, they move on rather than investigating. Finds "trivia for its own sake" uninteresting and would rather spend time on something productive.

### 0.0 -- Moderately curious

Will follow an interesting thread if it crosses their path, but does not actively seek out new intellectual terrain. Reads occasionally on varied topics.

### +1.0 -- Voraciously curious across domains

Maintains a reading list that spans history, science, philosophy, and obscure subcultures. Regularly falls into multi-hour research spirals triggered by a single offhand question. Asks "why" and "how" reflexively in conversation. Subscribes to journals and podcasts outside their professional field. The browser has 40 tabs open on unrelated topics and they can explain why each one is fascinating.

---

## 2. aesthetic_sensitivity

### -1.0 -- Indifferent to aesthetic details

Does not notice when a room has been redecorated. Clothing choices are driven entirely by comfort and function. Can work happily in a visually cluttered or drab environment. When others remark on a beautiful sunset or a well-designed object, the reaction is polite indifference. Finds discussions about typefaces, color palettes, or interior design bewildering.

### 0.0 -- Notices beauty occasionally

Appreciates a striking view or a well-made object when it is pointed out, but does not seek out aesthetic experiences or feel strongly about design choices in daily life.

### +1.0 -- Deeply moved by art, design, and beauty

Stops mid-sentence when light hits a building a certain way. Spends significant time choosing materials, colors, and arrangements in personal spaces. A poorly kerned sign or a clashing color combination causes genuine, if mild, distress. Seeks out museums, galleries, and natural landscapes specifically for the sensory experience. Can describe in detail why a particular piece of music or architecture resonates emotionally.

---

## 3. conscientiousness

### -1.0 -- Flexible, spontaneous, loose with plans

Desk is cluttered with no discernible filing system, yet somehow things get found when needed. Plans are made loosely and often changed at the last minute. Deadlines are treated as approximate targets. Projects may be started with enthusiasm and left partially finished when something more interesting comes along. Thrives in unstructured environments and finds rigid processes suffocating.

### 0.0 -- Moderately organized

Keeps important commitments and maintains basic organizational systems, but does not optimize for efficiency or maintain detailed plans for every area of life.

### +1.0 -- Highly disciplined and systematic

Maintains detailed task lists, calendars, and filing systems. Inbox is at zero or close to it. Projects are broken into milestones with clear deliverables. Rarely misses a deadline and feels genuine discomfort when commitments slip. Prepares for meetings in advance, follows up on action items, and keeps meticulous records. The car is clean, the pantry is labeled, the morning routine runs on schedule.

---

## 4. self_discipline

### -1.0 -- Relaxed about deadlines, procrastinates

Routinely starts tasks close to the deadline. Knows what should be done but finds it difficult to begin without external pressure. Will choose a pleasant activity over an unpleasant-but-important one almost every time. Gym memberships go unused; books are started but not finished; resolutions fade within days. Not distressed by this pattern -- it feels natural.

### 0.0 -- Meets most commitments

Generally follows through on obligations, though some tasks require effort to start. Procrastinates occasionally but not to the point of significant consequences.

### +1.0 -- Reliably self-motivated

Sets personal goals and hits them without external accountability. Can sit down and do unpleasant but necessary work without bargaining or delay. Maintains long-term habits -- exercise, study, creative practice -- through periods when motivation is low. Others describe them as "disciplined" or "driven." When they say they will do something, it gets done, even when no one is watching.

---

## 5. extraversion

### -1.0 -- Strongly prefers solitude

A perfect weekend involves no social obligations. Avoids parties and large gatherings; when forced to attend, gravitates to the quietest corner or leaves early. Finds small talk genuinely draining. Prefers to communicate by text or email rather than phone or video. Needs significant alone time after even brief social interactions to feel restored. One or two close friends is plenty.

### 0.0 -- Balanced social and alone time

Enjoys socializing in moderate doses and also values time alone. Neither seeks nor avoids group activities.

### +1.0 -- Energized by social interaction

Feels restless and understimulated when alone for too long. Actively organizes social events, calls friends spontaneously, and strikes up conversations with strangers. Thinks out loud and processes ideas through dialogue. A large, lively gathering is invigorating rather than exhausting. Feels most "like themselves" when surrounded by people.

---

## 6. social_energy

### -1.0 -- Drained by extended socializing

After a two-hour dinner party, needs to sit in a quiet room and recover. Can perform socially when needed but treats it as an expenditure of finite energy. Back-to-back social events across a weekend leave them genuinely exhausted by Monday. Cancels plans not out of disinterest but because the social battery is empty.

### 0.0 -- Moderate social stamina

Can handle a full day of social interaction without severe fatigue, but appreciates downtime afterward. Energy levels are not strongly affected in either direction by socializing.

### +1.0 -- Gains energy from groups

Returns from a crowded event feeling more alert and alive than when they arrived. Long stretches of isolation produce restlessness and low mood. Prefers coworking spaces to solo offices. Will seek out a coffee shop or call a friend when energy dips, because being around people is genuinely restorative.

---

## 7. assertiveness

### -1.0 -- Deferential, avoids confrontation

In a group decision, goes along with the majority even when privately disagreeing. Finds it difficult to say no to requests. Avoids raising objections in meetings, preferring to voice concerns privately afterward -- or not at all. When a waiter brings the wrong order, eats it rather than sending it back. Uncomfortable giving negative feedback even when it is clearly warranted.

### 0.0 -- Situationally assertive

Speaks up when something matters significantly but does not feel the need to weigh in on every decision. Can say no when necessary without great difficulty.

### +1.0 -- Naturally takes charge

Speaks first in ambiguous situations. Comfortable making decisions for a group and accepting responsibility for the outcome. Gives direct feedback without agonizing over phrasing. Negotiates assertively -- for salary, for project scope, for a table at a restaurant. Others naturally look to them when a decision needs to be made. Does not wait for permission to act.

---

## 8. agreeableness

### -1.0 -- Challenging, direct, skeptical

Default response to a new claim is doubt. Asks pointed questions that others might consider rude. Prioritizes truth and accuracy over social harmony. Will disagree openly in a group setting and press the point even when it creates tension. Does not soften feedback to protect feelings. Finds excessive politeness inefficient and mildly irritating. Trust is earned slowly.

### 0.0 -- Balanced warmth and skepticism

Generally warm and cooperative, but willing to push back when something seems wrong. Adjusts tone based on context.

### +1.0 -- Warm, accommodating, trusting

Gives people the benefit of the doubt by default. Goes out of their way to make others comfortable -- offers their seat, remembers dietary restrictions, checks in on friends without being asked. Finds conflict unpleasant and will often concede a point to maintain harmony. Takes people at their word. Naturally attuned to the emotional temperature of a room and adjusts behavior to smooth any friction.

---

## 9. emotional_stability

### -1.0 -- Emotionally reactive, feels intensely

A critical email can derail the entire afternoon. Highs are very high and lows are very low. Stress manifests physically -- tight chest, insomnia, loss of appetite. Rumination is common; a difficult conversation replays on loop for days. Sensitive to perceived slights. Emotional state is visible to others and shifts quickly in response to events.

### 0.0 -- Moderate emotional range

Experiences the full range of emotions but recovers from setbacks in a reasonable timeframe. Stress is manageable under normal circumstances.

### +1.0 -- Consistently calm and even-keeled

Receives bad news with the same composure as good news. Rarely raises their voice or visibly panics. Colleagues describe them as "unflappable." Under crisis conditions, they become more focused rather than more anxious. Does not take criticism personally. Emotional baseline is steady; others find their presence stabilizing. May occasionally be perceived as detached or difficult to read.

---

## Category: Values (indices 10--19)

---

## 10. autonomy

### -1.0 -- Prefers guidance and structure

Feels most comfortable with clear instructions, defined processes, and regular check-ins from a manager or mentor. Ambiguous assignments produce anxiety. Prefers roles where expectations are explicit and success criteria are measurable. When faced with an open-ended problem, the first instinct is to ask someone more experienced what to do.

### 0.0 -- Balanced

Functions well with or without guidance, adapting to whatever the situation provides. Neither resents structure nor craves it.

### +1.0 -- Fiercely independent

Resists micromanagement viscerally. Prefers to define their own goals, methods, and timelines. May chafe at organizational policies that feel arbitrary. Would rather fail on their own terms than succeed by following someone else's playbook. Gravitates toward freelance work, entrepreneurship, or roles with high autonomy. Takes unsolicited advice as mildly intrusive.

---

## 11. tradition

### -1.0 -- Progressive, change-seeking

Actively questions inherited customs and institutions. Finds "we've always done it this way" to be a reason to change, not a reason to continue. Early adopter of new social norms, technologies, and cultural shifts. May feel impatient with ceremonies, rituals, or conventions that seem to serve no functional purpose.

### 0.0 -- Balanced

Respects tradition where it seems to serve a purpose but is open to change when the case is compelling. Neither sentimental about the past nor dismissive of it.

### +1.0 -- Values tradition and continuity

Finds meaning in rituals, holidays, and inherited practices. Believes that established institutions carry hard-won wisdom that should not be discarded lightly. Prefers gradual, tested change over radical disruption. May feel uneasy when longstanding norms are abandoned quickly. Likely to maintain family traditions, attend religious services, or participate in community customs.

---

## 12. achievement

### -1.0 -- Process-oriented, indifferent to status

Works for the intrinsic satisfaction of the task, not for recognition or advancement. Titles, awards, and rankings hold little motivational power. Would rather do interesting work at a lower rank than boring work at a higher one. Does not compare their accomplishments to those of peers. Finds competitive environments draining rather than motivating.

### 0.0 -- Balanced

Appreciates recognition and accomplishment but does not orient life around them. Can be motivated by both the process and the outcome.

### +1.0 -- Driven by accomplishment

Sets ambitious goals and tracks progress toward them. Derives deep satisfaction from measurable achievement -- promotions, completed projects, personal records. Compares their trajectory to peers and feels motivated (not threatened) by high performers. Likely to sacrifice leisure time for professional advancement. A finished project is satisfying; an unfinished one gnaws at them.

---

## 13. benevolence

### -1.0 -- Self-focused, pragmatic about helping

Helps others when it is convenient or strategically useful but does not go out of their way to do so. Believes individuals are primarily responsible for their own outcomes. Does not feel guilty about prioritizing personal needs. Charitable giving is modest and transactional rather than emotionally driven.

### 0.0 -- Balanced

Cares about others and helps when the opportunity arises naturally, but does not organize life around service to others.

### +1.0 -- Deeply other-oriented

Spends significant time and energy helping people with no expectation of return. Remembers small details about friends' struggles and follows up unprompted. Volunteers regularly, donates meaningfully, or works in a helping profession out of genuine calling. Feels others' pain as a motivating force rather than a distant abstraction. May neglect personal needs to attend to others.

---

## 14. universalism

### -1.0 -- Pragmatic and local-focused

Prioritizes the well-being of family, community, and immediate circle over abstract global concerns. Skeptical of large-scale social engineering. Believes charity begins at home. May find global activism naive or performative. Makes decisions based on concrete, local consequences rather than broad principles.

### 0.0 -- Balanced

Cares about both local and global concerns, engaging with each as circumstances warrant. Neither dismissive of broader causes nor consumed by them.

### +1.0 -- Idealistic, globally-minded

Thinks in terms of systemic impact and global well-being. Concerned about climate change, inequality, and justice at a civilizational scale. Consumer choices are influenced by ethical considerations -- fair trade, sustainability, labor practices. Engages with news and politics through a lens of universal human welfare. May feel personally responsible for problems far removed from daily life.

---

## 15. security

### -1.0 -- Risk-tolerant, embraces uncertainty

Comfortable making decisions with incomplete information. Willing to leave a stable job for an uncertain opportunity. Invests aggressively, travels without detailed plans, and does not maintain large emergency funds. Finds excessive caution boring. Believes that most risks are overestimated and that the cost of inaction is underappreciated.

### 0.0 -- Balanced

Takes calculated risks when the potential reward justifies them, but maintains reasonable safety nets. Neither reckless nor overly cautious.

### +1.0 -- Security-seeking, risk-averse

Maintains substantial savings, insurance, and contingency plans. Researches decisions exhaustively before committing. Prefers stable employment over higher-paying but uncertain alternatives. Locks doors, backs up files, and reads the fine print. Finds uncertainty genuinely uncomfortable and takes active steps to reduce it. May forgo potentially rewarding opportunities because the downside feels too threatening.

---

## 16. stimulation

### -1.0 -- Calm and steady, avoids excitement

Prefers a predictable, even-keeled life. Does not seek adrenaline, novelty for its own sake, or intense sensory experiences. A quiet evening at home is genuinely preferable to a night out. Finds roller coasters, horror films, and surprise parties more stressful than fun. Values tranquility and steadiness as positive conditions, not as the absence of something better.

### 0.0 -- Balanced

Enjoys excitement in moderate doses but does not need constant stimulation. Can appreciate both a calm evening and an adventurous weekend.

### +1.0 -- Excitement-seeking

Boredom is the enemy. Seeks out intense experiences -- travel, extreme sports, loud music, spicy food, late nights. Gravitates toward environments with high energy and unpredictability. Feels most alive when something unexpected is happening. May struggle with routine tasks or long periods of low stimulation. Plans vacations around activities, not relaxation.

---

## 17. hedonism

### -1.0 -- Ascetic, restrained

Derives little motivation from physical pleasure or comfort. Eats simply, dresses plainly, lives modestly even when resources permit otherwise. Suspicious of luxury as a value. May practice deliberate austerity -- cold showers, fasting, spartan living spaces. Finds indulgence mildly distasteful or at least uninteresting.

### 0.0 -- Balanced

Enjoys comfort and pleasure without organizing life around them. Indulges occasionally without guilt but does not prioritize sensory experience over other values.

### +1.0 -- Pleasure-seeking

Invests significantly in comfort, food, travel, and sensory experience. Chooses the nicer hotel, the better wine, the softer fabric. Believes life is meant to be enjoyed and that denying pleasure without reason is foolish. Spends freely on experiences. Physical comfort is not a luxury but a baseline expectation. A bad meal at an expensive restaurant is a genuine disappointment.

---

## 18. power

### -1.0 -- Egalitarian, avoids hierarchy

Uncomfortable with status differentials and actively works to flatten them. Uses first names with everyone, regardless of rank. Dislikes being in charge and finds the exercise of authority over others distasteful. Suspicious of people who seek power or display wealth. Prefers consensus-based decision-making even when it is slower.

### 0.0 -- Balanced

Accepts hierarchy where it serves a functional purpose but does not seek status for its own sake. Comfortable leading or following as the situation requires.

### +1.0 -- Status-seeking, competitive

Aware of social hierarchies and motivated to rise within them. Tracks career progression, compensation, and visible markers of success. Enjoys competition and performs better when something is at stake. Gravitates toward leadership roles and the influence they confer. May make decisions partly based on how they will be perceived by others. Finds winning deeply satisfying.

---

## 19. conformity

### -1.0 -- Nonconformist, rebels against norms

Instinctively questions rules and conventions. Dresses, speaks, and behaves in ways that may diverge from expectations -- not performatively, but because external norms feel irrelevant to personal choices. Finds groupthink alarming. May have left institutions, communities, or careers because they felt too constraining. "Because everyone does it" is a reason to reconsider, not a reason to comply.

### 0.0 -- Balanced

Follows social norms when they make sense and deviates when they do not, without strong feelings either way. Neither a rule-follower nor a rule-breaker by temperament.

### +1.0 -- Rule-following, conventional

Follows established rules, norms, and expectations reliably. Feels uncomfortable when others break social conventions. Believes that rules exist for good reasons and that exceptions should be rare. Dresses appropriately for context, arrives on time, and respects institutional authority. May feel anxious when in an environment where the norms are unclear or unenforced.

---

## Category: Aesthetic (indices 20--27)

---

## 20. minimalism

### -1.0 -- Maximalist, ornate preferences

Living spaces are layered and dense -- patterned textiles, crowded bookshelves, objects collected over years. Finds bare white walls cold and unwelcoming. Decorates with color, texture, and abundance. A "clean" aesthetic feels sterile. Prefers rich, complex visual environments and may extend this to clothing, food presentation, and digital interfaces.

### 0.0 -- Balanced

Appreciates both simplicity and richness depending on context. Neither drawn to austerity nor to visual abundance as a default.

### +1.0 -- Minimalist, clean lines

Owns few possessions and keeps surfaces clear. Finds visual clutter distracting and stressful. Prefers monochrome or muted palettes, simple geometric forms, and generous negative space. Regularly declutters. A well-organized, spare room feels like a sanctuary. Likely drawn to Scandinavian design, Japanese aesthetics, or modernist architecture.

---

## 21. nature_affinity

### -1.0 -- Indifferent to nature

Can spend weeks indoors without feeling the lack. Does not notice seasonal changes, birdsong, or weather beyond its practical implications. Parks and hiking trails hold no particular appeal. Would not choose a window seat for the view. Nature documentaries are boring.

### 0.0 -- Balanced

Enjoys nature when encountered but does not actively seek it out. A walk in the park is pleasant; a weekend indoors is also fine.

### +1.0 -- Deeply connected to nature

Needs regular time outdoors to feel grounded. Notices shifts in season, light quality, and local wildlife. Plans activities around natural settings -- hiking, gardening, swimming in open water. Feels physically and emotionally restored by time in forests, mountains, or near water. May keep many houseplants, maintain a garden, or orient travel around natural landscapes.

---

## 22. urban_preference

### -1.0 -- Rural or suburban preference

Finds dense cities overwhelming -- too loud, too crowded, too fast. Prefers neighborhoods with yards, quiet streets, and access to open space. Values privacy, low density, and proximity to nature over walkability and cultural amenities. Commuting by car is a reasonable trade-off for peace and space.

### 0.0 -- Balanced

Comfortable in both urban and non-urban settings. Appreciates the energy of a city and the calm of the countryside without strongly preferring either.

### +1.0 -- Urban preference

Thrives in dense, walkable neighborhoods with restaurants, cultural venues, and street life within walking distance. Finds suburban quiet boring and rural isolation unthinkable. Enjoys the ambient energy of crowds, traffic, and visible human activity. Prefers public transit to driving. A good city block is more stimulating than a mountain trail.

---

## 23. visual

### -1.0 -- Visually indifferent

Does not notice or care about the visual presentation of things. A document's content matters more than its formatting. Clothing choices are functional. Can work in any visual environment without distraction or preference. Charts and diagrams are no more helpful than text.

### 0.0 -- Balanced

Notices visual presentation when it is especially good or bad, but it does not strongly influence decisions or emotional states.

### +1.0 -- Visually oriented

Thinks in images, diagrams, and spatial relationships. Strongly affected by color, layout, and visual design. Likely to sketch ideas, use whiteboards, or choose products based partly on how they look. Finds ugly interfaces genuinely harder to use. Notices font choices, color palettes, and compositional details that others miss.

---

## 24. auditory

### -1.0 -- Auditorily indifferent

Music is background noise, neither sought nor avoided. Does not notice ambient sounds or acoustic qualities of spaces. Can concentrate equally well in silence or in a noisy room. Does not have strong preferences about music genres, sound design, or audio quality.

### 0.0 -- Balanced

Enjoys music and notices sound when it is particularly good or bad, but does not organize life around auditory experience.

### +1.0 -- Auditorily oriented, music-focused

Music is central to daily life -- carefully curated playlists, live concerts, high-quality headphones. Notices acoustic properties of rooms. Ambient noise levels significantly affect concentration and mood. Can identify instruments in a mix, notices when a recording is poorly mastered, and finds certain sounds physically pleasurable or aversive. Likely to associate memories with songs.

---

## 25. tactile

### -1.0 -- Tactilely indifferent

Does not notice or care about the feel of materials. Clothing texture, furniture surfaces, and paper weight are non-factors in purchasing decisions. Can use any keyboard, sit in any chair, and sleep on any pillow without preference.

### 0.0 -- Balanced

Notices particularly pleasant or unpleasant textures but does not make decisions primarily on tactile grounds.

### +1.0 -- Tactilely oriented

Runs hands over fabrics in stores. Chooses clothing partly by feel. Notices the weight of a pen, the click of a keyboard, the texture of a book's pages. Finds certain materials -- wood, linen, stone -- viscerally satisfying. Physical comfort in furniture, clothing, and bedding is a genuine priority. May be particular about temperature, fabric blends, or the handle of tools.

---

## 26. symmetry

### -1.0 -- Asymmetry-tolerant

Comfortable with irregular, organic, or deliberately asymmetric arrangements. A slightly crooked picture frame does not register as a problem. Finds overly symmetrical environments rigid or artificial. Prefers natural, imperfect forms over geometric precision.

### 0.0 -- Balanced

Notices extreme asymmetry but does not feel compelled to correct minor irregularities. Appreciates both orderly and organic arrangements.

### +1.0 -- Symmetry-seeking, orderly

Straightens picture frames automatically. Arranges objects on desks and shelves with deliberate alignment. Finds visual disorder mildly distressing. Prefers grid layouts, even spacing, and balanced compositions. A misaligned element in a document or interface feels wrong in a way that is difficult to ignore.

---

## 27. novelty_seeking

### -1.0 -- Familiarity-seeking in aesthetics

Returns to the same music, films, and visual styles repeatedly. Finds comfort in the known. Redecorates rarely, if ever. Orders "the usual" at restaurants. New aesthetic trends are viewed with indifference or mild suspicion until they become established.

### 0.0 -- Balanced

Mixes familiar favorites with occasional new discoveries. Open to new aesthetic experiences without actively pursuing them.

### +1.0 -- Novelty-seeking in aesthetics

Actively hunts for new music, art, design, and cultural experiences. Bored by repetition in aesthetic domains. Follows emerging artists, subscribes to design blogs, and seeks out unfamiliar cuisines. Redecorates and reinvents personal style periodically. Finds aesthetic stagnation -- listening to the same playlist for months, wearing the same outfits -- mildly depressing.

---

## Category: Intellectual (indices 28--35)

---

## 28. systematic

### -1.0 -- Intuitive thinker

Makes decisions based on gut feeling, pattern recognition, and accumulated experience rather than explicit analysis. Arrives at conclusions quickly without being able to articulate every step. Finds rigid methodologies constraining. May produce excellent judgments but struggle to explain the reasoning to others. Trusts hunches.

### 0.0 -- Balanced

Uses both intuitive and systematic approaches depending on the problem. Can follow a structured method when needed but does not default to one.

### +1.0 -- Systematic thinker

Approaches problems with explicit frameworks, checklists, and step-by-step reasoning. Documents processes and creates systems for recurring tasks. Uncomfortable making decisions without a clear methodology. Prefers to externalize thinking in spreadsheets, diagrams, or decision matrices. Finds unstructured brainstorming frustrating without a process to capture and evaluate ideas.

---

## 29. abstract

### -1.0 -- Concrete thinker

Thinks in terms of specific examples, tangible objects, and practical scenarios. Finds abstract theoretical discussions ungrounding and unhelpful. Prefers to understand concepts through real-world applications rather than formal definitions. Asks "can you give me an example?" frequently. Distrusts arguments that cannot be tied to observable reality.

### 0.0 -- Balanced

Moves between abstract and concrete thinking as the situation demands. Comfortable with theory when it serves a practical end.

### +1.0 -- Abstract thinker

Naturally gravitates toward principles, patterns, and generalizations. Enjoys working with formal systems, mathematical structures, and philosophical frameworks. Can hold multiple levels of abstraction simultaneously and move between them fluidly. Finds concrete details less interesting than the underlying structure they reveal. May frustrate practical colleagues by "going meta" in discussions.

---

## 30. verbal

### -1.0 -- Non-verbal processor

Thinks in images, spatial relationships, physical intuitions, or raw pattern recognition rather than words. Finds it difficult to articulate complex ideas verbally and prefers to demonstrate, draw, or build. Internal monologue is sparse or absent. May be highly capable but underperform in interview or presentation settings that reward verbal fluency.

### 0.0 -- Balanced

Can think and communicate effectively in both verbal and non-verbal modes. Neither strongly favors words nor struggles with them.

### +1.0 -- Verbal processor

Thinks in words and sentences. Internal monologue is constant and detailed. Processes ideas by writing or talking about them -- understanding deepens through articulation. Reads voraciously and writes fluently. Chooses words carefully and notices when others do not. Likely to journal, draft emails multiple times, or talk through problems out loud.

---

## 31. depth_focused

### -1.0 -- Breadth-focused, generalist

Prefers to know a little about many things rather than a lot about one thing. Gets restless when forced to specialize for too long. Connects ideas across domains and finds narrow expertise limiting. Career may span multiple fields. Reads widely rather than deeply. Finds the term "generalist" flattering.

### 0.0 -- Balanced

Maintains some areas of deep knowledge alongside broad general knowledge. Comfortable with both specialization and breadth depending on the context.

### +1.0 -- Depth-focused, specialist

Prefers to go deep into a single topic until it is thoroughly understood. Finds surface-level knowledge unsatisfying. May spend years mastering a narrow domain and find the depth itself rewarding. Becomes the go-to expert on specific subjects. Reads the footnotes, the primary sources, and the critiques of the critiques. Breadth-first approaches feel shallow.

---

## 32. theoretical

### -1.0 -- Applied thinker

Motivated by practical problems with real-world consequences. Finds pure theory uninteresting unless it leads to something usable. Asks "so what?" when presented with abstract models. Prefers building, testing, and iterating over contemplating and modeling. Values knowledge that can be directly applied.

### 0.0 -- Balanced

Appreciates both theory and application. Can engage with abstract models when they illuminate practical problems.

### +1.0 -- Theoretical thinker

Drawn to foundational questions, formal models, and first-principles reasoning. Finds the elegance of a theory as satisfying as its utility. May spend time on problems with no immediate practical application because the intellectual structure is interesting. Reads academic papers for pleasure. Prefers understanding "why" something works over simply knowing "how" to use it.

---

## 33. analytical

### -1.0 -- Holistic thinker

Sees the whole before the parts. Understands systems by sensing their overall character rather than decomposing them into components. Trusts impressions formed from the gestalt of a situation. Finds reductionist analysis inadequate for capturing what matters. May struggle with highly structured, sequential reasoning but excels at synthesizing large amounts of unstructured information.

### 0.0 -- Balanced

Can decompose problems into parts and also perceive the whole. Switches between analytical and holistic modes as needed.

### +1.0 -- Analytical thinker

Instinctively breaks problems into component parts and examines each one. Looks for root causes, isolates variables, and tests hypotheses. Finds it difficult to accept conclusions without understanding the chain of reasoning. Prefers data and evidence over impressions. Spreadsheets, logic trees, and structured arguments feel natural. May over-analyze decisions that others make quickly from intuition.

---

## 34. creative

### -1.0 -- Conventional thinker

Prefers proven approaches and established solutions. When faced with a problem, looks for existing precedent rather than inventing from scratch. Finds brainstorming sessions unproductive and prefers to evaluate concrete options. Reliability and predictability are valued over originality. "Don't reinvent the wheel" is a guiding principle.

### 0.0 -- Balanced

Can generate novel ideas when needed but does not feel compelled to reinvent established approaches. Comfortable with both creative and conventional problem-solving.

### +1.0 -- Creative thinker

Generates unusual ideas naturally and finds conventional solutions unsatisfying when a novel one is possible. Makes unexpected connections between unrelated domains. Enjoys the process of invention -- the blank page is exciting, not intimidating. May produce work that others initially find confusing but later recognize as original. Restless when constrained to execute someone else's vision without room for creative input.

---

## 35. critical

### -1.0 -- Accepting, trusting

Takes claims at face value and gives arguments the benefit of the doubt. Does not instinctively look for flaws in reasoning or evidence. Finds persistent questioning tiresome. Comfortable deferring to authority and expertise. May be swayed by confident presentation regardless of underlying rigor.

### 0.0 -- Balanced

Evaluates claims with reasonable scrutiny without defaulting to either acceptance or skepticism. Questions claims that seem dubious but does not interrogate everything.

### +1.0 -- Critical, questioning

Default stance toward any claim is gentle skepticism. Looks for logical fallacies, unsupported assumptions, and missing evidence reflexively. Asks "how do you know that?" and "what's the evidence?" frequently. Finds peer review, fact-checking, and adversarial testing essential rather than annoying. May be perceived as argumentative by those who prefer their ideas accepted without challenge.

---

## Category: Social (indices 36--43)

---

## 36. introversion

### -1.0 -- Socially extraverted

Seeks out social situations as a primary source of fulfillment. Feels incomplete without regular, substantial social interaction. Makes friends quickly and maintains a large, active social network. Processes emotions and ideas through conversation. Silence in a group feels uncomfortable and is quickly filled.

### 0.0 -- Balanced

Comfortable in social settings and also content alone. Social interaction is enjoyed but not required for well-being.

### +1.0 -- Socially introverted

Rich inner life that requires solitude to access. Prefers one-on-one conversations to group dynamics. Thinks before speaking and may appear quiet in meetings while processing deeply. Finds networking events performative and exhausting. Chooses activities that can be done alone or with a close companion. A canceled social plan is a relief, not a disappointment.

---

## 37. depth_preference

### -1.0 -- Breadth in relationships

Maintains a wide social circle with many acquaintances. Enjoys meeting new people and keeping connections light and numerous. Finds deep, exclusive relationships claustrophobic. Prefers variety in social interactions -- different friends for different activities. Not bothered by surface-level conversations and finds them enjoyable in their own right.

### 0.0 -- Balanced

Maintains a mix of close friends and broader acquaintances. Values both deep conversations and light social interaction.

### +1.0 -- Depth in relationships

Invests heavily in a small number of close relationships. Prefers long, substantive conversations over brief social exchanges. Feels unfulfilled by interactions that stay at the surface level. Loyal and attentive to close friends; may neglect broader social maintenance. A single deep friendship is worth more than a dozen casual ones. Takes time to warm up to new people but bonds strongly once connected.

---

## 38. leadership

### -1.0 -- Follower, supportive

Prefers to contribute within a structure defined by someone else. Finds the responsibility of leadership stressful and unrewarding. Happiest when the direction is clear and they can focus on execution. Does not seek the spotlight. Supports leaders effectively and takes pride in enabling others' visions rather than imposing their own.

### 0.0 -- Balanced

Can lead or follow depending on the situation. Takes initiative when needed but does not seek leadership roles for their own sake.

### +1.0 -- Natural leader

Gravitates toward positions of responsibility. Enjoys setting direction, making decisions, and organizing others. Feels underutilized in purely execution-oriented roles. Others naturally defer to them in group settings. Comfortable with the visibility, accountability, and conflict that leadership entails. May feel frustrated when led poorly and instinctively start steering.

---

## 39. empathy

### -1.0 -- Low empathy, logic-driven

Makes decisions based on reasoning and evidence, largely uninfluenced by others' emotional states. Does not naturally sense what others are feeling. May miss social cues that signal distress, excitement, or discomfort. Finds emotional appeals unconvincing. Can appear cold or insensitive, though may simply be processing the world through a different modality.

### 0.0 -- Balanced

Picks up on others' emotional states with reasonable accuracy and incorporates that information into decisions without being overwhelmed by it.

### +1.0 -- High empathy

Feels others' emotions almost physically. Can read a room's emotional state within seconds of entering. Adjusts behavior instinctively to match others' needs -- softening tone with someone who is fragile, energizing someone who is low. Finds it difficult to watch others suffer. May absorb others' stress or sadness, making it hard to maintain boundaries. Excellent at anticipating what others need before they ask.

---

## 40. humor

### -1.0 -- Serious, earnest

Approaches life and conversation with gravity. Rarely jokes in professional settings and finds humor in serious discussions inappropriate or distracting. Earnestness is a core value -- says what they mean without ironic distance. May appreciate humor in explicitly comedic contexts but does not use it as a social tool or coping mechanism.

### 0.0 -- Balanced

Uses humor naturally in appropriate contexts without relying on it. Can be serious when needed and light when the mood calls for it.

### +1.0 -- Humorous, playful

Uses humor as a primary social tool and coping mechanism. Cracks jokes in meetings, finds the absurd in everyday situations, and lightens tense moments with well-timed wit. Values playfulness in relationships and gravitates toward people who banter. Internal monologue is frequently funny. May use humor to deflect from vulnerability or to make difficult truths more palatable.

---

## 41. conflict_tolerance

### -1.0 -- Conflict-avoidant

Feels physical discomfort -- tight stomach, racing heart -- when conflict arises. Will go to significant lengths to avoid disagreements, including conceding points they believe are correct. May leave issues unaddressed for months rather than risk a confrontation. Finds watching others argue stressful even as a bystander. Harmony is not just a preference but a felt need.

### 0.0 -- Balanced

Can handle conflict when necessary without seeking it out. Addresses disagreements when they matter but does not enjoy the process.

### +1.0 -- Conflict-tolerant

Views disagreement as a natural and often productive part of working and living with others. Does not experience conflict as inherently threatening. Can engage in heated debate and return to friendly terms immediately afterward. Willing to raise difficult topics that others avoid. Finds environments where dissent is suppressed stifling and potentially dangerous.

---

## 42. formality

### -1.0 -- Casual, informal

Uses first names immediately, cracks jokes in professional settings, and writes emails in sentence fragments. Finds formal dress codes, rigid meeting structures, and hierarchical address systems unnecessary and slightly absurd. Prefers "let's figure this out" over "let's follow the process." Communication style is conversational regardless of audience or context.

### 0.0 -- Balanced

Adjusts formality to context -- more formal in professional settings, more casual with friends. Neither stiff nor inappropriately casual.

### +1.0 -- Formal, structured

Maintains clear boundaries between professional and personal interaction. Uses proper titles and greetings. Follows established protocols for meetings, correspondence, and social occasions. Finds excessive informality unprofessional or disrespectful. Dresses with intention. Written communication is complete, grammatically correct, and appropriately addressed.

---

## 43. spontaneity

### -1.0 -- Planner, structured

Prefers to know what is happening in advance. Calendars are detailed and commitments are made well ahead of time. Surprise plans cause stress rather than excitement. Travels with itineraries. Dislikes last-minute changes. Derives comfort and confidence from preparation and predictability.

### 0.0 -- Balanced

Plans important things in advance but is comfortable with spontaneous changes. Neither rigid about schedules nor allergic to planning.

### +1.0 -- Spontaneous

Acts on impulse and enjoys the freedom of an unstructured day. Finds rigid plans suffocating and often deviates from them anyway. "Let's just go" is a preferred approach to travel, weekends, and social plans. Thrives when responding to the moment. May frustrate structured companions by changing direction without warning. Finds the unexpected delightful rather than disruptive.

---

## Category: Communication (indices 44--49)

---

## 44. directness

### -1.0 -- Indirect communicator

Softens messages with hedging language, qualifications, and diplomatic phrasing. Communicates disagreement through implication rather than explicit statement. May say "that's an interesting approach" when they mean "I think that's wrong." Asks leading questions rather than making declarative statements. Considers bluntness rude and finds direct negative feedback jarring.

### 0.0 -- Balanced

Adjusts directness to context and audience. Can be straightforward when clarity is important and diplomatic when sensitivity is required.

### +1.0 -- Direct communicator

Says exactly what they mean with minimal hedging. Delivers feedback clearly, including negative feedback, without extensive softening. Prefers to hear the same from others. Finds indirect communication frustrating and wastes time trying to decode implied meanings. "Just tell me what you think" is a frequent request. May be perceived as blunt or abrasive by indirect communicators, but values clarity over comfort.

---

## 45. verbosity

### -1.0 -- Concise, terse

Uses the fewest words possible to convey meaning. Emails are one to three sentences. Answers questions with a single sentence when one will do. Finds lengthy explanations, preambles, and caveats unnecessary. May omit context that others need because it seems obvious. Written communication can feel curt to verbose communicators.

### 0.0 -- Balanced

Provides sufficient context without excessive elaboration. Adjusts length to the complexity of the topic.

### +1.0 -- Verbose, elaborate

Provides extensive context, background, and qualifications. Explains reasoning in detail and anticipates follow-up questions. Emails are long and thorough. May tell a story to illustrate a point when a sentence would technically suffice. Values completeness over brevity. Written documents are comprehensive and leave little ambiguous, though they take time to read.

---

## 46. emotional_expression

### -1.0 -- Emotionally reserved

Keeps emotional state private. Voice remains steady under stress; facial expressions are controlled. Others may find it difficult to read their reactions. Does not share personal feelings in professional settings and is selective even in close relationships. Views emotional displays as private matters, not public performances. May be feeling deeply but show very little externally.

### 0.0 -- Balanced

Expresses emotions when they are strong or when context is appropriate, but does not broadcast every feeling. Others can generally read their state without detailed explanation.

### +1.0 -- Emotionally expressive

Feelings are visible on their face and audible in their voice. Laughs loudly, tears up readily, and shows excitement with visible energy. Shares emotional state openly and frequently. Others always know where they stand. Finds emotional suppression unhealthy and values authenticity of expression. May overwhelm reserved companions with the intensity and frequency of emotional disclosure.

---

## 47. listener_vs_talker

### -1.0 -- Listener

In conversation, asks questions, nods, and reflects rather than sharing. Holds space for others to talk and is comfortable with silence when the other person is thinking. Remembers details from past conversations because they were paying close attention. May be perceived as quiet or mysterious. Speaks when they have something to say, not to fill silence.

### 0.0 -- Balanced

Takes roughly equal turns listening and talking. Adjusts naturally based on the conversation partner and topic.

### +1.0 -- Talker

Occupies more conversational airtime. Processes ideas by articulating them out loud. Has stories, opinions, and commentary ready for most topics. Finds silence in conversation uncomfortable and fills it. May dominate group discussions without realizing it. Engaging and entertaining but may need reminders to ask questions and listen to answers.

---

## 48. written_preference

### -1.0 -- Verbal and spoken communicator

Prefers phone calls, video meetings, and in-person conversations to email and messaging. Finds written communication slow and limiting -- tone, nuance, and rapid back-and-forth are lost. Leaves emails terse or unanswered. Reaches for the phone when something needs to be discussed. Thinks more clearly in spoken dialogue than in written form.

### 0.0 -- Balanced

Comfortable with both written and spoken communication. Chooses the medium based on the situation rather than strong personal preference.

### +1.0 -- Written communicator

Prefers email, messages, and documents over calls and meetings. Thinks more clearly in writing and values the ability to compose, revise, and organize thoughts before sharing them. Finds real-time verbal exchanges pressured and imprecise. Documents decisions, sends follow-up summaries, and prefers asynchronous communication. May decline meetings that could be emails.

---

## 49. debate_enjoyment

### -1.0 -- Harmony-seeking

Finds argumentative discussions stressful and unproductive. Prefers conversations that build consensus rather than test positions. When disagreement arises, looks for common ground rather than sharpening the distinction. Dislikes being put on the spot to defend a position. Leaves conversations where the tone becomes adversarial.

### 0.0 -- Balanced

Can engage in debate when the topic warrants it but does not seek it out. Disagrees respectfully and moves on without needing to win.

### +1.0 -- Debate-enjoying

Finds intellectual sparring genuinely fun. Actively takes devil's advocate positions to test ideas. Enjoys being challenged and challenges others. Does not take disagreement personally and may be surprised when others do. Sharpens their own thinking through adversarial dialogue. A dinner party with heated but respectful argument is a great dinner party.

---

# Calibration

When generating an embedding for a user, use the following prompt template as guidance for the rating process:

```
You are rating a user on the Schelling personality embedding.
For each dimension, consider the user's BEHAVIOR as you have
observed it -- not what they say about themselves, but how they
actually think, react, and make decisions.

Use the anchor descriptions as reference points. A score of -1
means the user is at the 5th percentile (more extreme than 95%
of people). A score of +1 means the 95th percentile. Most people
cluster between -0.5 and +0.5.

Rate each dimension independently. Do not let halo effects from
one dimension influence others.
```

Raters should aim for behavioral grounding: prefer observable actions and patterns over self-reported traits. When insufficient evidence is available for a dimension, default to 0.0 rather than guessing.

---

# Versioning

This document defines **schelling-1.0**. For this version, the following are fixed and must not change:

- **Dimension count**: 50 dimensions, indexed 0 through 49.
- **Dimension ordering**: The index-to-dimension mapping defined above is permanent for schelling-1.0. Index 0 is always `openness`, index 49 is always `debate_enjoyment`.
- **Anchor semantics**: The behavioral anchors at -1.0, 0.0, and +1.0 for each dimension are fixed. Rewording for clarity is acceptable in supplementary materials, but the semantic content must not shift.
- **Value range**: Each dimension is a float in [-1.0, +1.0]. Values outside this range are invalid for schelling-1.0 embeddings.
- **Calibration basis**: Extremes (-1.0 and +1.0) correspond to the 5th and 95th percentiles of the general adult population. This calibration basis must not change within schelling-1.0.

Future versions (schelling-2.0, etc.) may add, remove, or reorder dimensions. Embeddings must always be tagged with their version identifier to ensure correct interpretation. A schelling-1.0 embedding is not directly comparable to an embedding from a different version without an explicit mapping.
