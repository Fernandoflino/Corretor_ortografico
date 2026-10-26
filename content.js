const LOG_PREFIX = "[CorretorOrtografico]";
const BUTTON_ID = "corretor-ortografico-btn";
const PANEL_ID = "corretor-ortografico-panel";

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

// Os seletores da página do WhatsApp não ficam no código: são descobertos
// pelo botão "Detectar com IA" do popup e salvos em chrome.storage.sync.
// Sem eles, o lápis não aparece.
const custom = { textbox: "", send: "" };

function applyCustomSelectors(settings) {
  custom.textbox = (settings.textboxSelector || "").trim();
  custom.send = (settings.sendSelector || "").trim();
}

chrome.storage.sync.get(["textboxSelector", "sendSelector"], applyCustomSelectors);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.textboxSelector) custom.textbox = (changes.textboxSelector.newValue || "").trim();
  if (changes.sendSelector) custom.send = (changes.sendSelector.newValue || "").trim();
  positionButton();
});

function queryCustom(selector) {
  if (!selector) return null;
  try {
    return (
      [...document.querySelectorAll(selector)].find((el) => !el.closest("#side") && isVisible(el)) || null
    );
  } catch (err) {
    warnOnce("badselector:" + selector, "Seletor salvo inválido:", selector);
    return null;
  }
}

function isVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Evita inundar o console: o MutationObserver chama positionButton()
// o tempo todo, então só avisa uma vez.
const warned = new Set();
function warnOnce(key, ...args) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(LOG_PREFIX, ...args);
}

function findComposeTextbox() {
  return queryCustom(custom.textbox);
}

function findActionButton() {
  return queryCustom(custom.send);
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
    // Busca a caixa na hora do clique (não usa referência guardada),
    // porque o WhatsApp pode ter redesenhado a tela desde o último
    // posicionamento do botão.
    handlePencilClick(findComposeTextbox());
  });

  document.body.appendChild(btnEl);
  return btnEl;
}

