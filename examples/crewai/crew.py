"""
Schelling Protocol + CrewAI
Multi-agent hiring crew that finds and evaluates freelancers.

Usage:
    pip install crewai crewai-tools httpx
    export OPENAI_API_KEY=...
    python crew.py
"""
import httpx
from crewai import Agent, Task, Crew
from crewai.tools import tool

SCHELLING_API = "https://www.schellingprotocol.com/schelling"


@tool("Search Schelling Network")
def search_schelling(query: str) -> str:
    """Search the Schelling Protocol network for matches.
    Input: natural language description of what you need."""
    resp = httpx.post(
        f"{SCHELLING_API}/quick_seek",
        json={"intent": query},
        timeout=10,
    )
    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return "No matches found."
    results = []
    for c in candidates[:5]:
        score = c["score"]
        traits = ", ".join(c.get("matching_traits", []))
        results.append(f"Candidate {c['user_token_hash']}: score={score}, matching on [{traits}]")
    return f"Found {data.get('total_matches', 0)} candidates:\n" + "\n".join(results)


@tool("Post to Schelling Network")
def post_schelling(listing: str) -> str:
    """Post an offer/listing to the Schelling Protocol network.
    Input: natural language description of what you're offering."""
    resp = httpx.post(
        f"{SCHELLING_API}/quick_offer",
        json={"intent": listing},
        timeout=10,
    )
    return f"Posted: {resp.json().get('subscription_id', 'OK')}"


# Agents
scout = Agent(
    role="Talent Scout",
    goal="Find the best matching candidates on the Schelling network",
    backstory="You are an expert at finding talent through the Schelling Protocol coordination network.",
    tools=[search_schelling],
    verbose=True,
)

negotiator = Agent(
    role="Negotiator",
    goal="Evaluate candidates and recommend the best match based on scores and requirements",
    backstory="You analyze match scores and traits to find the optimal candidate for any coordination need.",
    verbose=True,
)

# Tasks
find_task = Task(
    description="Search the Schelling network for: {query}. Return all candidates with their scores.",
    expected_output="A list of candidates with match scores and matching traits.",
    agent=scout,
)

evaluate_task = Task(
    description="Evaluate the candidates found by the scout. Consider match scores, matching traits, and the original requirement: {query}. Recommend the top choice with reasoning.",
    expected_output="A recommendation of the best candidate with detailed reasoning.",
    agent=negotiator,
)

# Crew
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
