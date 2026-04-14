const PRE_START_DELAY = 800;
const SILENCE_MS = 4000;

const TESTES = [
  {
    titulo: "Etapa 1 • Abertura",
    subtitulo: "Entrada inicial do usuário no sistema.",
    instrucao: "Olá, bem-vindo aos sistemas Elayon. Responda da forma que achar melhor: Como está o seu dia? Responda e depois fique quatro segundos em silêncio.",
    texto: "",
    tipo: "resposta_curta",
    context: "abertura inicial da avaliação",
    sourceText: "resposta inicial espontânea"
  },
  {
    titulo: "Etapa 2 • Leitura guiada",
    subtitulo: "Leitura de um texto curto com calma e clareza.",
    instrucao: "Leia o texto abaixo. Ao terminar, fique quatro segundos em silêncio.",
    texto: "Eu estou presente, consciente do meu tempo e disposto a seguir com atenção.",
    tipo: "leitura",
    context: "leitura guiada da avaliação",
    sourceText: "texto guiado de leitura"
  },
  {
    titulo: "Etapa 3 • Contagem e identificação",
    subtitulo: "Contagem e nome completo.",
    instrucao: "Agora conte de um até dez. No final, diga o seu nome completo. Depois, fique quatro segundos em silêncio.",
    texto: "",
    tipo: "contagem",
    context: "contagem final e identificação",
    sourceText: "contagem de um a dez e nome completo"
  }
];

const HEURISTICA = {
  presenca: {
    alta: "Boa ancoragem inicial e chegada consistente ao processo.",
    baixa: "Baixa ancoragem inicial. Vale fortalecer a chegada antes de avançar."
  },
  clareza: {
    alta: "Boa nitidez de expressão e organização da fala.",
    baixa: "A clareza ficou reduzida. Pode ser útil repetir com mais calma."
  },
  ritmo: {
    alta: "Ritmo equilibrado e progressão temporal adequada.",
    baixa: "Ritmo irregular com oscilação na sustentação da fala."
  },
  firmeza: {
    alta: "Boa firmeza vocal e textual, com sustentação consistente.",
    baixa: "Firmeza baixa. O sistema sugere mais estabilidade antes de concluir."
  },
  continuidade: {
    alta: "Continuidade elevada entre as etapas.",
    baixa: "Continuidade baixa com quebras perceptíveis."
  },
  estabilidade: {
    alta: "Boa estabilidade geral durante a sessão.",
    baixa: "Estabilidade reduzida. Recomenda-se nova tentativa com menos ruído."
  },
  oscilacao: {
    alta: "Oscilação baixa, favorecendo leitura segura.",
    baixa: "Oscilação alta. Houve variação expressiva ao longo da sessão."
  }
};

let etapaAtual = -1;
let transcriptAtual = "";
let dadosSessao = [];
let ultimaAnalise = null;

const el = (id) => document.getElementById(id);

function addTimeline(texto) {
  const item = document.createElement("div");
  item.className = "event";
  item.textContent = `[${new Date().toLocaleTimeString("pt-BR")}] ${texto}`;
  el("timeline").prepend(item);
}

function setPrompt(texto) {
  el("promptAtual").textContent = texto;
}

function setStatusMic(texto) {
  el("stMic").textContent = texto;
}

function setStatusEtapa(texto) {
  el("stEtapa").textContent = texto;
}