function positionButton() {
  const actionButton = findActionButton();
  const textbox = findComposeTextbox();
  const btn = ensureButton();

  // Sem caixa de mensagem não há conversa aberta: esconde o botão.
  if (!textbox) {
    btn.style.display = "none";
    return;
  }

  const size = 32;

  // Sem o botão de enviar/mic (seletores desatualizados), mantém o lápis
  // visível encostado à direita da caixa de mensagem, em vez de sumir.
  // A busca de verdade acontece no clique.
  let rect = actionButton ? actionButton.getBoundingClientRect() : null;
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    const tr = textbox.getBoundingClientRect();
    if (tr.width === 0 && tr.height === 0) {
      btn.style.display = "none";
      return;
    }
    rect = { left: tr.right, top: tr.top, height: Math.max(tr.height, size) };
  }

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
  const margin = 8;

  // Alinha o painel acima da barra de composição. Em vez de usar a
  // largura da "footer" (que pode incluir área reservada pra barra de
  // rolagem da lista de mensagens), usamos a borda direita do próprio
  // botão de enviar/mic como limite — ele é garantidamente visível
  // dentro da coluna de conversa, sem sobrepor nada.
  const bar = textbox ? textbox.closest("footer") || textbox : null;
  const rect = bar
    ? bar.getBoundingClientRect()
    : { left: margin, right: window.innerWidth - margin, top: window.innerHeight - 80 };
  const actionButton = findActionButton();
  const actionRect = actionButton ? actionButton.getBoundingClientRect() : null;
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
    <label class="co-toggle">
      <input type="checkbox" id="co-highlight-toggle" />
      Destacar partes importantes (negrito/itálico)
    </label>
    <div class="co-menu"></div>
  `;

  // Interruptor permanente: uma vez ativado, fica salvo e passa a
  // valer para toda chamada de Revisar/Reescrever (não só nesta vez) —
  // por isso lê/grava direto em chrome.storage.sync, sem precisar
  // reativar a cada uso.
  const toggle = panel.querySelector("#co-highlight-toggle");
  chrome.storage.sync.get(["highlightEnabled"], (settings) => {
    toggle.checked = !!settings.highlightEnabled;
  });
  toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ highlightEnabled: toggle.checked });
  });

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

  // Lê o interruptor de "destacar partes importantes" salvo (em vez de
  // depender do checkbox do menu inicial, que pode nem estar mais na
  // tela quando isso roda de novo a partir do botão "Reescrever" da
  // sugestão) — assim vale para qualquer chamada de IA, sempre.
  chrome.storage.sync.get(["highlightEnabled"], (settings) => {
    chrome.runtime.sendMessage(
      { type: "AI_ACTION", action: action.id, text, highlight: !!settings.highlightEnabled },
      (response) => {
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
      }
    );
  });
}

// Equivalente ao comando de console usado para diagnóstico manual
// (copiar o HTML do rodapé), mas só com a estrutura: remove texto das
// mensagens e classes, para não vazar conversa nem poluir o log.
const SNAPSHOT_MAX_CHARS = 20000;
const STRIPPED_ATTRIBUTES = ["class", "style", "src", "href", "alt", "title", "value"];

// Só a estrutura do rodapé: sem texto de mensagens, sem classes (geradas
// e instáveis) e sem atributos que possam trazer dados pessoais. O
// aria-label do campo de texto traz o nome do contato/grupo, então sai.
function getComposerSnapshot() {
  // Não pode depender dos seletores salvos (é justamente o que está sendo
  // descoberto): pega o último campo editável visível fora do painel lateral
  // (a busca de conversas também é contenteditable).
  const box =
    [...document.querySelectorAll('[contenteditable="true"]')]
      .filter((el) => !el.closest("#side") && isVisible(el))
      .pop() || null;
  const main = document.querySelector("#main");
  let root = null;
  if (box) {
    root = box.closest("footer");
    // Sem <footer>: sobe até a linha que contém a caixa e os botões.
    for (let i = 0, el = box; !root && i < 4 && el.parentElement; i++) {
      el = el.parentElement;
      if (i === 3) root = el;
    }
  }
  // Sem achar a caixa, o rodapé costuma ser o último filho de #main.
  root = root || main?.querySelector("footer") || main?.lastElementChild || document.querySelector("footer");
  if (!root) return "";

  const clone = root.cloneNode(true);
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach((t) => t.remove());
  clone.querySelectorAll("*").forEach((el) => {
    STRIPPED_ATTRIBUTES.forEach((attr) => el.removeAttribute(attr));
    if (el.hasAttribute("contenteditable")) el.removeAttribute("aria-label");
  });
  return clone.outerHTML.slice(0, SNAPSHOT_MAX_CHARS);
}

function validateSelector(selector, { allowSide }) {
  try {
    return [...document.querySelectorAll(selector)].some(
      (el) => isVisible(el) && (allowSide || !el.closest("#side"))
    );
  } catch (err) {
    return false;
  }
}

// Pede à IA os seletores a partir da estrutura do rodapé, confere se eles
// realmente acham algo na página viva e só então salva.
function detectSelectorsWithAI() {
  return new Promise((resolve, reject) => {
    const snapshot = getComposerSnapshot();
    if (!snapshot) {
      console.warn(LOG_PREFIX, "Rodapé não encontrado. #main:", !!document.querySelector("#main"),
        "| footer:", document.querySelectorAll("footer").length,
        "| contenteditable:", document.querySelectorAll('[contenteditable="true"]').length);
      reject(new Error("Não encontrei o rodapé da conversa. Abra uma conversa, clique no campo de mensagem e tente de novo."));
      return;
    }
    chrome.runtime.sendMessage({ type: "AI_DETECT", html: snapshot }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Erro desconhecido."));
        return;
      }
      const { textbox, send } = response.selectors;
      if (!validateSelector(textbox, { allowSide: false })) {
        reject(new Error(`A IA sugeriu um seletor que não funciona para a caixa de mensagem: ${textbox}`));
        return;
      }
      // O botão de enviar é opcional: o lápis tem posição de reserva.
      const sendOk = send && validateSelector(send, { allowSide: false });
      const toSave = { textboxSelector: textbox, sendSelector: sendOk ? send : "" };
      chrome.storage.sync.set(toSave, () => {
        applyCustomSelectors(toSave);
        positionButton();
        resolve({ textbox: toSave.textboxSelector, send: toSave.sendSelector });
      });
    });
  });
}

function renderDetectResult(panel, result) {
  panel.innerHTML = `
    <div class="co-title">Seletores salvos</div>
    <div class="co-loading">Caixa de mensagem: <code class="co-code-textbox"></code></div>
    <div class="co-loading">Botão de enviar: <code class="co-code-send"></code></div>
    <div class="co-actions">
      <button class="co-btn co-btn-primary" data-action="close">Fechar</button>
    </div>
  `;
  panel.querySelector(".co-code-textbox").textContent = result.textbox;
  panel.querySelector(".co-code-send").textContent = result.send || "(não confirmado; usando posição automática)";
  panel.querySelector('[data-action="close"]').addEventListener("click", closePanel);
}

function runDetection(panel) {
  renderLoading(panel, "Detectando com IA...");
  detectSelectorsWithAI()
    .then((result) => {
      if (currentPanel !== panel) return;
      renderDetectResult(panel, result);
    })
    .catch((error) => {
      if (currentPanel !== panel) return;
      renderError(panel, error.message, () => runDetection(panel));
    });
}

// Chamado pelo popup ("Detectar com IA") sem precisar do painel do lápis.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "DETECT_SELECTORS") return;
  detectSelectorsWithAI()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

function renderNotFound(panel) {
  panel.innerHTML = `
    <div class="co-title">Não encontrei a caixa de mensagem</div>
    <div class="co-loading">O WhatsApp pode ter mudado a página. A IA pode descobrir os novos seletores a partir da estrutura do rodapé (sem enviar o texto das conversas).</div>
    <div class="co-actions">
      <button class="co-btn co-btn-secondary" data-action="cancel">Fechar</button>
      <button class="co-btn co-btn-primary" data-action="detect">Detectar com IA</button>
    </div>
  `;
  panel.querySelector('[data-action="cancel"]').addEventListener("click", closePanel);
  panel.querySelector('[data-action="detect"]').addEventListener("click", () => runDetection(panel));
}

function handlePencilClick(textbox) {
  if (!textbox) {
    const panel = createPanel(null);
    renderNotFound(panel);
    return;
  }
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
