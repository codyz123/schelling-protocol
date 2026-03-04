"""
Schelling Protocol + LangChain Agent
Find freelancers, roommates, or any coordination match using natural language.

Usage:
    pip install langchain langchain-openai httpx
    export OPENAI_API_KEY=...
    python agent.py
"""
import httpx
from langchain_openai import ChatOpenAI
from langchain.agents import tool, AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

SCHELLING_API = "https://www.schellingprotocol.com/schelling"


@tool
def schelling_seek(intent: str) -> str:
    """Search the Schelling network for matches. Describe what you're looking for
    in natural language, e.g. 'React developer in Denver under $100/hr'."""
    resp = httpx.post(
        f"{SCHELLING_API}/quick_seek",
        json={"intent": intent},
        timeout=10,
    )
    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return "No matches found. Try broadening your search."
    results = []
    for c in candidates[:5]:
        results.append(
            f"- Score: {c['score']} | Traits: {', '.join(c.get('matching_traits', []))}"
        )
    return f"Found {data.get('total_matches', len(candidates))} matches:\n" + "\n".join(results)


@tool
def schelling_offer(intent: str) -> str:
    """Post a listing on the Schelling network. Describe what you're offering
    in natural language, e.g. 'Room for rent in Fort Collins, $700/mo'."""
    resp = httpx.post(
        f"{SCHELLING_API}/quick_offer",
        json={"intent": intent},
        timeout=10,
    )
    data = resp.json()
    if data.get("registration_created"):
        return f"Listed! Your offer is live on the network. Subscription ID: {data.get('subscription_id', 'N/A')}"
    return f"Offer posted. Response: {data}"


@tool
def schelling_describe() -> str:
    """Get info about the Schelling network — active clusters, stats, capabilities."""
    resp = httpx.post(f"{SCHELLING_API}/describe", timeout=10)
    data = resp.json()
    protocol = data.get("protocol", {})
    clusters = data.get("clusters", {})
    return (
        f"Protocol: {protocol.get('name')} v{protocol.get('version')}\n"
        f"Active clusters: {clusters.get('total_active', 0)}\n"
        f"Top clusters: {', '.join(c['cluster_id'] for c in clusters.get('top_clusters', []))}"
    )


# Build the agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [schelling_seek, schelling_offer, schelling_describe]

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a coordination agent powered by the Schelling Protocol.
You help users find matches — freelancers, roommates, services, anything.
Use the Schelling tools to search, post offers, and check network status.
Always explain match scores: 1.0 = perfect match, 0.5+ = good match, <0.5 = partial."""),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_openai_functions_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

if __name__ == "__main__":
    # Demo: search for a developer
    print("\n🔍 Searching for a React developer...\n")
    result = executor.invoke({"input": "Find me a React developer in Denver for under $100/hour"})
    print(f"\n📋 Result: {result['output']}\n")

    # Demo: post an offer
    print("\n📝 Posting a room listing...\n")
    result = executor.invoke({"input": "Post a listing: room available in Fort Collins, $700/month, near Old Town, pet-friendly"})
    print(f"\n📋 Result: {result['output']}\n")
