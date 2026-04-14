const MAX_SESSOES = 3;

function salvarSessao(sessao) {
  let historico = JSON.parse(localStorage.getItem("elayon_sessoes") || "[]");

  historico.push(sessao);

  if (historico.length > MAX_SESSOES) {
    historico = historico.slice(-MAX_SESSOES);
  }

  localStorage.setItem("elayon_sessoes", JSON.stringify(historico));
}

function obterSessoes() {
  return JSON.parse(localStorage.getItem("elayon_sessoes") || "[]");
}

function montarContextoIA(sessaoAtual) {
  const historico = obterSessoes();

  return {
    atual: sessaoAtual,
    anteriores: historico
  };
}