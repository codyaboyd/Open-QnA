# Open-QnA

Open-QnA is a configurable system for turning source information into educational assessment content.

It can generate:
- **Question-and-answer (Q&A) pairs**
- **Multiple-choice questions (MCQs)**
- **Short written questions** (free-response prompts)

## Web App (Bootstrap 5)

This repository now includes a colorful Bootstrap 5 web app that demonstrates the full Open-QnA flow from the README:

- Ingest source content
- Configure provider/model/options
- Generate Q&A, MCQ, and short written items
- Run quality checks with source-grounding and traceability checks
- Export JSON / Markdown / CSV (including source spans)

### Run Locally

Because this is a static app, you can open `index.html` directly, or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then open: `http://localhost:8000`

## Goals

- Accept raw information in many forms (plain text, notes, documentation, transcripts).
- Produce high-quality learning questions in consistent formats.
- Support local and hosted LLM providers through a common interface.
- Make output deterministic and easy to integrate into downstream apps.

## Core Workflow

1. **Ingest Content**
   - Input one or more passages.
   - Optionally chunk long material into sections.

2. **Extract Key Facts / Concepts**
   - Identify entities, definitions, relationships, and procedures.
   - Rank concepts by relevance and difficulty.

3. **Generate Question Sets**
   - **Q&A pairs**: direct question + answer.
   - **MCQs**: stem + one correct option + distractors + answer key.
   - **Short written questions**: prompts requiring concise written responses.

4. **Quality Controls**
   - Remove duplicates.
   - Validate answerability from source text.
   - Check difficulty, clarity, and format constraints.

5. **Export**
   - JSON, Markdown, CSV, or API response payloads.

## LLM Provider Support

Open-QnA is designed around a provider adapter layer so any generation pipeline can call a unified API regardless of the backend model provider.

### 1) `llama.cpp` (local/self-hosted)
Supported model families include:
- **Mistral Instruct**
- **Qwen**
- **Gemma**
- **Llama**

Typical usage pattern:
- Run local model server with `llama.cpp`.
- Configure endpoint URL, model name, and generation parameters (`temperature`, `top_p`, `max_tokens`).
- Use the `llama_cpp` adapter to generate outputs.

### 2) OpenAI GPT API
- Configure API key and model id.
- Use the `gpt` adapter for hosted generation.

### 3) Anthropic Claude API
- Configure API key and Claude model id.
- Use the `claude` adapter for hosted generation.

### 4) Google Gemini API
- Configure API key and Gemini model id.
- Use the `gemini` adapter for hosted generation.

### 5) LeChat API
- Configure API key and LeChat model id.
- Use the `lechat` adapter for hosted generation.

## Suggested Provider-Agnostic Interface

```json
{
  "provider": "llama_cpp | gpt | claude | gemini | lechat",
  "model": "string",
  "task": "qa_pairs | mcq | short_written",
  "input": {
    "title": "optional",
    "text": "source material"
  },
  "options": {
    "count": 10,
    "difficulty": "easy|medium|hard",
    "language": "en",
    "temperature": 0.3
  }
}
```

## Example Output Schema

```json
{
  "items": [
    {
      "type": "mcq",
      "question": "What does X primarily describe?",
      "choices": ["A", "B", "C", "D"],
      "answer": "B",
      "explanation": "B is correct because ...",
      "source_span": "optional citation"
    },
    {
      "type": "qa_pair",
      "question": "What is Y?",
      "answer": "Y is ..."
    },
    {
      "type": "short_written",
      "question": "In 2-3 sentences, explain Z."
    }
  ]
}
```

## Recommended Prompting Strategy

- Ground each question strictly in provided source material.
- Request concise and unambiguous answers.
- For MCQs, require plausible distractors and one uniquely correct answer.
- Include a short explanation for correctness checks.
- Enforce output schemas with JSON mode where supported.

## Evaluation Checklist

Use automated checks before publishing generated questions:
- **Faithfulness**: answer is supported by source text.
- **Uniqueness**: no duplicate or near-duplicate questions.
- **Difficulty fit**: question complexity matches selected level.
- **Format validity**: output conforms to schema.
- **Distractor quality (MCQ)**: alternatives are plausible but incorrect.

## Minimal Configuration Example

```yaml
default_provider: llama_cpp
providers:
  llama_cpp:
    base_url: "http://localhost:8080"
    model: "mistral-instruct"
  gpt:
    api_key: "${OPENAI_API_KEY}"
    model: "gpt-4.1-mini"
  claude:
    api_key: "${ANTHROPIC_API_KEY}"
    model: "claude-3-5-sonnet"
  gemini:
    api_key: "${GEMINI_API_KEY}"
    model: "gemini-1.5-pro"
  lechat:
    api_key: "${LECHAT_API_KEY}"
    model: "lechat-latest"
```

## License

This project is licensed under the terms of the [LICENSE](./LICENSE).
