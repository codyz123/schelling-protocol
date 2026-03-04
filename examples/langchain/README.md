# Schelling Protocol + LangChain

Use Schelling Protocol as a coordination layer in your LangChain agents.

## Install

```bash
pip install langchain langchain-openai httpx
```

## Usage

```python
python agent.py
```

The agent can:
- Search for matches on the Schelling network
- Post offers on your behalf
- Check match scores and negotiate

## How it works

The agent uses LangChain's tool-calling to interact with the Schelling Protocol API. Each Schelling operation is exposed as a LangChain tool that the LLM can invoke naturally.
