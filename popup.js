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
  "- Use *negrito* (texto entre asteriscos) para títulos de seção quando fizer sentido, e _itálico_ " +
  "(texto entre underlines) para destaques pontuais, sem abusar.\n" +
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
  "*IMPRESSÃO MÉDIA*\n" +
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
  "- Use *negrito* (texto entre asteriscos) para títulos de seção quando fizer sentido, e _itálico_ " +
  "(texto entre underlines) para destaques pontuais, sem abusar.\n" +
  "- Não pule linhas desnecessariamente: só reorganize a formatação preservando o sentido original.\n\n" +
  "Exemplo de entrada:\n" +
  "Sacola de algodão 210 g/m² com 16 fios e alças costuradas na parte interna.\n\n" +
  "Altura: 41 cm\nLargura: 38 cm – com logo do evento.\n\n" +
  "IMPRESSÃO MÉDIA\n\n" +
  "Quantidade: 4.000 unidades\nValor unitário: R$ 16,50\nValor total: R$ 66.000,00\n\n" +
  "Exemplo de saída esperada:\n" +
  "Sacola de algodão 210 g/m² com 16 fios e alças costuradas na parte interna.\n" +
  "- Altura: 41 cm\n- Largura: 38 cm – com logo do evento.\n\n" +
  "*IMPRESSÃO MÉDIA*\n" +
  "- Quantidade: 4.000 unidades\n- Valor unitário: R$ 16,50\n- Valor total: R$ 66.000,00\n\n" +
  "Não adicione comentários, explicações, aspas ou qualquer texto extra. " +
  "Responda apenas com o texto reescrito.";

const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const promptInput = document.getElementById("prompt");
const rewritePromptInput = document.getElementById("rewritePrompt");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(
  ["openrouterApiKey", "openrouterModel", "revisarPrompt", "reescreverPrompt"],
  (settings) => {
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
    },
    () => {
      statusEl.textContent = "Salvo!";
      setTimeout(() => (statusEl.textContent = ""), 2000);
    }
  );
});
