# Schelling Protocol + CrewAI

Multi-agent coordination using CrewAI with Schelling Protocol as the matching layer.

## Install

```bash
pip install crewai crewai-tools httpx
```

## Usage

```python
python crew.py
```

Two agents work together:
- **Scout Agent** — searches the Schelling network for candidates
- **Negotiator Agent** — evaluates matches and recommends the best option
