// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js
// ======================================

const WORKWORDS = {
  fecharLivre: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok", "ok. ok"],
  confirma: ["confirma", "confirmar", "confirmo"],
  alinhar: ["alinhar", "refazer", "ajustar"]
};

const ETAPAS = [
  {
    id: 1,
    titulo: "Etapa 1 — Abertura",
    instrucao: ({ tema }) =>
      `Prepare-se para mostrar seu ponto de vista sobre o tema. Quando eu abrir o microfone num bip, você fala o quanto quiser sobre ${tema || "o tema que você escolheu"} e, quando terminar, diga a expressão okok.`
  },
  {
    id: 2,
    titulo: "Etapa 2 — Continuidade",
    instrucao: () =>
      `Agora aprofunde um pouco mais. Dentro do que você trouxe, o que merece mais atenção neste momento? Quando terminar sua fala, diga okok.`
  },
  {
    id: 3,
    titulo: "Etapa 3 — Consolidação",
    instrucao: () =>
      `Para concluir, diga qual é o próximo passo mais honesto para você agora. Quando terminar sua fala, diga okok.`
  }
];

const STATE = {
  etapaIndex: 0,
  mode: "idle", // idle | intro | ia_falando | countdown | ouvindo | aguardando_decisao | processando | finalizado
  etapas: [],
  report: null,
  startedAt: null,
  sessionId: null
};

// ======================================
// HELPERS DOM
// ======================================

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value ?? "";
}

function setHTML(id, value) {
  const node = el(id);
  if (node) node.innerHTML = value ?? "";
}

function showScreen(screenId) {
  ["screenIntro", "screenRunning", "screenDone"].forEach((id) => {
    const node = el(id);
    if (!node) return;
    node.style.display = id === screenId ? "block" : "none";
  });
}

function nowLabel() {
  return new Date().toLocaleString("pt-BR");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ======================================
// LOG
// ======================================

function log(msg) {
  console.log("[PRESENCA]", msg);
}

// ======================================
// UX
// ======================================

async function falarTextoLento(texto, alvoId, velocidade = 26) {
  const alvo = el(alvoId);
  if (alvo) alvo.textContent = "";

  const escrita = new Promise((resolve) => {
    if (!alvo) {
      resolve();
      return;
    }

    let i = 0;
    function tick() {
      if (i < texto.length) {
        alvo.textContent += texto[i];
        i += 1;
        setTimeout(tick, velocidade);
      } else {
        resolve();
      }
    }
    tick();
  });

  const fala = window.ELAYON_TUNNEL.tts.speak(texto, {
    rate: 0.95,
    pitch: 1,
    volume: 1,
    cancelPrevious: true
  });

  await Promise.allSettled([escrita, fala]);
}

function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 880;
    gain.gain.value = 0.08;

    osc.start();

    setTimeout(() => {
      try { osc.stop(); } catch {}
      try { ctx.close(); } catch {}
    }, 140);
  } catch {}
}

async function countdownAndMic() {
  STATE.mode = "countdown";
  setText("statusLine", "Prepare-se.");
  setText("countdownText", "Respira. 3s.");

  await sleep(3000);

  for (let n = 5; n >= 1; n--) {
    setText("countdownText", String(n));
    await sleep(1000);
  }

  setText("countdownText", "Bip.");
  bip();
  await sleep(160);
}

// ======================================
// NORMALIZAÇÃO
// ======================================

function normalizeText(txt) {
  return window.ELAYON_TUNNEL.utils.normalizeText(txt);
}

function cleanedUserText(txt) {
  return window.ELAYON_TUNNEL.utils.stripPhrases(txt, [
    ...WORKWORDS.fecharLivre,
    ...WORKWORDS.confirma,
    ...WORKWORDS.alinhar
  ]).trim();
}

// ======================================
// INTRO
// ======================================

