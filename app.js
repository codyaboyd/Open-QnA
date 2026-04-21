const els = {
  title: document.getElementById('title'),
  sourceText: document.getElementById('sourceText'),
  provider: document.getElementById('provider'),
  model: document.getElementById('model'),
  count: document.getElementById('count'),
  difficulty: document.getElementById('difficulty'),
  temperature: document.getElementById('temperature'),
  generateBtn: document.getElementById('generateBtn'),
  sampleBtn: document.getElementById('sampleBtn'),
  clearBtn: document.getElementById('clearBtn'),
  payloadPreview: document.getElementById('payloadPreview'),
  renderedItems: document.getElementById('renderedItems'),
  checklist: document.getElementById('checklist'),
  status: document.getElementById('status'),
  jsonBtn: document.getElementById('jsonBtn'),
  mdBtn: document.getElementById('mdBtn'),
  csvBtn: document.getElementById('csvBtn')
};

const STORAGE_KEY = 'open-qna-studio:v1';
let lastOutput = null;

const sampleText = `Relational databases store data in tables with rows and columns.
A primary key uniquely identifies each row in a table.
A foreign key references a primary key in another table to model relationships.
Normalization reduces redundancy and improves data integrity.
SQL SELECT retrieves data; INSERT adds rows; UPDATE modifies data; DELETE removes data.
Indexes improve query speed but can slow writes because the index must be updated.`;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sentenceSplit(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter((s) => s.length > 12);
}

function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/\u00a0/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
}

function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarityRatio(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function sentenceScore(sentence) {
  const tokenCount = sentence.split(/\s+/).length;
  const hasNumber = /\d/.test(sentence) ? 1 : 0;
  const hasSignalWord = /(because|therefore|however|improves|reduces|requires|must|should)/i.test(sentence) ? 1 : 0;
  return tokenCount + hasNumber * 2 + hasSignalWord * 3;
}

function chunkCorpus(text, maxChunkChars = 550) {
  const normalized = normalizeWhitespace(text);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  paragraphs.forEach((paragraph) => {
    if (!current) {
      current = paragraph;
      return;
    }

    if ((current + '\n\n' + paragraph).length <= maxChunkChars) {
      current += `\n\n${paragraph}`;
      return;
    }

    chunks.push(current);
    current = paragraph;
  });

  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized];
}

function unique(array) {
  return [...new Set(array)];
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toSourceSpan(sentence, sourceText) {
  const idx = sourceText.indexOf(sentence);
  if (idx !== -1) return `char:${idx}-${idx + sentence.length}`;

  const normalizedSource = normalizeForMatch(sourceText);
  const normalizedSentence = normalizeForMatch(sentence);
  const relaxedIdx = normalizedSource.indexOf(normalizedSentence);
  if (relaxedIdx !== -1) return `approx-char:${relaxedIdx}-${relaxedIdx + normalizedSentence.length}`;
  return 'Not found';
}

function sentenceKeywords(sentence) {
  const stop = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'is',
    'to',
    'of',
    'in',
    'for',
    'with',
    'on',
    'by',
    'it',
    'this',
    'that',
    'be',
    'as',
    'are'
  ]);

  return unique(
    sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w))
  );
}

function chooseQuestionStem(sentence, difficulty) {
  const keywords = sentenceKeywords(sentence);
  const focus = keywords.slice(0, 2).join(' + ') || 'this idea';

  if (difficulty === 'easy') {
    return `According to the source, what is true about ${focus}?`;
  }
  if (difficulty === 'hard') {
    return `Using evidence from the source, what is the strongest implication of ${focus}?`;
  }
  return `Based on the source, which statement best explains ${focus}?`;
}

function makeQA(sentence, difficulty, sourceText) {
  return {
    type: 'qa_pair',
    question: chooseQuestionStem(sentence, difficulty),
    answer: sentence,
    source_span: toSourceSpan(sentence, sourceText)
  };
}

