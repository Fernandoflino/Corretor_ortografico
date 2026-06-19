const BUTTON_ID = "corretor-ortografico-btn";
const PANEL_ID = "corretor-ortografico-panel";

const ACTION_ICON_SELECTOR = [
  'span[data-icon="send"]',
  'span[data-icon="ptt"]',
  'span[data-icon="wds-ic-send-filled"]',
  'span[data-icon="wds-ic-mic-filled"]',
  'span[data-icon="mic"]',
].join(",");

const PENCIL_SVG = `
<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
</svg>`;

const ACTIONS = [
  {
    id: "revisar",
    label: "Revisar",
    loadingText: "Corrigindo ortografia...",
    resultTitle: "Sugestão de correção",
  },
  {
    id: "reescrever",
    label: "Reescrever",
    loadingText: "Reescrevendo o texto...",
    resultTitle: "Sugestão de texto reescrito",
  },
];

let observer = null;
let currentPanel = null;
let btnEl = null;

function findActionButton() {
  const icon = document.querySelector(ACTION_ICON_SELECTOR);
  if (!icon) return null;
  return icon.closest('button, div[role="button"]');
}

function findComposeTextbox() {
  return document.querySelector('footer div[contenteditable="true"][role="textbox"]');
}

// O botão de mic/enviar do WhatsApp fica dentro de um contêiner com
// fundo circular próprio. Inserir nosso botão ali dentro (ou como
// irmão direto) faz ele herdar esse fundo/clipping e distorcer.
// Por isso o botão vive fora dessa árvore, em document.body, e é
// posicionado com position:fixed ao lado esquerdo do botão de enviar.
function ensureButton() {
  if (btnEl && document.body.contains(btnEl)) return btnEl;

  btnEl = document.createElement("button");
  btnEl.id = BUTTON_ID;
  btnEl.type = "button";
  btnEl.title = "Corrigir ortografia";
  btnEl.innerHTML = PENCIL_SVG;
  btnEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const textbox = findComposeTextbox();
    if (textbox) handlePencilClick(textbox);
  });

  document.body.appendChild(btnEl);
  return btnEl;
}

function positionButton() {
  const actionButton = findActionButton();
  const textbox = findComposeTextbox();
  const btn = ensureButton();

  if (!actionButton || !textbox) {
    btn.style.display = "none";
    return;
  }

  const rect = actionButton.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    btn.style.display = "none";
    return;
  }

  const size = 32;

  // A largura do contenteditable é a coluna inteira disponível (não o
  // texto digitado em si), então usar a borda direita dele como limite
  // empurrava o botão por cima do botão de enviar mesmo com pouco
  // texto. Por isso ficamos sempre encostados à esquerda do botão de
  // enviar/mic, com fundo opaco para não "engolir" visualmente o texto
  // nos raros casos em que a linha realmente chega até a borda.
  btn.style.display = "flex";
  btn.style.width = `${size}px`;
  btn.style.height = `${size}px`;
  btn.style.left = `${rect.left - size - 4}px`;
  btn.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
}

function readTextboxText(textbox) {
  return textbox.innerText.replace(/\n+$/, "");
}

const LOG_PREFIX = "[CorretorOrtografico]";