async function falarIntroducao() {
  STATE.mode = "intro";

  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();

  const texto =
`SISTEMAS ELAYON

Bem-vindo ao PRESENÇA.

Um espaço de reflexão e escuta simbólica configurado para visualizar e alinhar o comportamento humano aos seus próprios sentidos e emoções.

Prepare-se para mostrar seu ponto de vista sobre o tema.
Respira.

Vou abrir o microfone e você fala à vontade e termina com okok.

Concentre-se.

O tema atual é: ${tema || "não informado"}.
O contexto atual é: ${contexto || "não informado"}.

Vamos começar.`;

  await falarTextoLento(texto, "introText", 24);
}

// ======================================
// CAPTAÇÃO LIVRE
// ======================================

async function capturarRespostaLivre() {
  STATE.mode = "ouvindo";
  setText("statusLine", "Microfone aberto. Fale à vontade e termine com okok.");
  setText("decisionHint", "");
  setText("liveTranscript", "");

  await window.ELAYON_TUNNEL.audio.startCapture();

  const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
    stopPhrases: WORKWORDS.fecharLivre,
    silenceFailsafeMs: 120000,
    onPartial: (data) => {
      const parcialLimpo = cleanedUserText(data.text || "");
      setText("liveTranscript", parcialLimpo || "...");
    }
  });

  const stopped = await window.ELAYON_TUNNEL.audio.stopCapture();
  const audioReport = stopped.report || window.ELAYON_TUNNEL.audio.getReport();

  const finalText = (heard.cleaned_text || heard.text || "").trim();
  setText("liveTranscript", finalText || "Sem conteúdo captado.");

  return {
    heard,
    finalText,
    audioReport
  };
}

// ======================================
// DECISÃO
// ======================================

async function capturarDecisao() {
  STATE.mode = "aguardando_decisao";
  setText(
    "decisionHint",
    `Se quiser refazer, diga alinhar. Para continuar, diga confirma.`
  );
  setText("statusLine", "Aguardando decisão.");

  bip();

  const heard = await window.ELAYON_TUNNEL.stt.listenForAnyPhrase({
    phrases: [...WORKWORDS.confirma, ...WORKWORDS.alinhar],
    silenceFailsafeMs: 20000,
    onPartial: (data) => {
      const txt = normalizeText(data.text || "");
      setText("decisionHint", txt || "Aguardando: confirma ou alinhar");
    }
  });

  const normalized = normalizeText(heard.text || "");
  const isConfirm = WORKWORDS.confirma.some((w) => normalized.includes(normalizeText(w)));
  const isAlign = WORKWORDS.alinhar.some((w) => normalized.includes(normalizeText(w)));

  if (isAlign) return "alinhar";
  if (isConfirm) return "confirma";
  return null;
}

// ======================================
// CRS
// ======================================

async function analisarEtapaNoCRS(etapa, transcricao, audioReport) {
  STATE.mode = "processando";
  setText("statusLine", "Processando etapa no núcleo CRS...");

  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();

  const payload = window.ELAYON_TUNNEL.crs.buildPayload(transcricao, {
    context: `${contexto} | etapa ${etapa.id} | tema ${tema}`,
    source_text: etapa.instrucao({ tema }),
    audio_report: audioReport
  });

  const analysis = await window.ELAYON_TUNNEL.crs.analyze(payload);

  return {
    payload,
    analysis
  };
}

// ======================================
// ETAPA
// ======================================

