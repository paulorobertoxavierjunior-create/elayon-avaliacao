const MAX_SESSOES_CONTEXTO = 3;
const MAX_RELATORIOS_SALVOS = 10;

const STORAGE_SESSOES = "elayon_sessoes";
const STORAGE_RELATORIOS = "elayon_relatorios";

function lerJSON(chave, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(chave) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function salvarJSON(chave, valor) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

function salvarSessao(sessao) {
  const historico = lerJSON(STORAGE_SESSOES, []);
  historico.push(sessao);
  salvarJSON(STORAGE_SESSOES, historico);
}

function obterTodasSessoes() {
  return lerJSON(STORAGE_SESSOES, []);
}

function obterJanelaSessoes() {
  const historico = obterTodasSessoes();
  return historico.slice(-MAX_SESSOES_CONTEXTO);
}

function salvarRelatorio(relatorio) {
  let relatorios = lerJSON(STORAGE_RELATORIOS, []);
  relatorios.push(relatorio);

  if (relatorios.length > MAX_RELATORIOS_SALVOS) {
    relatorios = relatorios.slice(-MAX_RELATORIOS_SALVOS);
  }

  salvarJSON(STORAGE_RELATORIOS, relatorios);
}

function obterRelatorios() {
  return lerJSON(STORAGE_RELATORIOS, []);
}

function montarContextoIA(sessaoAtual) {
  const janela = obterJanelaSessoes();
  return {
    atual: sessaoAtual,
    anteriores: janela.slice(0, -1)
  };
}

function limparMemoriaElayon() {
  localStorage.removeItem(STORAGE_SESSOES);
  localStorage.removeItem(STORAGE_RELATORIOS);
}