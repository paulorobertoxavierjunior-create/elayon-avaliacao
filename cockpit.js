const PRE_START_DELAY = 800;
const SILENCE_MS = 4000;
const DISPLAY_TIMER_SECONDS = 10;

let etapaAtual = -1;
let transcriptAtual = "";
let dadosSessao = [];
let ultimaAnalise = null;
let ultimoRelatorio = null;
let timerVisual = null;

// ================================
// IA HUMANA — FALA + ESCRITA JUNTA
// ================================

function escreverTextoProgressivo(texto, alvoId, velocidade = 32) {
  return new Promise((resolve) => {
    const alvo = document.getElementById(alvoId);
    if (!alvo) return resolve();

    alvo.textContent = "";
    let i = 0;

    function tick() {
      if (i < texto.length) {
        alvo.textContent += texto[i];
        i++;
        setTimeout(tick, velocidade);
      } else {
        resolve();
      }
    }

    tick();
  });
}

async function falarComEscritaProgressiva(texto, alvoId) {
  const alvo = document.getElementById(alvoId);
  if (alvo) alvo.textContent = "";

  const escrita = escreverTextoProgressivo(texto, alvoId);
  const fala = window.ELAYON_TUNNEL.tts.speak(texto);

  await Promise.allSettled([fala, escrita]);
}

// ================================
// PROTOCOLO INICIAL
// ================================

const PROTOCOLO_USO = `Olá. Bem-vindo aos sistemas Elayon.

Esta é uma sessão de observação da sua própria fala.

Você é totalmente responsável pelo que diz, pelo tempo que utiliza e pela forma como conduz esta experiência.

O sistema não interpreta, não julga e não influencia suas respostas.

O CRS apenas capta padrões de ritmo e silêncio, sem interferir no conteúdo da sua fala.

Os dados gerados servem exclusivamente como base de reflexão.

Use este momento com atenção e presença.

Quando estiver pronto, pressione "Responder" para iniciar.`;

const el = (id) => document.getElementById(id);