async function executarEtapa() {
  const etapa = ETAPAS[STATE.etapaIndex];
  const tema = (el("inpTema")?.value || "").trim();

  setText("stageTitle", etapa.titulo);
  setText("liveTranscript", "");
  setText("decisionHint", "");
  setText("countdownText", "");
  setText("statusLine", "Preparando etapa...");

  const instrucao = etapa.instrucao({ tema });

  STATE.mode = "ia_falando";
  await falarTextoLento(instrucao, "stagePrompt", 24);

  await countdownAndMic();

  const captura = await capturarRespostaLivre();

  if (!captura.finalText) {
    setText("decisionHint", "Nenhum conteúdo válido foi captado. Vamos alinhar e tentar de novo.");
    await sleep(1200);
    return executarEtapa();
  }

  const decisao = await capturarDecisao();

  if (decisao !== "confirma") {
    setText("statusLine", "Vamos alinhar e refazer esta etapa.");
    await sleep(900);
    return executarEtapa();
  }

  const analisado = await analisarEtapaNoCRS(etapa, captura.finalText, captura.audioReport);

  STATE.etapas.push({
    id: etapa.id,
    titulo: etapa.titulo,
    instrucao,
    transcricao: captura.finalText,
    audio_report: captura.audioReport,
    payload: analisado.payload,
    analysis: analisado.analysis
  });

  STATE.etapaIndex += 1;
}

// ======================================
// RELATÓRIO
// ======================================

function summarizeSession() {
  const etapas = STATE.etapas;

  let tempoTotal = 0;
  let silencioTotal = 0;
  let pausasTotal = 0;
  let energiaMedia = 0;
  let oscilacaoMedia = 0;

  etapas.forEach((e) => {
    const rel = e.analysis?.relatorio || {};
    tempoTotal += Number(rel.tempo_total || 0);
    silencioTotal += Number(rel.porcentagem_silencio || 0);
    pausasTotal += Number(rel.total_pausas || 0);
    energiaMedia += Number(rel.energia_pct || 0);
    oscilacaoMedia += Number(rel.oscilacao_pct || 0);
  });

  const n = etapas.length || 1;

  return {
    tempo_total: Math.round(tempoTotal),
    silencio_medio: Math.round(silencioTotal / n),
    pausas_total: pausasTotal,
    energia_media: Math.round(energiaMedia / n),
    oscilacao_media: Math.round(oscilacaoMedia / n)
  };
}

function buildFinalReport() {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();
  const resumoSessao = summarizeSession();

  const report = {
    sistema: "Sistemas Elayon",
    modulo: "PRESENÇA",
    sessao: STATE.sessionId,
    data: nowLabel(),
    tema,
    contexto,
    resumo_sessao: resumoSessao,
    etapas: STATE.etapas.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      instrucao: e.instrucao,
      transcricao: e.transcricao,
      relatorio_crs: e.analysis?.relatorio || {},
      analise_sugestiva: e.analysis?.analise_sugestiva || "sem análise",
      sugestao_ia: e.analysis?.sugestao_ia || "sem sugestão",
      snapshot_sonoro: e.audio_report?.spectrum_snapshot || {},
      timeline_series: e.audio_report?.timeline_series || [],
      spectrum_series: e.audio_report?.spectrum_series || []
    }))
  };

  STATE.report = report;
  return report;
}

