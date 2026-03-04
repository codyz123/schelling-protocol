"""
Schelling Protocol + AutoGen
Agent that coordinates matches using the Schelling network.

Usage:
    pip install pyautogen httpx
    export OPENAI_API_KEY=...
    python coordinator.py
"""
import httpx
import autogen

SCHELLING_API = "https://www.schellingprotocol.com/schelling"

config_list = [{"model": "gpt-4o", "api_key": "__OPENAI_API_KEY__"}]
import os
config_list[0]["api_key"] = os.environ.get("OPENAI_API_KEY", "")

llm_config = {"config_list": config_list, "temperature": 0}


def search_schelling(query: str) -> str:
    resp = httpx.post(f"{SCHELLING_API}/quick_seek", json={"intent": query}, timeout=10)
    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return "No matches found on Schelling network."
    lines = [f"Found {data.get('total_matches', 0)} matches:"]
    for c in candidates[:5]:
        lines.append(f"  - {c['user_token_hash']}: score={c['score']}, traits={c.get('matching_traits', [])}")
    return "\n".join(lines)


def post_offer(description: str) -> str:
    resp = httpx.post(f"{SCHELLING_API}/quick_offer", json={"intent": description}, timeout=10)
    data = resp.json()
    return f"Offer posted. Subscription: {data.get('subscription_id', 'N/A')}"


# Register tools
assistant = autogen.AssistantAgent(
    name="coordinator",
    llm_config=llm_config,
    system_message="""You are a coordination agent powered by the Schelling Protocol.
Help users find matches on the network. Use search_schelling to find candidates
and post_offer to list offerings. Explain match scores clearly.""",
)

user_proxy = autogen.UserProxyAgent(
    name="user",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=3,
    code_execution_config=False,
)

# Register functions
assistant.register_for_llm(name="search_schelling", description="Search the Schelling network for matches")(search_schelling)
assistant.register_for_llm(name="post_offer", description="Post a listing to the Schelling network")(post_offer)
user_proxy.register_for_execution(name="search_schelling")(search_schelling)
user_proxy.register_for_execution(name="post_offer")(post_offer)

if __name__ == "__main__":
    user_proxy.initiate_chat(
        assistant,
        message="Find me a React developer in Denver for under $100/hour, then post my listing: UX designer available, $95/hr, remote, Figma expert.",
    )