function makeDistractor(sentence, idx) {
  const keywords = sentenceKeywords(sentence);
  const topic = keywords[0] || 'the concept';

  const templates = [
    `${topic} is mostly cosmetic and does not influence outcomes.`,
    `${topic} is optional and usually omitted in reliable systems.`,
    `${topic} only matters when visual formatting is being changed.`,
    `${topic} always reduces accuracy in practical use.`
  ];

  return templates[idx % templates.length];
}

function makeMCQ(sentence, sentencePool, sourceText) {
  const related = sentencePool.filter((s) => s !== sentence).slice(0, 2);
  const distractors = [
    ...related.map((s) => s.replace(/\.$/, '').concat(' (misapplied context).')),
    makeDistractor(sentence, sentence.length)
  ].slice(0, 3);

  const choices = unique([sentence, ...distractors]).slice(0, 4);

  while (choices.length < 4) {
    choices.push(makeDistractor(sentence, choices.length));
  }

  return {
    type: 'mcq',
    question: 'Which option is most faithful to the source passage?',
    choices,
    answer: sentence,
    explanation: 'The answer is the only choice that directly matches the source statement.',
    source_span: toSourceSpan(sentence, sourceText)
  };
}

function makeShortWritten(sentence, difficulty, sourceText) {
  const framing =
    difficulty === 'easy'
      ? 'In 2-3 sentences, restate this idea in plain language and include one example.'
      : difficulty === 'hard'
        ? 'In 3-4 sentences, explain this idea, one tradeoff, and one likely failure mode.'
        : 'In 2-3 sentences, explain this idea and why it matters in practice.';

  return {
    type: 'short_written',
    question: `${framing} "${sentence}"`,
    source_span: toSourceSpan(sentence, sourceText)
  };
}

function buildItems(sentences, count, difficulty, sourceText) {
  const ranked = [...sentences].sort((a, b) => sentenceScore(b) - sentenceScore(a));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const sentence = ranked[i % ranked.length];
    const mode = i % 3;

    if (mode === 0) items.push(makeQA(sentence, difficulty, sourceText));
    if (mode === 1) items.push(makeMCQ(sentence, sentences, sourceText));
    if (mode === 2) items.push(makeShortWritten(sentence, difficulty, sourceText));
  }
  return items;
}