function buildPreviewHTML(report) {
  const etapasHtml = report.etapas.map((e) => {
    const r = e.relatorio_crs || {};
    const s = e.snapshot_sonoro || {};

    return `
      <section style="margin-bottom:28px;">
        <h3 style="margin:0 0 10px 0;">${escapeHtml(e.titulo)}</h3>
        <p><strong>Transcrição:</strong> ${escapeHtml(e.transcricao || "sem conteúdo")}</p>
        <p><strong>Análise sugestiva:</strong> ${escapeHtml(e.analise_sugestiva || "sem análise")}</p>
        <p><strong>Sugestão para IA:</strong> ${escapeHtml(e.sugestao_ia || "sem sugestão")}</p>
        <p><strong>Tempo total:</strong> ${escapeHtml(r.tempo_total ?? "—")}</p>
        <p><strong>Silêncio:</strong> ${escapeHtml(r.porcentagem_silencio ?? "—")}%</p>
        <p><strong>Pausas:</strong> ${escapeHtml(r.total_pausas ?? "—")}</p>
        <p><strong>Densidade:</strong> ${escapeHtml(r.densidade ?? "—")}</p>
        <p><strong>Snapshot sonoro:</strong> graves ${escapeHtml(s.graves ?? "—")} • médios ${escapeHtml(s.medios ?? "—")} • agudos ${escapeHtml(s.agudos ?? "—")} • ruído ${escapeHtml(s.ruido ?? "—")} • estabilidade ${escapeHtml(s.estabilidade ?? "—")}</p>
        <p><strong>Imagem:</strong> gráfico temporal da etapa, mapa de calor vocal e leitura espectral resumida.</p>
      </section>
    `;
  }).join("");

  return `
    <div>
      <h2 style="margin:0 0 14px 0;">Relatório concluído.</h2>
      <p><strong>Sessão:</strong> ${escapeHtml(report.sessao)}</p>
      <p><strong>Data:</strong> ${escapeHtml(report.data)}</p>
      <p><strong>Tema:</strong> ${escapeHtml(report.tema || "não informado")}</p>
      <p><strong>Contexto:</strong> ${escapeHtml(report.contexto || "não informado")}</p>
      <p><strong>Tempo total:</strong> ${escapeHtml(report.resumo_sessao.tempo_total)} s</p>
      <p><strong>Silêncio médio:</strong> ${escapeHtml(report.resumo_sessao.silencio_medio)}%</p>
      <p><strong>Pausas totais:</strong> ${escapeHtml(report.resumo_sessao.pausas_total)}</p>
      <p><strong>Energia média:</strong> ${escapeHtml(report.resumo_sessao.energia_media)}%</p>
      <p><strong>Oscilação média:</strong> ${escapeHtml(report.resumo_sessao.oscilacao_media)}%</p>
      <hr style="margin:20px 0; border:none; border-top:1px solid rgba(255,255,255,.12);" />
      ${etapasHtml}
      <section>
        <h3>Síntese para IA externa</h3>
        <p>O presente relatório reúne transcrição consolidada, métricas temporais, snapshot sonoro, leitura sugestiva do núcleo CRS e descrição visual complementar. A IA que consumir este material deve responder com objetividade, respeito ao contexto e foco em continuidade prática.</p>
      </section>
    </div>
  `;
}

function renderFinalReport() {
  const report = buildFinalReport();
  setHTML("reportPreview", buildPreviewHTML(report));
  showScreen("screenDone");
}

// ======================================
// PDF
// ======================================

function buildPdfText(report) {
  const linhas = [];

  linhas.push("Sistemas Elayon");
  linhas.push("PRESENÇA • RELATÓRIO DE AUTOAVALIAÇÃO");
  linhas.push("");
  linhas.push(`Sessão: ${report.sessao}`);
  linhas.push(`Data: ${report.data}`);
  linhas.push(`Tema: ${report.tema || "não informado"}`);
  linhas.push(`Contexto: ${report.contexto || "não informado"}`);
  linhas.push("");
  linhas.push("Resumo da sessão");
  linhas.push(`Tempo total: ${report.resumo_sessao.tempo_total} s`);
  linhas.push(`Silêncio médio: ${report.resumo_sessao.silencio_medio}%`);
  linhas.push(`Pausas totais: ${report.resumo_sessao.pausas_total}`);
  linhas.push(`Energia média: ${report.resumo_sessao.energia_media}%`);
  linhas.push(`Oscilação média: ${report.resumo_sessao.oscilacao_media}%`);
  linhas.push("");

  report.etapas.forEach((e) => {
    const r = e.relatorio_crs || {};
    const s = e.snapshot_sonoro || {};

    linhas.push(`${e.titulo}`);
    linhas.push(`Transcrição: ${e.transcricao || "sem conteúdo"}`);
    linhas.push(`Análise sugestiva: ${e.analise_sugestiva || "sem análise"}`);
    linhas.push(`Sugestão para IA: ${e.sugestao_ia || "sem sugestão"}`);
    linhas.push(`Tempo total: ${r.tempo_total ?? "—"}`);
    linhas.push(`Silêncio: ${r.porcentagem_silencio ?? "—"}%`);
    linhas.push(`Pausas: ${r.total_pausas ?? "—"}`);
    linhas.push(`Densidade: ${r.densidade ?? "—"}`);
    linhas.push(`Snapshot sonoro: graves ${s.graves ?? "—"} | médios ${s.medios ?? "—"} | agudos ${s.agudos ?? "—"} | ruído ${s.ruido ?? "—"} | estabilidade ${s.estabilidade ?? "—"}`);
    linhas.push(`Imagem: gráfico temporal da etapa, mapa de calor vocal e leitura espectral resumida.`);
    linhas.push("");
  });

  linhas.push("Síntese para IA externa");
  linhas.push("O presente relatório reúne transcrição consolidada, métricas temporais, snapshot sonoro, leitura sugestiva do núcleo CRS e descrição visual complementar.");
  linhas.push("");

  return linhas.join("\n");
}

