"""
Schelling Protocol + LangChain Agent
Find freelancers, roommates, or any coordination match using natural language.

Usage:
    pip install schelling-langchain[openai]
    export OPENAI_API_KEY=...
    python agent.py
"""
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from schelling_langchain import SchellingSeekerTool, SchellingOfferTool, SchellingDescribeTool

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [SchellingSeekerTool(), SchellingOfferTool(), SchellingDescribeTool()]

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a coordination agent powered by the Schelling Protocol.
Help users find matches — freelancers, roommates, services, anything.
Scores: 1.0 = perfect, 0.5+ = good, <0.5 = partial."""),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_openai_functions_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

if __name__ == "__main__":
    print("\n🔍 Searching for a React developer...\n")
    result = executor.invoke({"input": "Find me a React developer in Denver for under $100/hour"})
    print(f"\n📋 Result: {result['output']}\n")
