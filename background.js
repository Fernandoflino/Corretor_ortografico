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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AI_ACTION") return;

  runAction(message.action, message.text, !!message.highlight)
    .then((result) => sendResponse({ ok: true, text: result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function runAction(action, text, highlight) {
  const config = ACTIONS[action];
  if (!config) {
    throw new Error(`Ação desconhecida: ${action}`);
  }

  const settings = await chrome.storage.sync.get([
    "openrouterApiKey",
    "openrouterModel",
    config.promptKey,
  ]);

  const apiKey = settings.openrouterApiKey;
  if (!apiKey) {
    throw new Error(
      "Nenhuma chave de API configurada. Abra as configurações da extensão e informe sua chave do OpenRouter."
    );
  }

  const model = settings.openrouterModel || DEFAULT_MODEL;
  let prompt = settings[config.promptKey] || config.defaultPrompt;
  if (highlight) {
    prompt += HIGHLIGHT_INSTRUCTION;
  }

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
          { role: "user", content: text },
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