function prepareCorpus(sourceText) {
  const chunks = chunkCorpus(sourceText);
  const candidates = chunks
    .flatMap((chunk) => sentenceSplit(chunk))
    .map((sentence) => sentence.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter((sentence) => sentence.length >= 18);

  const deduped = [];
  candidates.forEach((sentence) => {
    const normalized = normalizeForMatch(sentence);
    const nearDuplicate = deduped.some((existing) => similarityRatio(normalized, normalizeForMatch(existing)) > 0.92);
    if (!nearDuplicate) deduped.push(sentence);
  });

  return deduped.sort((a, b) => sentenceScore(b) - sentenceScore(a));
}

function evaluate(items, sourceText) {
  const lower = sourceText.toLowerCase();
  const questions = items.map((x) => x.question.toLowerCase());
  const dupCount = questions.length - new Set(questions).size;

  const groundedAnswers = items.filter((item) => {
    if (!item.answer) return true;
    return lower.includes(item.answer.toLowerCase());
  }).length;

  const sourceSpanCoverage = items.filter((i) => i.source_span && i.source_span !== 'Not found').length;
  const mcqCount = items.filter((i) => i.type === 'mcq').length;
  const strongMcqs = items
    .filter((i) => i.type === 'mcq')
    .filter((m) => m.choices?.length === 4 && unique(m.choices).length === 4 && m.choices.includes(m.answer)).length;

  return [
    {
      name: 'Faithfulness',
      ok: groundedAnswers === items.length,
      detail: `${groundedAnswers}/${items.length} items are directly grounded in source text.`
    },
    {
      name: 'Uniqueness',
      ok: dupCount === 0,
      detail: dupCount === 0 ? 'No duplicate prompts detected.' : `${dupCount} near-duplicate prompts found.`
    },
    {
      name: 'Source citation coverage',
      ok: sourceSpanCoverage === items.length,
      detail: `${sourceSpanCoverage}/${items.length} items include source spans for traceability.`
    },
    {
      name: 'Format validity',
      ok: items.every((i) => i.type && i.question),
      detail: 'All items include required fields for their type.'
    },
    {
      name: 'Distractor quality (MCQ)',
      ok: mcqCount === strongMcqs,
      detail: `${strongMcqs}/${mcqCount || 1} MCQs include 4 unique options and one exact source-grounded answer.`
    }
  ];
}

function saveFormState() {
  const snapshot = {
    title: els.title.value,
    sourceText: els.sourceText.value,
    provider: els.provider.value,
    model: els.model.value,
    count: els.count.value,
    difficulty: els.difficulty.value,
    temperature: els.temperature.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function restoreFormState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object') return;

    els.title.value = state.title || '';
    els.sourceText.value = state.sourceText || '';
    els.provider.value = state.provider || 'llama_cpp';
    els.model.value = state.model || 'mistral-instruct';
    els.count.value = clamp(state.count, 3, 20, 8);
    els.difficulty.value = state.difficulty || 'medium';
    els.temperature.value = clamp(state.temperature, 0, 1, 0.3);
  } catch {
    setStatus('Saved settings could not be restored due to invalid local cache.', 'warning');
  }
}

function renderChecklist(results) {
  els.checklist.innerHTML = results
    .map(
      (r) =>
        `<div class="mb-2"><strong>${r.ok ? '✅' : '⚠️'} ${escapeHtml(r.name)}</strong><br><span class="small">${escapeHtml(
          r.detail
        )}</span></div>`
    )
    .join('');
}

function renderItems(items) {
  els.renderedItems.innerHTML = items
    .map((item) => {
      const source = `<p class="small mb-0 text-white-75"><em>Source span: ${escapeHtml(item.source_span || 'N/A')}</em></p>`;

      const body =
        item.type === 'mcq'
          ? `<p class="mb-1"><strong>Q:</strong> ${escapeHtml(item.question)}</p>
             <ol class="mb-1">${item.choices.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ol>
             <p class="mb-1"><strong>Answer:</strong> ${escapeHtml(item.answer)}</p>
             <p class="small mb-1 text-white-75"><em>${escapeHtml(item.explanation)}</em></p>${source}`
          : item.type === 'qa_pair'
            ? `<p class="mb-1"><strong>Q:</strong> ${escapeHtml(item.question)}</p>
               <p class="mb-1"><strong>A:</strong> ${escapeHtml(item.answer)}</p>${source}`
            : `<p class="mb-1"><strong>Prompt:</strong> ${escapeHtml(item.question)}</p>${source}`;

      return `<article class="result-card rounded p-3"><span class="badge badge-type mb-2 text-uppercase">${escapeHtml(item.type)}</span>${body}</article>`;
    })
    .join('');
}

function buildPayload() {
  const inputText = normalizeWhitespace(els.sourceText.value);
  const count = clamp(els.count.value, 3, 20, 8);
  const sentences = prepareCorpus(inputText);

  if (!inputText || sentences.length === 0) {
    setStatus('Please provide source material before generating.', 'warning');
    return null;
  }
  if (sentences.length < 2) {
    setStatus('Need a richer corpus: provide at least 2 informative sentences for robust generation.', 'warning');
    return null;
  }

  const payload = {
    provider: els.provider.value,
    model: els.model.value.trim() || 'model-not-set',
    task: 'qa_pairs | mcq | short_written',
    input: {
      title: els.title.value.trim() || 'Untitled',
      text: inputText,
      corpus_stats: {
        chunks: chunkCorpus(inputText).length,
        candidate_sentences: sentences.length
      }
    },
    options: {
      count,
      difficulty: els.difficulty.value,
      language: 'en',
      temperature: clamp(els.temperature.value, 0, 1, 0.3)
    }
  };

  const items = buildItems(sentences, count, els.difficulty.value, inputText);
  const checklist = evaluate(items, inputText);

  return { payload, output: { items }, checklist };
}

function setStatus(message, kind = 'info') {
  els.status.className = `alert alert-${kind} small`;
  els.status.textContent = message;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function asMarkdown(items) {
  return items
    .map((item, i) => {
      if (item.type === 'qa_pair') {
        return `### ${i + 1}. Q&A\n- **Question:** ${item.question}\n- **Answer:** ${item.answer}\n- **Source span:** ${item.source_span || 'N/A'}`;
      }
      if (item.type === 'mcq') {
        return `### ${i + 1}. MCQ\n- **Question:** ${item.question}\n- **Choices:**\n${item.choices
          .map((c, idx) => `  ${idx + 1}. ${c}`)
          .join('\n')}\n- **Answer:** ${item.answer}\n- **Explanation:** ${item.explanation}\n- **Source span:** ${item.source_span || 'N/A'}`;
      }
      return `### ${i + 1}. Short Written\n- **Prompt:** ${item.question}\n- **Source span:** ${item.source_span || 'N/A'}`;
    })
    .join('\n\n');
}

function asCsv(items) {
  const header = 'type,question,answer,choices,explanation,source_span';
  const rows = items.map((i) => {
    const choices = i.choices ? i.choices.join(' | ') : '';
    return [i.type, i.question, i.answer || '', choices, i.explanation || '', i.source_span || '']
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(',');
  });
  return [header, ...rows].join('\n');
}

els.generateBtn.addEventListener('click', () => {
  const result = buildPayload();
  if (!result) return;

  lastOutput = result;
  els.payloadPreview.textContent = JSON.stringify(
    {
      ...result.payload,
      output: result.output
    },
    null,
    2
  );

  renderItems(result.output.items);
  renderChecklist(result.checklist);
  [els.jsonBtn, els.mdBtn, els.csvBtn].forEach((b) => (b.disabled = false));

  saveFormState();
  setStatus('Generated successfully with stronger source-grounded fidelity checks.', 'success');
});

els.sampleBtn.addEventListener('click', () => {
  els.sourceText.value = sampleText;
  if (!els.title.value.trim()) els.title.value = 'Database Fundamentals';
  saveFormState();
  setStatus('Sample content loaded.', 'primary');
});

els.clearBtn.addEventListener('click', () => {
  els.sourceText.value = '';
  els.title.value = '';
  els.renderedItems.innerHTML = '';
  els.checklist.innerHTML = '';
  els.payloadPreview.textContent = '{ }';
  [els.jsonBtn, els.mdBtn, els.csvBtn].forEach((b) => (b.disabled = true));
  lastOutput = null;
  saveFormState();
  setStatus('Cleared. Ready for new source content.', 'info');
});

els.jsonBtn.addEventListener('click', () => {
  if (!lastOutput) return;
  const json = JSON.stringify({ ...lastOutput.payload, output: lastOutput.output }, null, 2);
  download('open-qna-output.json', json, 'application/json');
});

els.mdBtn.addEventListener('click', () => {
  if (!lastOutput) return;
  download('open-qna-output.md', asMarkdown(lastOutput.output.items), 'text/markdown');
});

els.csvBtn.addEventListener('click', () => {
  if (!lastOutput) return;
  download('open-qna-output.csv', asCsv(lastOutput.output.items), 'text/csv');
});

[
  els.title,
  els.sourceText,
  els.provider,
  els.model,
  els.count,
  els.difficulty,
  els.temperature
].forEach((el) => {
  el.addEventListener('input', saveFormState);
  el.addEventListener('change', saveFormState);
});

restoreFormState();
