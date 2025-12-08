const scenarioGrid = document.getElementById('scenario-grid');
const chatBody = document.getElementById('chat-body');
const chatTitle = document.getElementById('chat-title');
const chatDescription = document.getElementById('chat-description');
const chatEmpty = document.getElementById('chat-empty');
const chatFeedback = document.getElementById('chat-feedback');
const retryBtn = document.getElementById('retry-btn');
const copyBtn = document.getElementById('copy-btn');
const userInput = document.getElementById('user-input');
const runAgentBtn = document.getElementById('run-agent');
const newRunBtn = document.getElementById('new-run');
const categoryFilters = document.getElementById('category-filters');
const searchInput = document.getElementById('scenario-search');
const refineInput = document.getElementById('scenario-refine');
const metaCategory = document.getElementById('meta-category');
const metaFilename = document.getElementById('meta-filename');
const metaTags = document.getElementById('meta-tags');

const accentPalette = ['#6366f1', '#0ea5e9', '#f59e0b', '#ec4899', '#10b981'];

let scenarios = [];
let scenarioMap = new Map();
let activeScenario = null;
let playing = false;
let playbackToken = 0;
let typingTimer = null;
let activeCategory = 'All';

function setFeedback(message) {
  if (!chatFeedback) return;
  chatFeedback.textContent = message || '';
}

function setAccent(id) {
  const text = String(id || '');
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum += text.charCodeAt(i);
  }
  const color = accentPalette[sum % accentPalette.length];
  document.documentElement.style.setProperty('--primary', color);
}

async function loadScenarios() {
  try {
    const index = await fetch('data/scenarios/index.json').then((res) => res.json());
    scenarios = await Promise.all(
      index.map(async (entry) => {
        const data = await fetch(`data/scenarios/${entry.file}`).then((res) => res.json());
        data.metadata = data.metadata || {};
        if (!data.metadata.filename) data.metadata.filename = entry.file;
        return data;
      })
    );
    scenarioMap = new Map(scenarios.map((s) => [s.id, s]));
    renderCategoryFilters();
    renderScenarioGrid();
    const first = scenarios[0];
    if (first) {
      setActiveScenario(first.id);
    }
  } catch (error) {
    console.error('Failed to load scenarios', error);
    setFeedback('Failed to load scenarios.');
  }
}

function getCategories() {
  const categories = new Set(['All']);
  scenarios.forEach((scenario) => {
    const cat = scenario.metadata?.category;
    if (cat) categories.add(cat);
  });
  return Array.from(categories);
}

function renderCategoryFilters() {
  categoryFilters.innerHTML = '';
  getCategories().forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = `chip ${activeCategory === cat ? 'active' : ''}`;
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      activeCategory = cat;
      renderCategoryFilters();
      renderScenarioGrid();
    });
    categoryFilters.appendChild(chip);
  });
}

function matchesSearch(scenario) {
  const query = `${searchInput.value} ${refineInput.value}`.toLowerCase();
  if (!query.trim()) return true;
  const { title = '', description = '', tags = [] } = scenario.metadata || {};
  return (
    title.toLowerCase().includes(query) ||
    description.toLowerCase().includes(query) ||
    tags.some((tag) => tag.toLowerCase().includes(query))
  );
}

function scenarioInCategory(scenario) {
  if (activeCategory === 'All') return true;
  return scenario.metadata?.category === activeCategory;
}

function setActiveScenario(id) {
  const scenario = scenarioMap.get(id);
  activeScenario = scenario || null;

  document.querySelectorAll('.card').forEach((card) => {
    const isActive = card.dataset.id === id;
    card.classList.toggle('active', isActive);
  });

  const tags = (scenario?.metadata?.tags || []).join(', ') || 'Add tags to improve discovery';
  metaCategory.textContent = scenario?.metadata?.category || 'No category';
  metaFilename.textContent = scenario?.metadata?.filename || '—';
  metaTags.textContent = tags;

  if (scenario) {
    chatTitle.textContent = scenario.metadata?.title || scenario.id;
    chatDescription.textContent = scenario.metadata?.description || '';
    setAccent(scenario.id);
  }
}