function gerarPdfRelatorio() {
  if (!STATE.report) return;

  const texto = buildPdfText(STATE.report);
  const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${STATE.report.sessao}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ======================================
// FLUXO PRINCIPAL
// ======================================

async function iniciarSessao() {
  try {
    const tema = (el("inpTema")?.value || "").trim();
    const contexto = (el("inpContexto")?.value || "").trim();

    if (!tema) {
      alert("Informe o tema antes de iniciar.");
      return;
    }

    const health = await window.ELAYON_TUNNEL.healthcheck();

    if (!health.authenticated) {
      alert("Sessão não autenticada. Faça login antes de usar o PRESENÇA.");
      return;
    }

    if (!health.mic || !health.stt || !health.tts || !health.crs) {
      alert("Nem todos os serviços estão disponíveis. Verifique microfone, STT, TTS e núcleo CRS.");
      return;
    }

    STATE.etapaIndex = 0;
    STATE.etapas = [];
    STATE.report = null;
    STATE.startedAt = new Date().toISOString();
    STATE.sessionId = `presenca-${Date.now()}`;
    STATE.mode = "intro";

    log(`Sessão iniciada | tema=${tema} | contexto=${contexto}`);

    showScreen("screenRunning");
    setText("stageTitle", "SISTEMAS ELAYON");
    setText("stagePrompt", "");
    setText("liveTranscript", "");
    setText("decisionHint", "");
    setText("countdownText", "");
    setText("statusLine", "Preparando sessão.");

    await window.ELAYON_TUNNEL.mic.open();
    await falarIntroducao();

    while (STATE.etapaIndex < ETAPAS.length) {
      await executarEtapa();
    }

    STATE.mode = "finalizado";
    setText("statusLine", "Sessão concluída.");
    renderFinalReport();
  } catch (err) {
    console.error(err);
    alert(`Falha na sessão: ${err.message || err}`);
    setText("statusLine", "Falha detectada.");
  } finally {
    try { await window.ELAYON_TUNNEL.audio.stopCapture(); } catch {}
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
    try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
    try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
  }
}

function novaSessao() {
  STATE.etapaIndex = 0;
  STATE.mode = "idle";
  STATE.etapas = [];
  STATE.report = null;
  STATE.startedAt = null;
  STATE.sessionId = null;

  setText("introText", "");
  setText("stageTitle", "");
  setText("stagePrompt", "");
  setText("liveTranscript", "");
  setText("decisionHint", "");
  setText("countdownText", "");
  setText("statusLine", "");
  setHTML("reportPreview", "");

  showScreen("screenIntro");
}

// ======================================
// INIT
// ======================================

document.addEventListener("DOMContentLoaded", () => {
  log("cockpit carregado");
  showScreen("screenIntro");

  el("btnIniciar")?.addEventListener("click", iniciarSessao);
  el("btnNovaSessao")?.addEventListener("click", novaSessao);
  el("btnGerarPdf")?.addEventListener("click", gerarPdfRelatorio);
});