# Contributing to Open-QnA

Thanks for your interest in contributing.

## Development setup

1. Clone the repository.
2. Serve locally:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000`.

## Pull request checklist

- Keep changes focused and well-scoped.
- Ensure generated UI content remains source-grounded and escaped.
- Run local checks before opening a PR:
  ```bash
  node --check app.js
  python3 -m py_compile - <<'PY'
from html.parser import HTMLParser
with open('index.html','r',encoding='utf-8') as f:
    HTMLParser().feed(f.read())
print('index.html parse check passed')
PY
  ```
- Update documentation when behavior changes.

## Commit style

Use concise, imperative commit messages. Example:

- `Harden UI rendering and add CI validation`
