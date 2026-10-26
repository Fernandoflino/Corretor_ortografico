const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_REVISAR_PROMPT =
  "Você é um corretor ortográfico e gramatical em português do Brasil, especializado em deixar " +
  "mensagens de WhatsApp organizadas. " +
  "Corrija erros de ortografia, gramática, acentuação e pontuação do texto do usuário, mantendo o " +
  "sentido e o idioma originais. " +
  "Além de corrigir, reorganize a formatação para ficar mais legível, usando os recursos do WhatsApp:\n" +
  "- Quando um grupo de linhas consecutivas representar itens relacionados (medidas, especificações, " +
  "quantidades, valores), formate-as como lista, cada item em uma linha própria iniciada por \"- \".\n" +
  "- Cole essa lista imediatamente abaixo da frase ou título que a introduz, SEM linha em branco entre eles.\n" +
  "- Mantenha uma linha em branco só entre seções/grupos de assuntos diferentes, nunca dentro do mesmo grupo.\n" +
  "- Não use negrito, itálico ou qualquer outra marcação além do \"- \" das listas, a menos que o " +
  "texto original já as tivesse.\n" +
  "- Não pule linhas desnecessariamente nem adicione conteúdo novo: só reorganize a formatação " +
  "preservando o conteúdo original.\n\n" +
  "Exemplo de entrada:\n" +
  "Sacola de algodão 210 g/m² com 16 fios e alças costuradas na parte interna.\n\n" +
  "Altura: 41 cm\nLargura: 38 cm – com logo do evento.\n\n" +
  "IMPRESSÃO MÉDIA\n\n" +
  "Quantidade: 4.000 unidades\nValor unitário: R$ 16,50\nValor total: R$ 66.000,00\n\n" +
  "Exemplo de saída esperada:\n" +
  "Sacola de algodão 210 g/m² com 16 fios e alças costuradas na parte interna.\n" +
  "- Altura: 41 cm\n- Largura: 38 cm – com logo do evento.\n\n" +
  "IMPRESSÃO MÉDIA\n" +
  "- Quantidade: 4.000 unidades\n- Valor unitário: R$ 16,50\n- Valor total: R$ 66.000,00\n\n" +
  "Não adicione comentários, explicações, aspas ou qualquer texto extra. " +
  "Responda apenas com o texto corrigido.";
const DEFAULT_REESCREVER_PROMPT =
  "Você é um assistente de escrita em português do Brasil, especializado em deixar mensagens de " +
  "WhatsApp organizadas. " +
  "Reescreva o texto do usuário com outras palavras, gerando uma versão nova, mantendo o mesmo " +
  "sentido, o mesmo idioma e o tom geral, mas com redação diferente da original. " +
  "Além de reescrever, reorganize a formatação para ficar mais legível, usando os recursos do WhatsApp:\n" +
  "- Quando um grupo de linhas consecutivas representar itens relacionados (medidas, especificações, " +
  "quantidades, valores), formate-as como lista, cada item em uma linha própria iniciada por \"- \".\n" +
  "- Cole essa lista imediatamente abaixo da frase ou título que a introduz, SEM linha em branco entre eles.\n" +
  "- Mantenha uma linha em branco só entre seções/grupos de assuntos diferentes, nunca dentro do mesmo grupo.\n" +
  "- Não use negrito, itálico ou qualquer outra marcação além do \"- \" das listas, a menos que o " +
  "texto original já as tivesse.\n" +
  "- Não pule linhas desnecessariamente: só reorganize a formatação preservando o sentido original.\n\n" +
  "Exemplo de entrada:\n" +
  "Sacola de algodão 210 g/m² com 16 fios e alças costuradas na parte interna.\n\n" +
  "Altura: 41 cm\nLargura: 38 cm – com logo do evento.\n\n" +
  "IMPRESSÃO MÉDIA\n\n" +
  "Quantidade: 4.000 unidades\nValor unitário: R$ 16,50\nValor total: R$ 66.000,00\n\n" +
  "Exemplo de saída esperada:\n" +
  "Sacola de algodão 210 g/m² com 16 fios e alças costuradas na parte interna.\n" +
  "- Altura: 41 cm\n- Largura: 38 cm – com logo do evento.\n\n" +
  "IMPRESSÃO MÉDIA\n" +
  "- Quantidade: 4.000 unidades\n- Valor unitário: R$ 16,50\n- Valor total: R$ 66.000,00\n\n" +
  "Não adicione comentários, explicações, aspas ou qualquer texto extra. " +
  "Responda apenas com o texto reescrito.";

const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const promptInput = document.getElementById("prompt");
const rewritePromptInput = document.getElementById("rewritePrompt");
const statusEl = document.getElementById("status");
const htmlPasteInput = document.getElementById("htmlPaste");
const textboxSelectorInput = document.getElementById("textboxSelector");
const sendSelectorInput = document.getElementById("sendSelector");
const detectStatusEl = document.getElementById("detectStatus");

