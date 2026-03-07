/* =============================================================
   🔧 UNIVERSAL AI ADAPTER SYSTEM
   ─────────────────────────────────────────────────────────────
   Each API has its own adapter with:
     • getConfig()  → default model & endpoint
     • buildRequest(messages, config) → fetch options
     • parseResponse(data) → extract reply text
   Add a new API by copying the CUSTOM template below!
============================================================= */

/* ══ ADAPTERS ═══════════════════════════════════════════════ */

const ADAPTERS = {

  /* ── 1. OPENAI ──────────────────────────────────────────── */
  openai: {
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",

    buildRequest(messages, cfg) {
      return {
        url: cfg.endpoint || this.defaultEndpoint,
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cfg.key}`
          },
          body: JSON.stringify({
            model: cfg.model || this.defaultModel,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000
          })
        }
      };
    },

    parseResponse(data) {
      return data.choices[0].message.content;
    }
  },

  /* ── 2. GEMINI ──────────────────────────────────────────── */
  gemini: {
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",

    buildRequest(messages, cfg) {
      const model   = cfg.model || this.defaultModel;
      const baseUrl = cfg.endpoint || this.defaultEndpoint;
      const url     = `${baseUrl}/${model}:generateContent?key=${cfg.key}`;

      // Convert OpenAI-style messages → Gemini format
      const systemMsg = messages.find(m => m.role === "system");
      const chatMsgs  = messages.filter(m => m.role !== "system");

      const contents = chatMsgs.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      const body = { contents };
      if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] };
      }

      return {
        url,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      };
    },

    parseResponse(data) {
      return data.candidates[0].content.parts[0].text;
    }
  },

  /* ── 3. LLAMA (OLLAMA) ──────────────────────────────────── */
  llama: {
    name: "Llama / Ollama",
    defaultModel: "llama3",
    defaultEndpoint: "http://localhost:11434/api/chat",

    buildRequest(messages, cfg) {
      return {
        url: cfg.endpoint || this.defaultEndpoint,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: cfg.model || this.defaultModel,
            messages: messages,
            stream: false
          })
        }
      };
    },

    parseResponse(data) {
      return data.message.content;
    }
  },

  /* ── 4. CUSTOM / TEMPLATE ───────────────────────────────────
     Copy this block to add any OpenAI-compatible API!
     Examples: Groq, Together AI, Mistral, Perplexity, Cohere…
  ──────────────────────────────────────────────────────────── */
  custom: {
    name: "Custom API",
    defaultModel: "your-model-name",
    defaultEndpoint: "https://your-api-endpoint/chat/completions",

    buildRequest(messages, cfg) {
      return {
        url: cfg.endpoint || this.defaultEndpoint,
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cfg.key}`
            // Add extra headers here if needed:
            // "X-Custom-Header": "value"
          },
          body: JSON.stringify({
            model: cfg.model || this.defaultModel,
            messages: messages,
            // Add extra params here:
            // temperature: 0.7,
            // max_tokens: 1024
          })
        }
      };
    },

    parseResponse(data) {
      // Adjust this to match your API's response structure:
      return data.choices[0].message.content;
      // Alternatives:
      // return data.message.content;    // Ollama-style
      // return data.result;             // custom
      // return data.text;               // some APIs
    }
  }

};

/* ══ APP STATE ══════════════════════════════════════════════ */

let currentAPI      = "openai";
let conversationHistory = [];
let isLoading       = false;

/* ══ SWITCH API ═════════════════════════════════════════════ */

const API_DEFAULTS = {
  openai: { model: "gpt-4o-mini",        endpoint: "" },
  gemini: { model: "gemini-2.5-flash",   endpoint: "" },
  llama:  { model: "llama3",             endpoint: "http://localhost:11434/api/chat" },
  custom: { model: "your-model-name",    endpoint: "https://your-api-endpoint/v1/chat/completions" }
};

