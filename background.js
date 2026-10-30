const DEFAULT_MODEL = "openai/gpt-4o-mini";

const ACTIONS = {
  revisar: {
    promptKey: "revisarPrompt",
    defaultPrompt:
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
      "Responda apenas com o texto corrigido.",
  },
  reescrever: {
    promptKey: "reescreverPrompt",
    defaultPrompt:
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
      "Responda apenas com o texto reescrito.",
  },
};

const HIGHLIGHT_INSTRUCTION =
  "\n\nAlém disso, releia o texto e identifique as partes mais importantes (valores, datas, prazos, " +
  "quantidades, decisões, pedidos de ação) e destaque-as usando a formatação de texto simples do " +
  "WhatsApp (não é Markdown):\n" +
  "- Negrito: APENAS UM asterisco de cada lado, assim: *texto*. NUNCA use dois asteriscos (**texto**), " +
  "isso é sintaxe de Markdown e não funciona no WhatsApp.\n" +
  "- Itálico: um underline de cada lado, assim: _texto_.\n" +
  "Sem exagerar nem destacar tudo.";

const DETECT_PROMPT =
  "Você recebe o HTML estrutural (sem textos) do rodapé de uma conversa do WhatsApp Web. " +
  "Descubra um seletor CSS para a caixa de digitação da mensagem (elemento editável) e outro para o " +
  "botão de enviar. Responda APENAS com JSON, sem comentários nem cercas de código, neste formato: " +
  '{"textbox":"<seletor>","send":"<seletor>"}. ' +
  "Regras: use somente os atributos contenteditable, role, aria-label, data-testid e data-tab; nunca use " +
  "classes CSS nem nomes de ícones; cada seletor deve casar com exatamente um elemento do HTML recebido. " +
  'Se não houver botão de enviar identificável, use "" em "send".';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AI_DETECT") {
    detectSelectors(message.html)
      .then((selectors) => sendResponse({ ok: true, selectors }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type !== "AI_ACTION") return;

  runAction(message.action, message.text, !!message.highlight, message.extraInstruction)
    .then((result) => sendResponse({ ok: true, text: result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function runAction(action, text, highlight, extraInstruction = "") {
  const config = ACTIONS[action];
  if (!config) {
    throw new Error(`Ação desconhecida: ${action}`);
  }

  const settings = await chrome.storage.sync.get([config.promptKey]);
  let prompt = settings[config.promptKey] || config.defaultPrompt;
  if (highlight) {
    prompt += HIGHLIGHT_INSTRUCTION;
  }
  if (typeof extraInstruction === "string" && extraInstruction.trim()) {
    prompt +=
      "\n\nInstrução adicional para esta resposta (aplique junto às regras anteriores):\n" +
      extraInstruction.trim();
  }

  return callModel(prompt, text);
}

async function detectSelectors(html) {
  if (!html || typeof html !== "string") {
    throw new Error("Nenhuma estrutura recebida para analisar.");
  }
  const raw = await callModel(DETECT_PROMPT, html);
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed;
  try {
    parsed = JSON.parse(match ? match[0] : raw);
  } catch (err) {
    throw new Error("A IA não devolveu um JSON válido. Tente novamente.");
  }
  const textbox = typeof parsed.textbox === "string" ? parsed.textbox.trim() : "";
  const send = typeof parsed.send === "string" ? parsed.send.trim() : "";
  if (!textbox) {
    throw new Error("A IA não encontrou a caixa de mensagem.");
  }
  return { textbox, send };
}

async function callModel(prompt, userContent) {
  const settings = await chrome.storage.sync.get(["openrouterApiKey", "openrouterModel"]);

  const apiKey = settings.openrouterApiKey;
  if (!apiKey) {
    throw new Error(
      "Nenhuma chave de API configurada. Abra as configurações da extensão e informe sua chave do OpenRouter."
    );
  }

  const model = settings.openrouterModel || DEFAULT_MODEL;

  // Sem timeout, uma requisição que trave (rede, modelo sobrecarregado,
  // service worker suspenso) deixava o painel "Aguarde um instante"
  // carregando para sempre. Após 20s, cancela e mostra erro com opção
  // de tentar de novo.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("A requisição demorou demais e foi cancelada. Tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Erro na API do OpenRouter (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const result = data?.choices?.[0]?.message?.content?.trim();

  if (!result) {
    throw new Error("A API não retornou nenhum texto.");
  }

  return result;
}

// Marca o ícone da extensão com "!" enquanto os seletores não foram
// detectados (primeiro uso): o lápis só aparece depois de "Detectar com IA".
function updateBadge() {
  chrome.storage.sync.get(["textboxSelector"], (settings) => {
    chrome.action.setBadgeText({ text: settings.textboxSelector ? "" : "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.textboxSelector) updateBadge();
});
