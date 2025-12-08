const scenarioGrid = document.getElementById('scenario-grid');
const chatBody = document.getElementById('chat-body');
const chatTitle = document.getElementById('chat-title');
const chatDescription = document.getElementById('chat-description');
const retryBtn = document.getElementById('retry-btn');
const userInput = document.getElementById('user-input');
const runAgentBtn = document.getElementById('run-agent');
const newRunBtn = document.getElementById('new-run');
const categoryFilters = document.getElementById('category-filters');
const searchInput = document.getElementById('scenario-search');
const refineInput = document.getElementById('scenario-refine');

let scenarios = [];
let activeScenario = null;
let playing = false;
let typingTimer = null;
let activeCategory = 'All';

async function loadScenarios() {
  try {
    const index = await fetch('data/scenarios/index.json').then((res) => res.json());
    scenarios = await Promise.all(
      index.map(async (entry) => {
        const data = await fetch(`data/scenarios/${entry.file}`).then((res) => res.json());
        return data;
      })
    );
    renderCategoryFilters();
    renderScenarioGrid();
  } catch (error) {
    console.error('Failed to load scenarios', error);
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

function renderScenarioGrid() {
  scenarioGrid.innerHTML = '';
  scenarios
    .filter((scenario) => scenarioInCategory(scenario) && matchesSearch(scenario))
    .sort((a, b) => (a.metadata.order ?? 0) - (b.metadata.order ?? 0))
    .forEach((scenario) => {
      const card = document.createElement('article');
      card.className = 'card';
      const tags = (scenario.metadata.tags || []).slice(0, 3).join(', ');
      card.innerHTML = `
        <div class="meta">
          <span class="icon">📌</span>
          <span>${scenario.metadata.category}</span>
          <span class="pill">Action</span>
        </div>
        <h3>${scenario.metadata.title}</h3>
        <p>${scenario.metadata.description}</p>
        <div class="meta">
          <span>${tags}</span>
          <span class="pill">Agent: Chat Agent</span>
        </div>
        <div class="actions">
          <label class="chip"><input type="checkbox" aria-label="Select ${scenario.metadata.title}"> Select</label>
          <button class="primary-btn" data-id="${scenario.id}">Open Scenario</button>
          <span class="pill">🚀 Cockpit Agent</span>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => startScenario(scenario.id));
      scenarioGrid.appendChild(card);
    });
}

function addMessage(actor, speaker, text, snippetHtml = null) {
  const msg = document.createElement('div');
  msg.className = `message ${actor}`;

  const speakerEl = document.createElement('div');
  speakerEl.className = 'speaker';
  speakerEl.textContent = speaker || (actor === 'assistant' ? 'Model' : 'You');

  const textEl = document.createElement('p');
  textEl.className = 'text';
  textEl.innerHTML = text;

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
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message assistant typing-indicator';
  indicator.innerHTML = '<div class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  chatBody.appendChild(indicator);
  chatBody.scrollTop = chatBody.scrollHeight;
  return indicator;
}

function clearTypingIndicator(indicator) {
  if (indicator && indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
}

async function loadSnippet(snippet) {
  if (!snippet) return null;
  const res = await fetch(`data/snippets/${snippet}`);
  return await res.text();
}

async function simulateUserStep(step) {
  userInput.value = '';
  const { message, pause = 400 } = step;
  const chars = message.split('');
  let idx = 0;

  return new Promise((resolve) => {
    typingTimer = setInterval(() => {
      userInput.value += chars[idx];
      idx += 1;
      if (idx >= chars.length) {
        clearInterval(typingTimer);
        setTimeout(() => {
          addMessage('user', step.speaker, message);
          userInput.value = '';
          resolve();
        }, pause);
      }
    }, 18);
  });
}

async function simulateAssistantStep(step) {
  const { message, typingDelay = 800, pause = 300, snippet } = step;
  const indicator = showTypingIndicator();
  const snippetHtml = await loadSnippet(snippet);
  await new Promise((resolve) => setTimeout(resolve, typingDelay));
  clearTypingIndicator(indicator);
  addMessage('assistant', step.speaker, message, snippetHtml);
  if (pause) {
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
}

async function playScenario(scenario) {
  playing = true;
  chatBody.innerHTML = '';
  chatTitle.textContent = scenario.metadata.title;
  chatDescription.textContent = scenario.metadata.description;
  for (const step of scenario.steps) {
    if (!playing) break;
    if (step.actor === 'user') {
      await simulateUserStep(step);
    } else {
      await simulateAssistantStep(step);
    }
  }
  playing = false;
}

function startScenario(id) {
  if (playing) {
    playing = false;
  }
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) return;
  activeScenario = scenario;
  playScenario(scenario);
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
    addMessage('assistant', 'Cockpit Agent', canned[action]);
  }
}

retryBtn.addEventListener('click', () => {
  if (activeScenario) {
    playing = false;
    clearInterval(typingTimer);
    playScenario(activeScenario);
  } else {
    chatBody.innerHTML = '';
  }
});

runAgentBtn.addEventListener('click', () => {
  const message = userInput.value.trim();
  if (!message) return;
  addMessage('user', 'You', message);
  userInput.value = '';
  addMessage('assistant', 'Cockpit Agent', "I'll route this to the right workflow and respond with an action plan.");
});

newRunBtn.addEventListener('click', () => {
  chatBody.innerHTML = '';
  userInput.value = '';
});

searchInput.addEventListener('input', renderScenarioGrid);
refineInput.addEventListener('input', renderScenarioGrid);

document.querySelectorAll('.action-buttons .ghost-btn').forEach((btn) => {
  btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
});

loadScenarios();