function switchAPI(api) {
  currentAPI = api;
  conversationHistory = [];

  // update tabs
  document.querySelectorAll('.api-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab-${api}`).classList.add('active');

  // update defaults
  const d = API_DEFAULTS[api];
  document.getElementById('cfg-model').value    = d.model;
  document.getElementById('cfg-endpoint').value = d.endpoint;
  document.getElementById('cfg-model').placeholder = ADAPTERS[api].defaultModel;

  // toggle endpoint visibility
  const epf = document.getElementById('endpoint-field');
  epf.style.display = (api === 'llama' || api === 'custom') ? 'block' : 'none';

  // update chrome title
  document.getElementById('chrome-title').textContent = `AI CHAT — ${ADAPTERS[api].name.toUpperCase()}`;

  // reset chat
  resetChat();
  showToast(`Switched to ${ADAPTERS[api].name}`, 'success');
}

/* ══ GET CONFIG FROM UI ══════════════════════════════════════ */

function getConfig() {
  return {
    key:      document.getElementById('cfg-key').value.trim(),
    model:    document.getElementById('cfg-model').value.trim(),
    endpoint: document.getElementById('cfg-endpoint').value.trim(),
    system:   document.getElementById('cfg-system').value.trim()
  };
}

/* ══ SEND MESSAGE ════════════════════════════════════════════ */

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text  = input.value.trim();
  if (!text || isLoading) return;

  const cfg = getConfig();

  // Validate key for APIs that need it
  if (currentAPI !== 'llama' && !cfg.key) {
    showToast('⚠ Please enter your API key!', 'error');
    return;
  }

  // hide welcome
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

  // add user message
  appendMessage('user', text);
  input.value = '';
  autoResize(input);

  // build history
  const messages = [];
  if (cfg.system) messages.push({ role: "system", content: cfg.system });
  conversationHistory.push({ role: "user", content: text });
  messages.push(...conversationHistory);

  // show typing
  const typingEl = showTyping();
  setLoading(true);

  try {
    const adapter  = ADAPTERS[currentAPI];
    const { url, options } = adapter.buildRequest(messages, cfg);

    const response = await fetch(url, options);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data  = await response.json();
    const reply = adapter.parseResponse(data);

    conversationHistory.push({ role: "assistant", content: reply });
    typingEl.remove();
    appendMessage('ai', reply);

  } catch (err) {
    typingEl.remove();
    appendMessage('ai', `❌ Error: ${err.message}\n\nCheck your API key, model name, and endpoint.`);
    showToast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

/* ══ UI HELPERS ══════════════════════════════════════════════ */

function appendMessage(role, text) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="avatar ${role === 'ai' ? 'ai' : 'usr'}">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'message ai';
  div.innerHTML = `
    <div class="avatar ai">🤖</div>
    <div class="typing-indicator"><span></span><span></span><span></span></div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function setLoading(v) {
  isLoading = v;
  document.getElementById('send-btn').disabled = v;
  document.getElementById('status-text').textContent = v ? 'GENERATING…' : 'READY';
}

function resetChat() {
  conversationHistory = [];
  const msgs = document.getElementById('messages');
  msgs.innerHTML = `
    <div class="welcome-screen" id="welcome">
      <div class="welcome-icon">🧠</div>
      <h3>Configure & Chat</h3>
      <p>Select your API provider above, paste your key, and start chatting.</p>
      <div class="quick-chips">
        <div class="chip" onclick="sendChip('Explain quantum computing simply')">Explain quantum computing</div>
        <div class="chip" onclick="sendChip('Write a Python hello world')">Python code</div>
        <div class="chip" onclick="sendChip('What is the meaning of life?')">Deep question</div>
        <div class="chip" onclick="sendChip('Help me debug my code')">Debug help</div>
      </div>
    </div>
  `;
}

function sendChip(text) {
  document.getElementById('user-input').value = text;
  sendMessage();
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ══ INIT ════════════════════════════════════════════════════ */

document.getElementById('endpoint-field').style.display = 'none';
document.getElementById('cfg-model').value = 'gpt-4o-mini';