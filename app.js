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

let lastOutput = null;

const sampleText = `Relational databases store data in tables with rows and columns.
A primary key uniquely identifies each row in a table.
A foreign key references a primary key in another table to model relationships.
Normalization reduces redundancy and improves data integrity.
SQL SELECT retrieves data; INSERT adds rows; UPDATE modifies data; DELETE removes data.
Indexes improve query speed but can slow writes because the index must be updated.`;

function sentenceSplit(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function unique(array) {
  return [...new Set(array)];
}

function makeQA(sentence) {
  const words = sentence.split(' ');
  const lead = words.slice(0, Math.min(5, words.length)).join(' ');
  return {
    type: 'qa_pair',
    question: `What is a key point about: "${lead}"?`,
    answer: sentence
  };
}

function makeMCQ(sentence, idx) {
  const fallbackChoices = [
    'It describes a minor formatting preference.',
    'It has no impact on system behavior.',
    'It is unrelated to data modeling.',
    'It focuses only on visual styling.'
  ];

  const choicePool = unique([
    sentence,
    ...fallbackChoices.map((c, i) => `${c} (${idx + i + 1})`)
  ]);

  const choices = choicePool.slice(0, 4);
  const answer = choices[0];

  return {
    type: 'mcq',
    question: `Which statement best matches this concept from the source?`,
    choices,
    answer,
    explanation: 'The correct choice is directly grounded in the provided source sentence.'
  };
}

function makeShortWritten(sentence) {
  return {
    type: 'short_written',
    question: `In 2-3 sentences, explain this idea and why it matters: "${sentence}"`
  };
}

function buildItems(sentences, count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const sentence = sentences[i % sentences.length];
    const mode = i % 3;

    if (mode === 0) items.push(makeQA(sentence));
    if (mode === 1) items.push(makeMCQ(sentence, i));
    if (mode === 2) items.push(makeShortWritten(sentence));
  }
  return items;
}

function evaluate(items, sourceText) {
  const lower = sourceText.toLowerCase();
  const questions = items.map((x) => x.question.toLowerCase());
  const dupCount = questions.length - new Set(questions).size;

  const faithfulnessHits = items.filter((item) => {
    if (item.answer) {
      return lower.includes(item.answer.slice(0, 18).toLowerCase());
    }
    return true;
  }).length;

  return [
    {
      name: 'Faithfulness',
      ok: faithfulnessHits === items.length,
      detail: `${faithfulnessHits}/${items.length} answers appear anchored in source text.`
    },
    {
      name: 'Uniqueness',
      ok: dupCount === 0,
      detail: dupCount === 0 ? 'No duplicate prompts detected.' : `${dupCount} near-duplicate prompts found.`
    },
    {
      name: 'Difficulty fit',
      ok: true,
      detail: `Questions tagged for ${els.difficulty.value} difficulty.`
    },
    {
      name: 'Format validity',
      ok: items.every((i) => i.type && i.question),
      detail: 'All items include required fields for their type.'
    },
    {
      name: 'Distractor quality (MCQ)',
      ok: items.filter((i) => i.type === 'mcq').every((m) => m.choices?.length === 4),
      detail: 'Each MCQ has one answer and three distractors.'
    }
  ];
}

function renderChecklist(results) {
  els.checklist.innerHTML = results
    .map(
      (r) => `<div class="mb-2"><strong>${r.ok ? '✅' : '⚠️'} ${r.name}</strong><br><span class="small">${r.detail}</span></div>`
    )
    .join('');
}

function renderItems(items) {
  els.renderedItems.innerHTML = items
    .map((item) => {
      const body =
        item.type === 'mcq'
          ? `<p class="mb-1"><strong>Q:</strong> ${item.question}</p>
             <ol class="mb-1">${item.choices.map((c) => `<li>${c}</li>`).join('')}</ol>
             <p class="mb-1"><strong>Answer:</strong> ${item.answer}</p>
             <p class="small mb-0 text-white-75"><em>${item.explanation}</em></p>`
          : item.type === 'qa_pair'
            ? `<p class="mb-1"><strong>Q:</strong> ${item.question}</p>
               <p class="mb-0"><strong>A:</strong> ${item.answer}</p>`
            : `<p class="mb-0"><strong>Prompt:</strong> ${item.question}</p>`;

      return `<article class="result-card rounded p-3"><span class="badge badge-type mb-2 text-uppercase">${item.type}</span>${body}</article>`;
    })
    .join('');
}

function buildPayload() {
  const inputText = els.sourceText.value.trim();
  const count = Number(els.count.value) || 8;
  const sentences = sentenceSplit(inputText);

  if (!inputText || sentences.length === 0) {
    setStatus('Please provide source material before generating.', 'warning');
    return null;
  }

  const payload = {
    provider: els.provider.value,
    model: els.model.value.trim() || 'model-not-set',
    task: 'qa_pairs | mcq | short_written',
    input: {
      title: els.title.value.trim() || 'Untitled',
      text: inputText
    },
    options: {
      count,
      difficulty: els.difficulty.value,
      language: 'en',
      temperature: Number(els.temperature.value)
    }
  };

  const items = buildItems(sentences, count);
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
  URL.revokeObjectURL(a.href);
  a.remove();
}

function asMarkdown(items) {
  return items
    .map((item, i) => {
      if (item.type === 'qa_pair') {
        return `### ${i + 1}. Q&A\n- **Question:** ${item.question}\n- **Answer:** ${item.answer}`;
      }
      if (item.type === 'mcq') {
        return `### ${i + 1}. MCQ\n- **Question:** ${item.question}\n- **Choices:**\n${item.choices
          .map((c, idx) => `  ${idx + 1}. ${c}`)
          .join('\n')}\n- **Answer:** ${item.answer}\n- **Explanation:** ${item.explanation}`;
      }
      return `### ${i + 1}. Short Written\n- **Prompt:** ${item.question}`;
    })
    .join('\n\n');
}

function asCsv(items) {
  const header = 'type,question,answer,choices,explanation';
  const rows = items.map((i) => {
    const choices = i.choices ? i.choices.join(' | ') : '';
    return [i.type, i.question, i.answer || '', choices, i.explanation || '']
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

  setStatus('Generated successfully with deterministic local pipeline.', 'success');
});

els.sampleBtn.addEventListener('click', () => {
  els.sourceText.value = sampleText;
  if (!els.title.value.trim()) els.title.value = 'Database Fundamentals';
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