chrome.storage.sync.get(
  ["openrouterApiKey", "openrouterModel", "revisarPrompt", "reescreverPrompt", "textboxSelector", "sendSelector"],
  (settings) => {
    textboxSelectorInput.value = settings.textboxSelector || "";
    sendSelectorInput.value = settings.sendSelector || "";
    apiKeyInput.value = settings.openrouterApiKey || "";
    modelInput.value = settings.openrouterModel || DEFAULT_MODEL;
    promptInput.value = settings.revisarPrompt || DEFAULT_REVISAR_PROMPT;
    rewritePromptInput.value = settings.reescreverPrompt || DEFAULT_REESCREVER_PROMPT;
  }
);

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      openrouterApiKey: apiKeyInput.value.trim(),
      openrouterModel: modelInput.value.trim() || DEFAULT_MODEL,
      revisarPrompt: promptInput.value.trim() || DEFAULT_REVISAR_PROMPT,
      reescreverPrompt: rewritePromptInput.value.trim() || DEFAULT_REESCREVER_PROMPT,
      textboxSelector: textboxSelectorInput.value.trim(),
      sendSelector: sendSelectorInput.value.trim(),
    },
    () => {
      statusEl.textContent = "Salvo!";
      setTimeout(() => (statusEl.textContent = ""), 2000);
    }
  );
});

// Monta um seletor só com atributos semânticos. As classes do WhatsApp
// (x78zum5...) são geradas e mudam a cada versão, então ficam de fora.
function buildSelector(el) {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute("data-testid");
  if (testId) return `${tag}[data-testid="${testId}"]`;
  let sel = tag;
  if (el.getAttribute("contenteditable") === "true") sel += '[contenteditable="true"]';
  if (el.getAttribute("role")) sel += `[role="${el.getAttribute("role")}"]`;
  const label = el.getAttribute("aria-label");
  if (tag === "button" && label) sel += `[aria-label="${label.replace(/"/g, '\\"')}"]`;
  else if (el.getAttribute("data-tab")) sel += `[data-tab="${el.getAttribute("data-tab")}"]`;
  return sel;
}

// DOMParser não executa scripts nem carrega recursos: o HTML colado é
// apenas lido. Só os atributos de dois elementos são usados; o texto das
// mensagens é descartado.
function detectSelectors(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const textbox =
    doc.querySelector('[contenteditable="true"][role="textbox"]') ||
    doc.querySelector('[contenteditable="true"]');
  const buttons = [...doc.querySelectorAll("button")];
  const send =
    buttons.find((b) => /enviar|send/i.test(b.getAttribute("aria-label") || "")) ||
    buttons.find((b) => b.getAttribute("data-tab") === "11") ||
    buttons[buttons.length - 1];
  return {
    textbox: textbox ? buildSelector(textbox) : "",
    send: send ? buildSelector(send) : "",
    doc,
  };
}

document.getElementById("detect").addEventListener("click", () => {
  const html = htmlPasteInput.value.trim();
  if (!html) {
    detectStatusEl.textContent = "Cole o HTML primeiro.";
    return;
  }
  const found = detectSelectors(html);
  const problems = [];
  if (!found.textbox) problems.push("caixa de mensagem");
  else if (found.doc.querySelectorAll(found.textbox).length !== 1) problems.push("caixa (seletor ambíguo)");
  if (!found.send) problems.push("botão de enviar");
  else if (found.doc.querySelectorAll(found.send).length < 1) problems.push("botão de enviar");

  if (found.textbox) textboxSelectorInput.value = found.textbox;
  if (found.send) sendSelectorInput.value = found.send;
  htmlPasteInput.value = "";
  detectStatusEl.textContent = problems.length
    ? `Atenção: não deu para confirmar ${problems.join(" e ")}. Confira os campos.`
    : "Detectado! Clique em Salvar e recarregue o WhatsApp Web.";
});

const detectAIStatusEl = document.getElementById("detectAIStatus");

document.getElementById("detectAI").addEventListener("click", async () => {
  detectAIStatusEl.textContent = "Detectando...";
  try {
    const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*", currentWindow: true });
    if (!tab) throw new Error("Abra o WhatsApp Web nesta janela e tente de novo.");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "DETECT_SELECTORS" });
    if (!response?.ok) throw new Error(response?.error || "Erro desconhecido.");
    textboxSelectorInput.value = response.textbox;
    sendSelectorInput.value = response.send;
    detectAIStatusEl.textContent = "Salvo! Veja os seletores nos campos abaixo.";
  } catch (error) {
    // Sem content script na aba (extensão recém-recarregada): pede F5.
    const noReceiver = /Receiving end does not exist/i.test(error.message);
    detectAIStatusEl.textContent = noReceiver
      ? "Recarregue o WhatsApp Web (F5) e tente de novo."
      : error.message;
  }
});
