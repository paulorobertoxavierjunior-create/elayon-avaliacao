const PRE_START_DELAY = 800;
const SILENCE_MS = 4000;
const DISPLAY_TIMER_SECONDS = 10;
let confirmandoResposta = false;
let etapaAtual = -1;
let transcriptAtual = "";
let dadosSessao = [];
let ultimaAnalise = null;
let ultimoRelatorio = null;
let timerVisual = null;
let protocoloJaLido = false;

const el = (id) => document.getElementById(id);

// ===================================
// LOGS
// ===================================

function log(msg) {
  const box = el("logsBox");
  const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`;
  if (box) {
    box.textContent += `\n${line}`;
    box.scrollTop = box.scrollHeight;
  }
}

// ===================================
// DADOS DE ENTRADA
// ===================================

function temaAtual() {
  return (el("inpTema")?.value || "").trim();
}

function contextoAtual() {
  return (el("inpContexto")?.value || "").trim();
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

// ===================================
// TEXTO PROGRESSIVO + TTS
// ===================================

function escreverTextoProgressivo(texto, alvoId, velocidade = 32) {
  return new Promise((resolve) => {
    const alvo = document.getElementById(alvoId);
    if (!alvo) {
      resolve();
      return;
    }

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

  const escrita = escreverTextoProgressivo(texto, alvoId, 32);
  const fala = window.ELAYON_TUNNEL.tts.speak(texto);

  await Promise.allSettled([fala, escrita]);
}

// ===================================
// PROTOCOLO INICIAL
// ===================================

const PROTOCOLO_USO = `Olá. Bem-vindo aos sistemas Elayon.

Esta é uma sessão de observação da sua própria fala.

Você é totalmente responsável pelo que diz, pelo tempo que utiliza e pela forma como conduz esta experiência.

O sistema não interpreta, não julga e não influencia suas respostas.

O CRS apenas capta padrões de ritmo e silêncio, sem interferir no conteúdo da sua fala.

Use este momento com atenção e presença.

Melhore sua postura, respire e quando estiver pronto pra falar sobre o tema e o contexto, pressione "Responder" para iniciar.`;



// ===================================
// ETAPAS
// ===================================

const TESTES = [
  {
    titulo: "Etapa 1 • Abertura",
    subtitulo: "Chegada ao tema.",
    getInstrucao: () => {
      const tema = temaAtual() || "o tema que você quiser trazer";
      return `Sobre ${tema}, comece da forma que achar mais natural. Não se preocupe em organizar. Apenas comece. Ao terminar, fique quatro segundos em silêncio.`;
    },
    texto: "",
    tipo: "abertura"
  },
  {
    titulo: "Etapa 2 • Continuidade",
    subtitulo: "Aprofundamento do mesmo assunto.",
    getInstrucao: () => {
      return `Agora continue. Dentro do que você disse, o que mais merece atenção neste momento? Ao terminar, fique quatro segundos em silêncio.`;
    },
    texto: "",
    tipo: "continuidade"
  },
  {
    titulo: "Etapa 3 • Consolidação",
    subtitulo: "Fechamento do eixo temático.",
    getInstrucao: () => {
      return `Depois de tudo isso, qual seria o próximo passo mais honesto para você agora? Ao terminar, fique quatro segundos em silêncio.`;
    },
    texto: "",
    tipo: "fechamento"
  }
];

// ===================================
// UI BÁSICA
// ===================================

function addTimeline(texto) {
  const item = document.createElement("div");
  item.className = "event";
  item.textContent = `[${new Date().toLocaleTimeString("pt-BR")}] ${texto}`;
  const timeline = el("timeline");
  if (timeline) timeline.prepend(item);
  log(texto);
}

function setPrompt(texto) {
  const node = el("promptAtual");
  if (node) node.textContent = texto;
}

function setStatusMic(texto) {
  const node = el("stMic");
  if (node) node.textContent = texto;
}

function setStatusEtapa(texto) {
  const node = el("stEtapa");
  if (node) node.textContent = texto;
}

function setPainelTecnico(obj) {
  const node = el("painelTecnico");
  if (!node) return;

  node.textContent = Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
}

function abrirModal() {
  el("modalFluxo")?.classList.add("show");
  log("modal aberto");
}

function fecharModal() {
  el("modalFluxo")?.classList.remove("show");
  log("modal fechado");
}

function showConfirm(show = true) {
  el("confirmBox")?.classList.toggle("show", show);
  log(show ? "bloco de confirmação exibido" : "bloco de confirmação oculto");
}

function setListening(active, text = "Microfone aguardando.") {
  el("pulseMic")?.classList.toggle("on", active);
  const label = el("listeningLabel");
  if (label) label.textContent = text;
}

// ===================================
// TIMER VISUAL
// ===================================

function iniciarTimerVisual() {
  let restante = DISPLAY_TIMER_SECONDS;
  const timerNode = el("timerFalando");
  if (timerNode) timerNode.textContent = String(restante);

  clearInterval(timerVisual);
  timerVisual = setInterval(() => {
    restante -= 1;
    if (timerNode) timerNode.textContent = String(Math.max(restante, 0));
    if (restante <= 0) clearInterval(timerVisual);
  }, 1000);
}

function pararTimerVisual() {
  clearInterval(timerVisual);
}

// ===================================
// RELATÓRIO LOCAL
// ===================================

function gerarResumoLocal(relatorio) {
  const texto = relatorio?.transcricao || "";
  const tema = relatorio?.tema || "tema não definido";

  if (!texto.trim()) {
    return "Não houve conteúdo suficiente para consolidar um resumo local.";
  }

  return [
    `Tema da sessão: ${tema}.`,
    `Nesta etapa, o usuário trouxe a seguinte formulação: "${texto}".`,
    `O conteúdo captado aponta para uma linha de reflexão ativa dentro do tema proposto.`,
    `Este bloco já pode ser usado como base de leitura por uma IA externa, junto com os dados temporais e o histórico recente.`
  ].join(" ");
}

function gerarObservacaoUtil(relatorio) {
  const silence = Number(relatorio?.payload?.silence_pct || 0);
  const pauses = Number(relatorio?.payload?.pause_count || 0);

  if (silence >= 30 || pauses >= 5) {
    return "Houve sinais de maior pausa ao longo da fala. Vale seguir com calma e confirmar se está tudo bem antes de aprofundar.";
  }

  if (silence <= 12 && pauses <= 2) {
    return "A fala veio com boa continuidade nesta etapa. Podemos seguir mantendo esse eixo.";
  }

  return "A sessão apresentou um ritmo intermediário, com espaço para continuidade sem pressão.";
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
    resumo_local: "",
    observacao_util: "",
    sessoes_anteriores: janela
  };
}

function renderRelatorio(relatorio) {
  relatorio.resumo_local = gerarResumoLocal(relatorio);
  relatorio.observacao_util = gerarObservacaoUtil(relatorio);

  const node = el("resultadoFinal");
  if (!node) return;

  node.textContent =
`Tema: ${relatorio.tema || "não definido"}
Contexto: ${relatorio.contexto || "não definido"}

Transcrição consolidada:
${relatorio.transcricao || "sem transcrição"}

Resumo local:
${relatorio.resumo_local}

Observação útil:
${relatorio.observacao_util}

Heurística CRS:
${relatorio.heuristica || "sem heurística"}

Diagnóstico CRS:
${relatorio.diagnostico?.estado || "sem estado"} • ${relatorio.diagnostico?.feedback || "sem feedback"}

Sessões anteriores consideradas:
${relatorio.sessoes_anteriores.length}`;
}

function renderListaRelatorios() {
  const lista = obterRelatorios();
  const alvo = el("listaRelatorios");
  if (!alvo) return;

  if (!lista.length) {
    alvo.innerHTML = `<div class="relatorio-item">Nenhum relatório salvo ainda.</div>`;
    return;
  }

  alvo.innerHTML = lista.slice().reverse().map((item, idx) => `
    <div class="relatorio-item">
      <strong>Relatório ${lista.length - idx}</strong>
      <div><b>Tema:</b> ${item.tema || "não definido"}</div>
      <div><b>Resumo:</b> ${item.resumo_local || item.resumo_conversacional || "sem resumo"}</div>
      <div><b>Data:</b> ${new Date(item.timestamp).toLocaleString("pt-BR")}</div>
    </div>
  `).join("");
}

// ===================================
// MÉTRICAS
// ===================================

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
    const valNode = el(`val${suffix}`);
    const barNode = el(`bar${suffix}`);
    if (valNode) valNode.textContent = `${val}%`;
    if (barNode) barNode.style.width = `${val}%`;
  });

  log(`métricas integradas atualizadas | silêncio=${silence} | pausas=${pauses}`);
}

// ===================================
// PROTOCOLO
// ===================================

async function abrirProtocoloInicial() {
  el("modalTitulo").textContent = "Protocolo de uso";
  el("modalSubtitulo").textContent = "Leitura inicial da sessão";
  abrirModal();

  const caixaLeitura = el("caixaTextoLeitura");
  if (caixaLeitura) caixaLeitura.style.display = "none";

  showConfirm(false);
  setListening(false, "IA emitindo protocolo.");
  el("btnResponder").disabled = false;

  await falarComEscritaProgressiva(PROTOCOLO_USO, "modalInstrucao");

  setPrompt("Protocolo lido. Quando estiver pronto, responda para iniciar a sessão.");
  setListening(false, "Pronto para iniciar.");
  protocoloJaLido = true;

  addTimeline("protocolo inicial concluído");
}

// ===================================
// ETAPAS
// ===================================

function carregarEtapa(indice) {
  etapaAtual = indice;
  const etapa = TESTES[indice];
  const instrucao = etapa.getInstrucao();

  setStatusEtapa(`${indice + 1} de 3`);
  setPrompt(instrucao);

  el("modalTitulo").textContent = etapa.titulo;
  el("modalSubtitulo").textContent = etapa.subtitulo;
  el("modalInstrucao").textContent = "";
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
    await falarComEscritaProgressiva(instrucao, "modalInstrucao");

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

// ===================================
// RESPOSTA DO USUÁRIO
// ===================================

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
  if (etapaAtual < 0) {
    carregarEtapa(0);
    return;
  }

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

// ===================================
// SALVAR / EXPORTAR
// ===================================

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

// ===================================
// RESET
// ===================================

function resetCockpit() {
  etapaAtual = -1;
  transcriptAtual = "";
  dadosSessao = [];
  ultimaAnalise = null;
  ultimoRelatorio = null;
  protocoloJaLido = false;

  setPrompt("A sessão ainda não começou. Defina tema e contexto, depois clique em “Iniciar sessão”.");
  setStatusMic("Aguardando");
  setStatusEtapa("0 de 3");

  const resultado = el("resultadoFinal");
  if (resultado) {
    resultado.textContent = "O relatório atual aparecerá aqui após as interações.";
  }

  const timeline = el("timeline");
  if (timeline) {
    timeline.innerHTML = `<div class="event">[00:00] sistema pronto • aguardando início da sessão</div>`;
  }

  ["Presenca","Clareza","Ritmo","Firmeza","Continuidade","Estabilidade","Oscilacao"].forEach(id => {
    const valNode = el(`val${id}`);
    const barNode = el(`bar${id}`);
    if (valNode) valNode.textContent = "0%";
    if (barNode) barNode.style.width = "0%";
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

  const logs = el("logsBox");
  if (logs) logs.textContent = "[logs] sistema pronto";

  log("cockpit resetado");
}

// ===================================
// EVENTOS
// ===================================

document.addEventListener("DOMContentLoaded", () => {
  resetCockpit();

  el("btnAbrirFluxo")?.addEventListener("click", async () => {
    if (!temaAtual()) {
      addTimeline("defina um tema antes de iniciar");
      return;
    }

    if (!protocoloJaLido) {
      await abrirProtocoloInicial();
      return;
    }

    carregarEtapa(0);
  });

  el("btnPararTudo")?.addEventListener("click", async () => {
    try {
      await window.ELAYON_TUNNEL.tts.stop();
    } catch {}

    fecharModal();
    addTimeline("sessão interrompida manualmente");
    setListening(false, "Sessão interrompida.");
    pararTimerVisual();
  });

  el("btnResetarCockpit")?.addEventListener("click", resetCockpit);

  el("btnEncerrarSessao")?.addEventListener("click", () => {
    fecharModal();
    addTimeline("sessão encerrada pelo usuário");
    setListening(false, "Sessão encerrada.");
    pararTimerVisual();
  });

  el("btnOuvirInstrucao")?.addEventListener("click", async () => {
    if (etapaAtual >= 0) {
      await ouvirInstrucaoAtual();
      return;
    }

    if (!protocoloJaLido) {
      await abrirProtocoloInicial();
    }
  });

  el("btnRepetirInstrucao")?.addEventListener("click", async () => {
    if (etapaAtual >= 0) {
      await ouvirInstrucaoAtual();
      return;
    }

    if (!protocoloJaLido) {
      await abrirProtocoloInicial();
    }
  });

  el("btnResponder")?.addEventListener("click", async () => {
    if (!protocoloJaLido) {
      protocoloJaLido = true;
      fecharModal();
      carregarEtapa(0);
      return;
    }

    await iniciarResposta();
  });

  el("btnConfirmarResposta")?.addEventListener("click", confirmarResposta);
  el("btnRefazerResposta")?.addEventListener("click", refazerResposta);

  el("btnEncerrarModal")?.addEventListener("click", () => {
    fecharModal();
    addTimeline("modal encerrado");
    setListening(false, "Modal encerrado.");
    pararTimerVisual();
  });

  el("btnAvancoManual")?.addEventListener("click", async () => {
    if (etapaAtual === -1 && temaAtual()) {
      if (!protocoloJaLido) {
        await abrirProtocoloInicial();
      } else {
        carregarEtapa(0);
      }
    }
  });

  el("btnSalvarSessao")?.addEventListener("click", salvarSessaoAtual);

  el("btnGerarRelatorio")?.addEventListener("click", () => {
    if (ultimoRelatorio) {
      renderRelatorio(ultimoRelatorio);
      addTimeline("relatório regenerado na tela");
    } else {
      addTimeline("ainda não há relatório para gerar");
    }
  });

  el("btnExportarRelatorio")?.addEventListener("click", exportarRelatorioAtual);
});