function log(msg) {
  const box = el("logsBox");
  const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`;
  box.textContent += `\n${line}`;
  box.scrollTop = box.scrollHeight;
}

function temaAtual() {
  return (el("inpTema").value || "").trim();
}

function contextoAtual() {
  return (el("inpContexto").value || "").trim();
}

function getJanelaRelatoriosTexto() {
  const sessoes = obterJanelaSessoes();
  return sessoes.map((s, i) => ({
    indice: i + 1,
    timestamp: s.timestamp,
    resumo: s.relatorio?.resumo_conversacional || "sem resumo",
    heuristica: s.relatorio?.heuristica || "sem heurística"
  }));
}

const TESTES = [
  {
    titulo: "Etapa 1 • Abertura",
    subtitulo: "Chegada ao tema.",
    getInstrucao: () => {
      const tema = temaAtual() || "o tema que você quiser trazer";
      return `Olá, bem-vindo aos sistemas Elayon. Fale sobre ${tema}. Ao terminar, fique quatro segundos em silêncio.`;
    },
    texto: "",
    tipo: "abertura"
  },
  {
    titulo: "Etapa 2 • Continuidade",
    subtitulo: "Aprofundamento do mesmo assunto.",
    getInstrucao: () => {
      return `Agora continue. Quero te ouvir um pouco mais sobre esse assunto. Fale com calma e, ao terminar, fique quatro segundos em silêncio.`;
    },
    texto: "",
    tipo: "continuidade"
  },
  {
    titulo: "Etapa 3 • Consolidação",
    subtitulo: "Fechamento do eixo temático.",
    getInstrucao: () => {
      return `Para fechar esta sessão, diga o que neste assunto merece mais atenção agora. Ao terminar, fique quatro segundos em silêncio.`;
    },
    texto: "",
    tipo: "fechamento"
  }
];

function addTimeline(texto) {
  const item = document.createElement("div");
  item.className = "event";
  item.textContent = `[${new Date().toLocaleTimeString("pt-BR")}] ${texto}`;
  el("timeline").prepend(item);
  log(texto);
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
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
}

function abrirModal() {
  el("modalFluxo").classList.add("show");
  log("modal aberto");
}

function fecharModal() {
  el("modalFluxo").classList.remove("show");
  log("modal fechado");
}

function showConfirm(show = true) {
  el("confirmBox").classList.toggle("show", show);
  log(show ? "bloco de confirmação exibido" : "bloco de confirmação oculto");
}

function setListening(active, text = "Microfone aguardando.") {
  el("pulseMic").classList.toggle("on", active);
  el("listeningLabel").textContent = text;
}

function iniciarTimerVisual() {
  let restante = DISPLAY_TIMER_SECONDS;
  el("timerFalando").textContent = String(restante);

  clearInterval(timerVisual);
  timerVisual = setInterval(() => {
    restante -= 1;
    el("timerFalando").textContent = String(Math.max(restante, 0));
    if (restante <= 0) clearInterval(timerVisual);
  }, 1000);
}

function pararTimerVisual() {
  clearInterval(timerVisual);
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

  log(`métricas integradas atualizadas | silêncio=${silence} | pausas=${pauses}`);
}

function montarRelatorioSessao(analysis, payload, transcricao) {
  const janela = getJanelaRelatoriosTexto();
  const diagnostico = analysis?.diagnostico || {};
  const heuristica = analysis?.heuristica || "";
  const summary = analysis?.user_report?.summary || "";

  return {
    timestamp: new Date().toISOString(),
    tema: temaAtual(),
    contexto: contextoAtual(),
    transcricao,
    payload,
    diagnostico,
    heuristica,
    resumo_conversacional: summary,
    sessoes_anteriores: janela
  };
}

function renderRelatorio(relatorio) {
  el("resultadoFinal").textContent =
`Tema: ${relatorio.tema || "não definido"}
Contexto: ${relatorio.contexto || "não definido"}

Resumo:
${relatorio.resumo_conversacional || "sem resumo"}

Heurística:
${relatorio.heuristica || "sem heurística"}

Diagnóstico:
${relatorio.diagnostico?.estado || "sem estado"} • ${relatorio.diagnostico?.feedback || "sem feedback"}

Sessões anteriores consideradas:
${relatorio.sessoes_anteriores.length}`;
}

function renderListaRelatorios() {
  const lista = obterRelatorios();
  const alvo = el("listaRelatorios");

  if (!lista.length) {
    alvo.innerHTML = `<div class="relatorio-item">Nenhum relatório salvo ainda.</div>`;
    return;
  }

  alvo.innerHTML = lista.slice().reverse().map((item, idx) => `
    <div class="relatorio-item">
      <strong>Relatório ${lista.length - idx}</strong>
      <div><b>Tema:</b> ${item.tema || "não definido"}</div>
      <div><b>Resumo:</b> ${item.resumo_conversacional || "sem resumo"}</div>
      <div><b>Data:</b> ${new Date(item.timestamp).toLocaleString("pt-BR")}</div>
    </div>
  `).join("");
}

function carregarEtapa(indice) {
  etapaAtual = indice;
  const etapa = TESTES[indice];
  const instrucao = etapa.getInstrucao();

  setStatusEtapa(`${indice + 1} de 3`);
  setPrompt(instrucao);

  el("modalTitulo").textContent = etapa.titulo;
  el("modalSubtitulo").textContent = etapa.subtitulo;
  el("modalInstrucao").textContent = instrucao;
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
  addTimeline(`etapa ${indice + 1} preparada`);
  ouvirInstrucaoAtual();
}

async function ouvirInstrucaoAtual() {
  const etapa = TESTES[etapaAtual];
  const instrucao = etapa.getInstrucao();

  addTimeline(`IA iniciou fala da etapa ${etapaAtual + 1}`);
  setListening(false, "IA emitindo instrução.");

  try {
    await window.ELAYON_TUNNEL.tts.speak(instrucao);
    el("btnResponder").disabled = false;
    addTimeline("instrução concluída, resposta liberada");
    setListening(false, "Pronto para responder.");

    setPainelTecnico({
      etapa: etapaAtual + 1,
      instrucao: "emitida",
      microfone: "liberado",
      tts: "concluido",
      tema: temaAtual() || "vazio",
      contexto: contextoAtual() || "vazio",
      transcricao: "pendente",
      silencio_final_4s: "pendente",
      relatorio: "pendente",
      historico_ultimas_3: getJanelaRelatoriosTexto()
    });
  } catch (e) {
    addTimeline(`falha no TTS: ${e.message}`);
    setListening(false, "Falha ao emitir instrução.");
  }
}

async function iniciarResposta() {
  el("btnResponder").disabled = true;
  showConfirm(false);
  setStatusMic("Ouvindo");
  setListening(true, "Microfone aberto. Responda agora.");
  iniciarTimerVisual();
  addTimeline("microfone iniciado");

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
    pararTimerVisual();

    addTimeline(
      transcriptAtual
        ? "fala captada com sucesso"
        : "captação finalizada sem texto reconhecido"
    );

    showConfirm(true);
  } catch (e) {
    setStatusMic("Erro");
    setListening(false, "Erro na captação.");
    pararTimerVisual();
    addTimeline(`erro na transcrição: ${e.message}`);
    showConfirm(true);
  }
}

async function confirmarResposta() {
  const etapa = TESTES[etapaAtual];
  const instrucao = etapa.getInstrucao();

  const payload = window.ELAYON_TUNNEL.crs.buildPayload(transcriptAtual, {
    context: `${contextoAtual()} | etapa ${etapaAtual + 1} | tema ${temaAtual()}`,
    source_text: etapa.texto || instrucao
  });

  addTimeline(`enviando etapa ${etapaAtual + 1} para análise do CRS`);

  let analysis = null;

  try {
    analysis = await window.ELAYON_TUNNEL.crs.analyze(payload);
    ultimaAnalise = analysis;
    addTimeline("resposta do CRS recebida");
  } catch (e) {
    addTimeline(`falha no CRS: ${e.message}`);
  }

  dadosSessao.push({
    etapa: etapaAtual + 1,
    tipo: etapa.tipo,
    instrucao,
    transcricao: transcriptAtual,
    payload,
    analysis
  });

  preencherMetricasPorAnalise(analysis || {}, etapaAtual + 1);

  ultimoRelatorio = montarRelatorioSessao(analysis || {}, payload, transcriptAtual);
  renderRelatorio(ultimoRelatorio);

  setPainelTecnico({
    etapa: etapaAtual + 1,
    instrucao: "concluida",
    microfone: "encerrado",
    tts: "pronto",
    tema: temaAtual() || "vazio",
    contexto: contextoAtual() || "vazio",
    transcricao: transcriptAtual ? "captada" : "vazia",
    silencio_final_4s: "concluido",
    relatorio: ultimoRelatorio,
    historico_ultimas_3: getJanelaRelatoriosTexto()
  });

  showConfirm(false);

  if (etapaAtual < TESTES.length - 1) {
    carregarEtapa(etapaAtual + 1);
    return;
  }

  fecharModal();
  addTimeline("sessão concluída, relatório atualizado");
}

function refazerResposta() {
  showConfirm(false);
  transcriptAtual = "";
  el("transcricaoAtual").textContent = "Resposta descartada. Pressione responder para refazer.";
  el("btnResponder").disabled = false;
  addTimeline("usuário optou por refazer a resposta");
  setListening(false, "Pronto para nova resposta.");
}

function salvarSessaoAtual() {
  if (!ultimoRelatorio) {
    addTimeline("nenhum relatório disponível para salvar");
    return;
  }

  const sessao = {
    timestamp: new Date().toISOString(),
    tema: temaAtual(),
    contexto: contextoAtual(),
    etapas: dadosSessao,
    relatorio: ultimoRelatorio
  };

  salvarSessao(sessao);
  salvarRelatorio(ultimoRelatorio);
  renderListaRelatorios();
  addTimeline("sessão salva com sucesso");
}

function exportarRelatorioAtual() {
  if (!ultimoRelatorio) {
    addTimeline("nenhum relatório disponível para exportar");
    return;
  }

  const blob = new Blob([JSON.stringify(ultimoRelatorio, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `elayon-relatorio-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  addTimeline("relatório exportado em JSON");
}

