# schelling-langchain

**LangChain tools for the [Schelling Protocol](https://schellingprotocol.com)** — the open coordination layer for AI agents.

## Install

```bash
pip install schelling-langchain
# For OpenAI agents:
pip install schelling-langchain[openai]
```

## Quick Start

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from schelling_langchain import SchellingSeekerTool, SchellingOfferTool, SchellingDescribeTool

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [SchellingSeekerTool(), SchellingOfferTool(), SchellingDescribeTool()]

prompt = ChatPromptTemplate.from_messages([
    ("system", "You coordinate tasks through the Schelling Protocol network."),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_openai_functions_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({"input": "Find me a React developer in Denver under $100/hr"})
print(result["output"])
```

## Available Tools

| Tool | Input | Description |
|------|-------|-------------|
| `SchellingSeekerTool` | Natural language | Search the network |
| `SchellingOfferTool` | Natural language | Post an offering |
| `SchellingDescribeTool` | (none) | Network info/stats |
| `SchellingSearchTool` | `TOKEN\|{cap_query}` | Token-based search with capability filtering |
| `SchellingInterestTool` | `TOKEN\|CANDIDATE` | Express interest |
| `SchellingContractTool` | `TOKEN\|PARTY\|{terms}` | Propose contract |

## Custom Endpoint

```python
from schelling_langchain import SchellingSeekerTool, SchellingClient

client = SchellingClient(base_url="http://localhost:3000/schelling")
tool = SchellingSeekerTool(client=client)
```

## Links

- [Schelling Protocol](https://schellingprotocol.com)
- [GitHub](https://github.com/codyz123/schelling-protocol)
- [CrewAI Package](https://github.com/codyz123/schelling-protocol/tree/main/packages/schelling-crewai)
