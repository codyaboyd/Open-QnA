# Open-QnA

Open-QnA is an open-source, provider-agnostic system for transforming source content into educational assessment artifacts.

It can generate:
- **Question-and-answer (Q&A) pairs**
- **Multiple-choice questions (MCQs)**
- **Short written prompts** (free-response)

## Why this project

Open-QnA focuses on practical quality constraints for generated learning content:

- **Grounded outputs** linked to source spans.
- **Consistent schemas** suitable for app and pipeline integrations.
- **Corpus handling** that normalizes, chunks, ranks, and de-duplicates source material.
- **Exportability** to JSON, Markdown, and CSV.

## Open-QnA Studio (included web app)

This repository includes a static Bootstrap 5 web app (`index.html` + `app.js`) that demonstrates an end-to-end generation flow:

1. Ingest content.
2. Configure provider/model/options.
3. Generate Q&A, MCQ, and short written items.
4. Run fidelity and format checks.
5. Export output artifacts.

## Quick start

### Option 1: open directly
Open `index.html` in a browser.

### Option 2: run a local server (recommended)
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

## Production-readiness highlights

- **Client-side output escaping** to reduce XSS risk when rendering user-provided source content.
- **Content-Security-Policy (CSP)** for safer browser execution defaults.
- **Accessible status announcements** (`aria-live`) and no-script fallback messaging.
- **Local state persistence** for working sessions via `localStorage`.
- **CI validation** for HTML and JavaScript syntax on pull requests.

## Provider support model

Open-QnA is intentionally provider-agnostic through a common adapter contract.

Supported provider targets in the current design:
- `llama_cpp` (self-hosted/local)
- `gpt` (OpenAI)
- `claude` (Anthropic)
- `gemini` (Google)
- `lechat`

### Suggested request interface

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

## Quality checklist used

- **Faithfulness**: Is the answer grounded in the source?
- **Uniqueness**: Are prompts non-duplicative?
- **Source citation coverage**: Does each item include a source span?
- **Format validity**: Do all items satisfy required fields?
- **Distractor quality (MCQ)**: Are options complete and structurally valid?

## Contributing

Please review:
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)

## License

This project is licensed under the terms of the [LICENSE](./LICENSE).