function resetCockpit() {
  etapaAtual = -1;
  dadosSessao = [];
  transcriptAtual = "";
  ultimaAnalise = null;
  ultimoRelatorio = null;

  setPrompt("A sessão ainda não começou. Defina tema e contexto, depois clique em “Iniciar sessão”.");
  setStatusMic("Aguardando");
  setStatusEtapa("0 de 3");

  el("resultadoFinal").textContent =
    "O relatório atual aparecerá aqui após as interações.";

  el("timeline").innerHTML =
    `<div class="event">[00:00] sistema pronto • aguardando início da sessão</div>`;

  ["Presenca","Clareza","Ritmo","Firmeza","Continuidade","Estabilidade","Oscilacao"].forEach(id => {
    el(`val${id}`).textContent = "0%";
    el(`bar${id}`).style.width = "0%";
  });

  setPainelTecnico({
    etapa: "aguardando_inicio",
    instrucao: "nao_emitida",
    microfone: "bloqueado",
    tts: "pronto",
    tema: temaAtual() || "vazio",
    contexto: contextoAtual() || "vazio",
    transcricao: "nao_captada",
    silencio_final_4s: "pendente",
    relatorio: "pendente",
    historico_ultimas_3: getJanelaRelatoriosTexto()
  });

  showConfirm(false);
  setListening(false);
  pararTimerVisual();
  renderListaRelatorios();
  log("cockpit resetado");
}