function renderScenarioGrid() {
  scenarioGrid.innerHTML = '';
  scenarios
    .filter((scenario) => scenarioInCategory(scenario) && matchesSearch(scenario))
    .sort((a, b) => (a.metadata.order ?? 0) - (b.metadata.order ?? 0))
    .forEach((scenario) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.id = scenario.id;
      const tags = (scenario.metadata.tags || []).slice(0, 3).join(', ');
      card.innerHTML = `
        <div class="meta">
          <span class="icon">📌</span>
          <span>${scenario.metadata.category || 'Uncategorized'}</span>
          <span class="pill">${scenario.metadata.filename}</span>
        </div>
        <h3>${scenario.metadata.title}</h3>
        <p>${scenario.metadata.description}</p>
        <div class="meta">
          <span>${tags}</span>
          <span class="pill">${scenario.id}</span>
        </div>
        <div class="actions">
          <button class="primary-btn" data-id="${scenario.id}">Open Scenario</button>
          <span class="pill">🚀 Cockpit Agent</span>
        </div>
      `;
      card.querySelector('button').addEventListener('click', (event) => {
        event.stopPropagation();
        startScenario(scenario.id);
      });
      card.addEventListener('click', () => startScenario(scenario.id));
      scenarioGrid.appendChild(card);
    });

  if (activeScenario) {
    setActiveScenario(activeScenario.id);
  }
}

function clearChat() {
  chatBody.innerHTML = '';
  if (chatEmpty) {
    chatBody.appendChild(chatEmpty);
    chatEmpty.classList.remove('hidden');
  }
}

function ensureChatActive() {
  if (chatEmpty && chatEmpty.parentElement === chatBody) {
    chatEmpty.remove();
  }
}

function showTypingIndicator(role = 'assistant') {
  const indicator = document.createElement('div');
  indicator.className = `message ${role}`;
  indicator.innerHTML = '<div class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  chatBody.appendChild(indicator);
  chatBody.scrollTop = chatBody.scrollHeight;
  return indicator;
}

function typeText(target, text, token) {
  return new Promise((resolve) => {
    let index = 0;
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    target.textContent = '';
    target.appendChild(cursor);
    function tick() {
      if (token !== playbackToken) return resolve();
      if (index >= text.length) {
        cursor.remove();
        return resolve();
      }
      const char = text[index];
      if (char === '\n') {
        cursor.insertAdjacentHTML('beforebegin', '<br />');
      } else {
        cursor.insertAdjacentText('beforebegin', char);
      }
      index += 1;
      setTimeout(tick, 18);
    }
    tick();
  });
}

async function addMessage(actor, speaker, text, snippetHtml, token, options = {}) {
  ensureChatActive();
  const msg = document.createElement('div');
  msg.className = `message ${actor}`;

  const speakerEl = document.createElement('div');
  speakerEl.className = 'speaker';
  speakerEl.textContent = speaker || (actor === 'assistant' ? 'Model' : 'You');

  const textEl = document.createElement('p');
  textEl.className = 'text';

  msg.appendChild(speakerEl);
  msg.appendChild(textEl);

  if (snippetHtml) {
    const snippet = document.createElement('div');
    snippet.className = 'snippet';
    snippet.innerHTML = snippetHtml;
    msg.appendChild(snippet);
  }

  chatBody.appendChild(msg);
  chatBody.scrollTop = chatBody.scrollHeight;

  if (options.typeOut && text) {
    await typeText(textEl, text, token);
  } else if (text) {
    textEl.innerHTML = text;
  }
}

async function loadSnippet(snippet) {
  if (!snippet) return null;
  const res = await fetch(`data/snippets/${snippet}`);
  return await res.text();
}

async function renderUserStep(step, token) {
  const { message = '', pause = 300, speaker } = step;
  const indicator = showTypingIndicator('user');
  await new Promise((resolve) => setTimeout(resolve, Math.min(1400, Math.max(400, message.length * 20))));
  if (token !== playbackToken) return;
  indicator.remove();
  await addMessage('user', speaker, message, null, token, { typeOut: true });
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
}