function setPainelTecnico(obj) {
  el("painelTecnico").textContent = Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function abrirModal() {
  el("modalFluxo").classList.add("show");
}

function fecharModal() {
  el("modalFluxo").classList.remove("show");
}

function showConfirm(show = true) {
  el("confirmBox").classList.toggle("show", show);
}

function setListening(active, text = "Microfone aguardando.") {
  el("pulseMic").classList.toggle("on", active);
  el("listeningLabel").textContent = text;
}

function preencherMetricasPorAnalise(analysis, etapa) {
  const silence = Number(analysis?.metrics_received?.silence_pct ?? 0);
  const pauses = Number(analysis?.metrics_received?.pause_count ?? 0);

  const base = {
    presenca: Math.max(15, 60 - silence + etapa * 8),
    clareza: Math.max(10, 55 - pauses * 4 + etapa * 10),
    ritmo: Math.max(10, 52 - silence / 2 + etapa * 8),
    firmeza: Math.max(10, 45 - pauses * 3 + etapa * 9),
    continuidade: Math.max(10, 48 - pauses * 2 + etapa * 10),
    estabilidade: Math.max(10, 50 - silence / 3 + etapa * 8),
    oscilacao: Math.max(5, Math.min(100, 20 + pauses * 6 + silence / 4))
  };

  const mapa = {
    presenca: "Presenca",
    clareza: "Clareza",
    ritmo: "Ritmo",
    firmeza: "Firmeza",
    continuidade: "Continuidade",
    estabilidade: "Estabilidade",
    oscilacao: "Oscilacao"
  };

  Object.entries(base).forEach(([k, v]) => {
    const val = Math.max(0, Math.min(100, Math.round(v)));
    const suffix = mapa[k];
    el(`val${suffix}`).textContent = `${val}%`;
    el(`bar${suffix}`).style.width = `${val}%`;
  });
}

function consolidarHeuristica() {
  const metricas = {
    presenca: parseInt(el("valPresenca").textContent),
    clareza: parseInt(el("valClareza").textContent),
    ritmo: parseInt(el("valRitmo").textContent),
    firmeza: parseInt(el("valFirmeza").textContent),
    continuidade: parseInt(el("valContinuidade").textContent),
    estabilidade: parseInt(el("valEstabilidade").textContent),
    oscilacao: parseInt(el("valOscilacao").textContent)
  };

  const maior = Object.entries(metricas).sort((a, b) => b[1] - a[1])[0][0];
  const menor = Object.entries(metricas).sort((a, b) => a[1] - b[1])[0][0];

  const extra = ultimaAnalise?.heuristica
    ? `<br><br><strong>Leitura CRS:</strong> ${ultimaAnalise.heuristica}`
    : "";

  el("resultadoFinal").innerHTML = `
    <strong>Destaque positivo:</strong> ${HEURISTICA[maior].alta}<br><br>
    <strong>Ponto de melhoria:</strong> ${HEURISTICA[menor].baixa}<br><br>
    <strong>Orientação final:</strong> A sessão foi concluída. Revise os indicadores antes de seguir para a próxima etapa.
    ${extra}
  `;

  setPainelTecnico({
    etapa: "concluida",
    instrucao: "finalizada",
    microfone: "encerrado",
    tts: "finalizado",
    transcricao: dadosSessao.length ? "captada" : "nao_captada",
    silencio_final_4s: "concluido",
    decisao_heuristica: "gerada",
    liberacao_catraca: "pronta_para_analise"
  });
}

function carregarEtapa(indice) {
  etapaAtual = indice;
  const etapa = TESTES[indice];

  setStatusEtapa(`${indice + 1} de 3`);
  setPrompt(etapa.instrucao);

  el("modalTitulo").textContent = etapa.titulo;
  el("modalSubtitulo").textContent = etapa.subtitulo;
  el("modalInstrucao").textContent = etapa.instrucao;
  el("transcricaoAtual").textContent = "A transcrição aparecerá aqui.";
  transcriptAtual = "";

  el("btnResponder").disabled = true;
  showConfirm(false);
  setListening(false);

  if (etapa.texto) {
    el("caixaTextoLeitura").style.display = "block";
    el("textoLeitura").textContent = etapa.texto;
  } else {
    el("caixaTextoLeitura").style.display = "none";
    el("textoLeitura").textContent = "";
  }

  abrirModal();
  addTimeline(`Etapa ${indice + 1} preparada.`);

  // fala automática ao entrar
  ouvirInstrucaoAtual();
}

async function ouvirInstrucaoAtual() {
  const etapa = TESTES[etapaAtual];
  addTimeline(`IA iniciou fala da etapa ${etapaAtual + 1}.`);
  setListening(false, "IA emitindo instrução.");

  try {
    await window.ELAYON_TUNNEL.tts.speak(etapa.instrucao);
    el("btnResponder").disabled = false;
    addTimeline("Instrução concluída. Resposta liberada.");
    setListening(false, "Pronto para responder.");
    setPainelTecnico({
      etapa: etapaAtual + 1,
      instrucao: "emitida",
      microfone: "liberado",
      tts: "concluido",
      texto_guiado: etapa.texto ? "visivel" : "nao",
      transcricao: "pendente",
      silencio_final_4s: "pendente",
      decisao_heuristica: "pendente",
      liberacao_catraca: "em_analise"
    });
  } catch (e) {
    addTimeline(`Falha no TTS: ${e.message}`);
    setListening(false, "Falha ao emitir instrução.");
  }
}

async function iniciarResposta() {
  el("btnResponder").disabled = true;
  showConfirm(false);
  setStatusMic("Ouvindo");
  setListening(true, "Microfone aberto. Responda agora.");
  addTimeline("Microfone iniciado.");

  try {
    await new Promise(resolve => setTimeout(resolve, PRE_START_DELAY));

    const heard = await window.ELAYON_TUNNEL.stt.listenOnce({
      silenceMs: SILENCE_MS,
      onPartial: (data) => {
        el("transcricaoAtual").textContent = data.text || "Aguardando fala...";
      }
    });

    transcriptAtual = heard.final || heard.text || "";
    el("transcricaoAtual").textContent = transcriptAtual || "Nenhuma fala captada.";
    setStatusMic("Silêncio / Finalizado");
    setListening(false, "Captação finalizada.");

    addTimeline(
      transcriptAtual
        ? "Fala captada com sucesso."
        : "Captação finalizada sem texto reconhecido."
    );

    showConfirm(true);
  } catch (e) {
    setStatusMic("Erro");
    setListening(false, "Erro na captação.");
    addTimeline(`Erro na transcrição: ${e.message}`);
    showConfirm(true);
  }
}

async function confirmarResposta() {
  const etapa = TESTES[etapaAtual];

  const payload = window.ELAYON_TUNNEL.crs.buildPayload(transcriptAtual, {
    context: etapa.context,
    source_text: etapa.texto || etapa.sourceText || etapa.instrucao
  });

  addTimeline(`Enviando etapa ${etapaAtual + 1} para análise do CRS.`);

  let analysis = null;

  try {
    analysis = await window.ELAYON_TUNNEL.crs.analyze(payload);
    ultimaAnalise = analysis;
    addTimeline("Resposta do CRS recebida.");
  } catch (e) {
    addTimeline(`Falha no CRS: ${e.message}`);
  }

  dadosSessao.push({
    etapa: etapaAtual + 1,
    tipo: etapa.tipo,
    instrucao: etapa.instrucao,
    transcricao: transcriptAtual,
    payload,
    analysis
  });

  preencherMetricasPorAnalise(analysis || {}, etapaAtual + 1);

  setPainelTecnico({
    etapa: etapaAtual + 1,
    instrucao: "concluida",
    microfone: "encerrado",
    tts: "pronto",
    texto_guiado: etapa.texto ? "utilizado" : "nao",
    transcricao: transcriptAtual ? "captada" : "vazia",
    silencio_final_4s: "concluido",
    decisao_heuristica: analysis?.heuristica ? "parcial_gerada" : "pendente",
    liberacao_catraca: "em_analise"
  });

  showConfirm(false);

  if (etapaAtual < TESTES.length - 1) {
    carregarEtapa(etapaAtual + 1);
    return;
  }

  fecharModal();
  consolidarHeuristica();
}

function refazerResposta() {
  showConfirm(false);
  transcriptAtual = "";
  el("transcricaoAtual").textContent = "Resposta descartada. Pressione responder para refazer.";
  el("btnResponder").disabled = false;
  addTimeline("Usuário optou por refazer a resposta.");
  setListening(false, "Pronto para nova resposta.");
}

function resetCockpit() {
  etapaAtual = -1;
  dadosSessao = [];
  transcriptAtual = "";
  ultimaAnalise = null;

  setPrompt("A avaliação ainda não começou. Clique em “Iniciar avaliação”.");
  setStatusMic("Aguardando");
  setStatusEtapa("0 de 3");

  el("resultadoFinal").textContent =
    "O resultado final aparecerá aqui após a conclusão dos testes.";

  el("timeline").innerHTML =
    `<div class="event">[00:00] sistema pronto • aguardando início da avaliação</div>`;

  ["Presenca","Clareza","Ritmo","Firmeza","Continuidade","Estabilidade","Oscilacao"].forEach(id => {
    el(`val${id}`).textContent = "0%";
    el(`bar${id}`).style.width = "0%";
  });

  setPainelTecnico({
    etapa: "aguardando_inicio",
    instrucao: "nao_emitida",
    microfone: "bloqueado",
    tts: "pronto",
    texto_guiado: "vazio",
    transcricao: "nao_captada",
    silencio_final_4s: "pendente",
    decisao_heuristica: "pendente",
    liberacao_catraca: "em_analise"
  });

  showConfirm(false);
  setListening(false);
}

document.addEventListener("DOMContentLoaded", () => {
  resetCockpit();

  el("btnAbrirFluxo").addEventListener("click", () => carregarEtapa(0));

  el("btnPararTudo").addEventListener("click", async () => {
    try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
    fecharModal();
    addTimeline("Sessão interrompida manualmente.");
    setListening(false, "Sessão interrompida.");
  });

  el("btnResetarCockpit").addEventListener("click", resetCockpit);

  el("btnEncerrarSessao").addEventListener("click", () => {
    fecharModal();
    addTimeline("Sessão encerrada pelo usuário.");
    setListening(false, "Sessão encerrada.");
  });

  el("btnOuvirInstrucao").addEventListener("click", ouvirInstrucaoAtual);
  el("btnRepetirInstrucao").addEventListener("click", ouvirInstrucaoAtual);
  el("btnResponder").addEventListener("click", iniciarResposta);
  el("btnConfirmarResposta").addEventListener("click", confirmarResposta);
  el("btnRefazerResposta").addEventListener("click", refazerResposta);

  el("btnEncerrarModal").addEventListener("click", () => {
    fecharModal();
    addTimeline("Modal encerrado.");
    setListening(false, "Modal encerrado.");
  });

  el("btnAvancoManual").addEventListener("click", () => {
    if (etapaAtual === -1) carregarEtapa(0);
  });
});