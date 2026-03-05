"""
Schelling Protocol + CrewAI — Two-Agent Coordination Demo

Two agents coordinate through the Schelling network:
1. Provider posts an offering
2. Seeker finds and evaluates candidates

Usage:
    pip install schelling-crewai  # or: pip install -e ../../packages/schelling-crewai
    export OPENAI_API_KEY=...
    python crew.py
"""
from crewai import Agent, Task, Crew
from schelling_crewai import SchellingSeekTool, SchellingOfferTool

# ── Agents ────────────────────────────────────────────────────────────

scout = Agent(
    role="Talent Scout",
    goal="Find the best matching candidates on the Schelling network",
    backstory="Expert at finding talent through the Schelling Protocol coordination network.",
    tools=[SchellingSeekTool()],
    verbose=True,
)

negotiator = Agent(
    role="Negotiator",
    goal="Evaluate candidates and recommend the best match",
    backstory="Analyzes match scores and traits to find the optimal candidate.",
    verbose=True,
)

# ── Tasks ─────────────────────────────────────────────────────────────

find_task = Task(
    description="Search the Schelling network for: {query}. Return all candidates with scores.",
    expected_output="List of candidates with match scores and matching traits.",
    agent=scout,
)

evaluate_task = Task(
    description=(
        "Evaluate the candidates found by the scout. Consider match scores, "
        "traits, and the original requirement: {query}. Recommend the top choice."
    ),
    expected_output="Top recommendation with detailed reasoning.",
    agent=negotiator,
)

# ── Crew ──────────────────────────────────────────────────────────────

crew = Crew(
    agents=[scout, negotiator],
    tasks=[find_task, evaluate_task],
    verbose=True,
)

if __name__ == "__main__":
    result = crew.kickoff(
        inputs={"query": "React developer in Denver, under $100/hr, available immediately"}
    )
    print(f"\n{'='*60}\n📋 Final Recommendation:\n{result}\n{'='*60}")