async function renderAssistantStep(step, token) {
  const { message = '', pause = 300, speaker, snippet, typingDelay = 800 } = step;
  const indicator = showTypingIndicator('assistant');
  await new Promise((resolve) => setTimeout(resolve, typingDelay));
  if (token !== playbackToken) return;
  indicator.remove();
  let snippetHtml = null;
  if (snippet) {
    try {
      snippetHtml = await loadSnippet(snippet);
    } catch (error) {
      console.error('Failed to load snippet', error);
      snippetHtml = `<div class="snippet"><div style="padding:10px;">Unable to load snippet: ${snippet}</div></div>`;
    }
  }
  await addMessage('assistant', speaker, message, snippetHtml, token, { typeOut: true });
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
}

async function playScenario(scenario, { restart = false, silent = false } = {}) {
  playing = true;
  playbackToken += 1;
  const token = playbackToken;
  setFeedback(restart ? 'Scenario reset. Replaying conversation…' : 'Playing scenario…');
  document.querySelectorAll('.card').forEach((card) => card.classList.add('disabled'));
  retryBtn.disabled = true;
  copyBtn.disabled = true;
  clearInterval(typingTimer);
  clearChat();

  for (const step of scenario.steps) {
    if (token !== playbackToken) break;
    const actor = (step.actor || '').toLowerCase();
    if (actor === 'user' || actor === 'human' || actor === 'player') {
      await renderUserStep(step, token);
    } else {
      await renderAssistantStep(step, token);
    }
  }

  if (token === playbackToken) {
    setFeedback('Scenario complete. Copy or restart the transcript anytime.');
    document.querySelectorAll('.card').forEach((card) => card.classList.remove('disabled'));
    retryBtn.disabled = false;
    copyBtn.disabled = false;
    playing = false;
    if (!silent) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }
}

function startScenario(id, options = {}) {
  if (playing) {
    playbackToken += 1;
  }
  const scenario = scenarioMap.get(id);
  if (!scenario) return;
  activeScenario = scenario;
  setActiveScenario(id);
  playScenario(scenario, options);
}

function handleQuickAction(action) {
  const canned = {
    'build-agent': 'Launching the agent builder canvas. Share the target workflow and data sources to scaffold.',
    'upload-data': 'Opening data intake. Drop your spreadsheet, PDF, or connect a source to start ingestion.',
    'fqa-question': 'Ask me any supplier or sourcing question—I will pull from indexed knowledge.',
    'trigger-run': 'Triggering a fresh agent run with the current configuration and variables.',
    'browse-workflows': 'Here are the available workflows. Pick one to preview or kick off.',
  };

  if (canned[action]) {
    ensureChatActive();
    addMessage('assistant', 'Cockpit Agent', canned[action], null, playbackToken);
  }
}

retryBtn.addEventListener('click', () => {
  if (activeScenario) {
    playScenario(activeScenario, { restart: true });
  } else {
    clearChat();
  }
});

copyBtn.addEventListener('click', async () => {
  const text = chatBody.innerText.trim();
  if (!text) {
    setFeedback('Nothing to copy yet.');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setFeedback('Transcript copied to clipboard.');
  } catch (error) {
    console.error('Copy failed', error);
    setFeedback('Copy unavailable in this browser.');
  }
});

runAgentBtn.addEventListener('click', () => {
  const message = userInput.value.trim();
  if (!message) return;
  ensureChatActive();
  addMessage('user', 'You', message, null, playbackToken);
  userInput.value = '';
  addMessage('assistant', 'Cockpit Agent', "I'll route this to the right workflow and respond with an action plan.", null, playbackToken);
});

newRunBtn.addEventListener('click', () => {
  clearChat();
  userInput.value = '';
  setFeedback('New thread started.');
});

searchInput.addEventListener('input', renderScenarioGrid);
refineInput.addEventListener('input', renderScenarioGrid);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && playing) {
    playbackToken += 1;
    setFeedback('Playback stopped.');
    document.querySelectorAll('.card').forEach((card) => card.classList.remove('disabled'));
    retryBtn.disabled = false;
    copyBtn.disabled = false;
    playing = false;
  }
});

document.querySelectorAll('.action-buttons .ghost-btn').forEach((btn) => {
  btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
});

loadScenarios();