document.addEventListener("DOMContentLoaded", () => {
  resetCockpit();

  el("btnAbrirFluxo").addEventListener("click", () => {
    if (!temaAtual()) {
      addTimeline("defina um tema antes de iniciar");
      return;
    }
    carregarEtapa(0);
  });

  el("btnPararTudo").addEventListener("click", async () => {
    try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
    fecharModal();
    addTimeline("sessão interrompida manualmente");
    setListening(false, "Sessão interrompida.");
    pararTimerVisual();
  });

  el("btnResetarCockpit").addEventListener("click", resetCockpit);

  el("btnEncerrarSessao").addEventListener("click", () => {
    fecharModal();
    addTimeline("sessão encerrada pelo usuário");
    setListening(false, "Sessão encerrada.");
    pararTimerVisual();
  });

  el("btnOuvirInstrucao").addEventListener("click", ouvirInstrucaoAtual);
  el("btnRepetirInstrucao").addEventListener("click", ouvirInstrucaoAtual);
  el("btnResponder").addEventListener("click", iniciarResposta);
  el("btnConfirmarResposta").addEventListener("click", confirmarResposta);
  el("btnRefazerResposta").addEventListener("click", refazerResposta);

  el("btnEncerrarModal").addEventListener("click", () => {
    fecharModal();
    addTimeline("modal encerrado");
    setListening(false, "Modal encerrado.");
    pararTimerVisual();
  });

  el("btnAvancoManual").addEventListener("click", () => {
    if (etapaAtual === -1 && temaAtual()) carregarEtapa(0);
  });

  el("btnSalvarSessao").addEventListener("click", salvarSessaoAtual);
  el("btnGerarRelatorio").addEventListener("click", () => {
    if (ultimoRelatorio) {
      renderRelatorio(ultimoRelatorio);
      addTimeline("relatório regenerado na tela");
    } else {
      addTimeline("ainda não há relatório para gerar");
    }
  });
  el("btnExportarRelatorio").addEventListener("click", exportarRelatorioAtual);
});