function dispatchCtrlA(el) {
  const opts = { key: "a", code: "KeyA", ctrlKey: true, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

// Despachar "beforeinput" linha por linha (insertText/insertLineBreak)
// fazia o editor perder pedaços do texto — provavelmente porque, sendo
// eventos sintéticos, não trazem "targetRanges" (só eventos nativos
// têm), e os disparos em sequência rápida confundiam o estado interno
// do editor. Um único "paste" é o que comprovadamente funciona sem
// perder nem reverter conteúdo. Para evitar que cada quebra de linha
// vire um parágrafo novo (com espaço extra), fornecemos também
// "text/html" com <br> entre as linhas — paste handlers de editores
// ricos costumam priorizar HTML quando disponível, então o <br> deve
// ser tratado como quebra "soft", igual ao Shift+Enter manual.
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pasteText(el, text) {
  const html = text.split("\n").map(escapeHtml).join("<br>");
  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", text);
  dataTransfer.setData("text/html", html);
  const pasteEvent = new ClipboardEvent("paste", {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true,
  });
  return el.dispatchEvent(pasteEvent);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeTextboxText(textbox, text) {
  console.log(LOG_PREFIX, "writeTextboxText: início. Texto atual:", JSON.stringify(textbox.innerText));
  console.log(LOG_PREFIX, "writeTextboxText: texto a aplicar:", JSON.stringify(text));

  textbox.focus();

  // Seleciona tudo (Range API + Ctrl+A real, que o editor processa
  // pelo próprio sistema de comandos — já confirmado funcionar).
  const range = document.createRange();
  range.selectNodeContents(textbox);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchCtrlA(textbox);

  await delay(50);
  console.log(LOG_PREFIX, "Depois do Ctrl+A e da espera. innerText ainda:", JSON.stringify(textbox.innerText));

  const notCancelled = pasteText(textbox, text);
  console.log(LOG_PREFIX, "paste despachado. Cancelado pelo editor?", !notCancelled);
  console.log(LOG_PREFIX, "Logo depois do paste. innerText agora:", JSON.stringify(textbox.innerText));

  setTimeout(() => {
    console.log(LOG_PREFIX, "1s depois: innerText final:", JSON.stringify(textbox.innerText));
  }, 1000);
}

function closePanel() {
  if (currentPanel) {
    currentPanel.remove();
    currentPanel = null;
  }
  document.removeEventListener("mousedown", handleOutsideClick, true);
}

function handleOutsideClick(event) {
  if (!currentPanel) return;
  if (currentPanel.contains(event.target) || event.target.id === BUTTON_ID) return;
  closePanel();
}

function createPanel(textbox) {
  closePanel();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  // Alinha o painel acima da barra de composição. Em vez de usar a
  // largura da "footer" (que pode incluir área reservada pra barra de
  // rolagem da lista de mensagens), usamos a borda direita do próprio
  // botão de enviar/mic como limite — ele é garantidamente visível
  // dentro da coluna de conversa, sem sobrepor nada.
  const bar = textbox.closest("footer") || textbox;
  const rect = bar.getBoundingClientRect();
  const actionButton = findActionButton();
  const actionRect = actionButton ? actionButton.getBoundingClientRect() : null;
  const margin = 8;
  const left = Math.max(margin, rect.left);
  const rightBound = actionRect ? actionRect.right : rect.right;
  const right = Math.min(rightBound, window.innerWidth - margin);
  const width = Math.max(right - left, 0);

  console.log(LOG_PREFIX, "createPanel: window.innerWidth =", window.innerWidth);
  console.log(LOG_PREFIX, "createPanel: footer rect =", JSON.stringify(rect));
  console.log(LOG_PREFIX, "createPanel: actionButton rect =", JSON.stringify(actionRect));
  console.log(LOG_PREFIX, "createPanel: left =", left, "width =", width, "right (calculado) =", left + width);

  panel.style.position = "fixed";
  panel.style.left = `${left}px`;
  panel.style.width = `${width}px`;
  panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;

  document.body.appendChild(panel);
  currentPanel = panel;
  document.addEventListener("mousedown", handleOutsideClick, true);
  return panel;
}

function renderMenu(panel, textbox) {
  panel.innerHTML = `
    <div class="co-title">O que você quer fazer?</div>
    <div class="co-menu"></div>
  `;
  const menuEl = panel.querySelector(".co-menu");
  ACTIONS.forEach((action) => {
    const item = document.createElement("button");
    item.className = "co-menu-item";
    item.textContent = action.label;
    item.addEventListener("click", () => {
      const text = readTextboxText(textbox);
      if (!text.trim()) {
        closePanel();
        return;
      }
      requestAction(panel, action, text, textbox);
    });
    menuEl.appendChild(item);
  });
}

function renderLoading(panel, loadingText) {
  panel.innerHTML = `
    <div class="co-title">${loadingText}</div>
    <div class="co-loading">Aguarde um instante.</div>
  `;
}

function renderError(panel, message, onRetry) {
  panel.innerHTML = `
    <div class="co-title">Não foi possível corrigir</div>
    <div class="co-error"></div>
    <div class="co-actions">
      <button class="co-btn co-btn-secondary" data-action="cancel">Fechar</button>
      <button class="co-btn co-btn-primary" data-action="retry">Tentar de novo</button>
    </div>
  `;
  panel.querySelector(".co-error").textContent = message;
  panel.querySelector('[data-action="cancel"]').addEventListener("click", closePanel);
  panel.querySelector('[data-action="retry"]').addEventListener("click", onRetry);
}

function renderSuggestion(panel, suggestedText, textbox, resultTitle) {
  panel.innerHTML = `
    <div class="co-title">${resultTitle}</div>
    <textarea class="co-textarea"></textarea>
    <div class="co-actions">
      <button class="co-btn co-btn-secondary" data-action="cancel">Cancelar</button>
      <button class="co-btn co-btn-secondary" data-action="rewrite">Reescrever</button>
      <button class="co-btn co-btn-primary" data-action="apply">Aplicar</button>
    </div>
  `;
  const textarea = panel.querySelector(".co-textarea");
  textarea.value = suggestedText;

  panel.querySelector('[data-action="cancel"]').addEventListener("click", closePanel);
  panel.querySelector('[data-action="rewrite"]').addEventListener("click", () => {
    // Reescreve a partir do que está no textarea (já pode ser uma
    // sugestão anterior), permitindo gerar variações em sequência.
    const currentText = textarea.value;
    if (!currentText.trim()) return;
    const rewriteAction = ACTIONS.find((a) => a.id === "reescrever");
    requestAction(panel, rewriteAction, currentText, textbox);
  });
  panel.querySelector('[data-action="apply"]').addEventListener("click", () => {
    console.log(LOG_PREFIX, "Botão Aplicar clicado.");
    // Busca a caixa de novo: o DOM do WhatsApp pode ter re-renderizado
    // enquanto a IA processava, deixando a referência original obsoleta.
    const liveTextbox = findComposeTextbox() || textbox;
    console.log(LOG_PREFIX, "liveTextbox encontrada?", !!liveTextbox, "é a mesma da original?", liveTextbox === textbox);
    writeTextboxText(liveTextbox, textarea.value);
    closePanel();
  });
}

function requestAction(panel, action, text, textbox) {
  renderLoading(panel, action.loadingText);
  chrome.runtime.sendMessage({ type: "AI_ACTION", action: action.id, text }, (response) => {
    if (!currentPanel || currentPanel !== panel) return;
    if (chrome.runtime.lastError) {
      renderError(panel, chrome.runtime.lastError.message, () =>
        requestAction(panel, action, text, textbox)
      );
      return;
    }
    if (!response?.ok) {
      renderError(panel, response?.error || "Erro desconhecido.", () =>
        requestAction(panel, action, text, textbox)
      );
      return;
    }
    renderSuggestion(panel, response.text, textbox, action.resultTitle);
  });
}

function handlePencilClick(textbox) {
  const text = readTextboxText(textbox);
  if (!text.trim()) return;

  const panel = createPanel(textbox);
  renderMenu(panel, textbox);
}

function startObserving() {
  if (observer) return;
  observer = new MutationObserver(() => positionButton());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", positionButton);
  window.addEventListener("scroll", positionButton, true);
  positionButton();
}

startObserving();
