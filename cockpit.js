// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js
// compatível com o index atual
// ======================================

const WORKWORDS = {
  abrir: ["responder"],
  fecharLivre: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok", "ok. ok"],
  confirma: ["confirma", "confirmar", "confirmo"],
  alinhar: ["alinhar", "refazer", "ajustar"]
};

const ETAPAS = [
  {
    id: 1,
    titulo: "Etapa 1 — Abertura",
    instrucao: ({ tema }) =>
      `SISTEMAS ELAYON.

Bem-vindo ao PRESENÇA.

Este é um espaço de reflexão e escuta simbólica.

Prepare-se para mostrar seu ponto de vista sobre o tema.

Respira.

Vou abrir o microfone e você fala à vontade sobre ${tema || "o tema que você escolheu"}.

Quando terminar de falar, diga okok.`
  },
  {
    id: 2,
    titulo: "Etapa 2 — Continuidade",
    instrucao: () =>
      `Agora aprofunde um pouco mais.

Dentro do que você trouxe, o que merece mais atenção neste momento?

Quando terminar sua fala, diga okok.`
  },
  {
    id: 3,
    titulo: "Etapa 3 — Consolidação",
    instrucao: () =>
      `Para concluir, diga qual é o próximo passo mais honesto para você agora.

Quando terminar sua fala, diga okok.`
  }
];

const STATE = {
  etapaIndex: 0,
  etapas: [],
  report: null,
  mode: "idle",
  sessionId: null,
  startedAt: null
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

function appendText(id, value) {
  const node = el(id);
  if (node) node.textContent += value ?? "";
}

function showTela(nome) {
  const mapa = {
    intro: "telaIntro",
    sessao: "telaSessao",
    final: "telaFinal"
  };

  Object.values(mapa).forEach((id) => {
    const node = el(id);
    if (!node) return;
    node.classList.remove("show");
  });

  const telaId = mapa[nome];
  if (telaId && el(telaId)) {
    el(telaId).classList.add("show");
  }
}

function nowLabel() {
  return new Date().toLocaleString("pt-BR");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  console.log("[PRESENCA]", msg);
  const box = el("logTech");
  if (box) {
    box.textContent += `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ======================================
// TEXTO + FALA
// ======================================

async function falarTextoLento(texto, alvoId, velocidade = 24) {
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

// ======================================
// BIP + CONTAGEM
// ======================================

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
    }, 150);
  } catch {}
}

async function contagemAberturaMic() {
  setText("statusSessao", "Prepare-se. Respira. 3 segundos.");
  await sleep(3000);

  for (let n = 5; n >= 1; n--) {
    setText("statusSessao", `Vou abrir o microfone em ${n}...`);
    await sleep(1000);
  }

  setText("statusSessao", "Bip. Microfone abrindo.");
  bip();
  await sleep(180);
}

// ======================================
// NORMALIZAÇÃO
// ======================================

function normalizeText(txt) {
  return window.ELAYON_TUNNEL.utils.normalizeText(txt);
}

function cleanedUserText(txt) {
  return window.ELAYON_TUNNEL.utils.stripPhrases(txt, [
    ...WORKWORDS.abrir,
    ...WORKWORDS.fecharLivre,
    ...WORKWORDS.confirma,
    ...WORKWORDS.alinhar
  ]).trim();
}

function hasAnyPhrase(text, phrases = []) {
  const n = normalizeText(text || "");
  return phrases.some((p) => n.includes(normalizeText(p)));
}

// ======================================
// INTRODUÇÃO
// ======================================

async function falarAberturaSistema() {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();

  const texto = `SISTEMAS ELAYON.

Bem-vindo ao PRESENÇA.

Um espaço de reflexão e escuta simbólica configurado para visualizar e alinhar o comportamento humano aos seus próprios sentidos e emoções.

Tema informado: ${tema || "não informado"}.

Contexto informado: ${contexto || "não informado"}.

A ativação inicial é manual.

Quando estiver pronto para começar, diga responder.`;

  setText("textoVivo", "");
  await falarTextoLento(texto, "textoVivo", 24);
  setText("statusSessao", "Aguardando a palavra responder.");
}

// ======================================
// COMANDO DE ABERTURA
// ======================================

async function esperarResponder() {
  STATE.mode = "aguardando_responder";
  setText("statusSessao", "Aguardando: responder");

  const heard = await window.ELAYON_TUNNEL.stt.listenForAnyPhrase({
    phrases: WORKWORDS.abrir,
    silenceFailsafeMs: 90000,
    onPartial: (data) => {
      const txt = cleanedUserText(data.text || "");
      setText("textoVivo", txt || "");
    }
  });

  return heard;
}

// ======================================
// CAPTAÇÃO LIVRE
// ======================================

async function capturarRespostaLivre() {
  STATE.mode = "ouvindo";
  setText("statusSessao", "Microfone aberto. Fale à vontade e termine com okok.");
  setText("textoVivo", "");

  await window.ELAYON_TUNNEL.audio.startCapture();

  const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
    stopPhrases: WORKWORDS.fecharLivre,
    silenceFailsafeMs: 120000,
    onPartial: (data) => {
      const parcial = cleanedUserText(data.text || "");
      setText("textoVivo", parcial || "");
    }
  });

  const stopped = await window.ELAYON_TUNNEL.audio.stopCapture();
  const audioReport = stopped.report || window.ELAYON_TUNNEL.audio.getReport();

  const finalText = (heard.cleaned_text || heard.text || "").trim();
  setText("textoVivo", finalText || "Sem conteúdo captado.");

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

  const texto =
`Tudo certo?

Se não, diga alinhar.

Se sim, diga confirma.`;

  await falarTextoLento(texto, "textoVivo", 22);
  setText("statusSessao", "Aguardando: confirma ou alinhar.");
  bip();

  const heard = await window.ELAYON_TUNNEL.stt.listenForAnyPhrase({
    phrases: [...WORKWORDS.confirma, ...WORKWORDS.alinhar],
    silenceFailsafeMs: 20000,
    onPartial: (data) => {
      const txt = normalizeText(data.text || "");
      setText("statusSessao", txt || "Aguardando decisão...");
    }
  });

  const raw = heard.text || "";
  if (hasAnyPhrase(raw, WORKWORDS.alinhar)) return "alinhar";
  if (hasAnyPhrase(raw, WORKWORDS.confirma)) return "confirma";
  return null;
}

// ======================================
// CRS
// ======================================

async function analisarEtapaNoCRS(etapa, transcricao, audioReport) {
  STATE.mode = "processando";
  setText("statusSessao", "Processando etapa no núcleo CRS...");

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

  setText("textoVivo", "");
  setText("statusSessao", etapa.titulo);

  await falarTextoLento(etapa.instrucao({ tema }), "textoVivo", 24);

  const textoEspera =
`Quando quiser começar sua resposta, diga responder.`;

  await falarTextoLento(textoEspera, "textoVivo", 22);

  await esperarResponder();
  await contagemAberturaMic();

  const captura = await capturarRespostaLivre();

  if (!captura.finalText) {
    await falarTextoLento(
      "Nenhum conteúdo válido foi captado. Vamos alinhar e tentar de novo.",
      "textoVivo",
      22
    );
    return executarEtapa();
  }

  const decisao = await capturarDecisao();

  if (decisao !== "confirma") {
    await falarTextoLento("Vamos alinhar e refazer esta etapa.", "textoVivo", 22);
    return executarEtapa();
  }

  const analisado = await analisarEtapaNoCRS(etapa, captura.finalText, captura.audioReport);

  STATE.etapas.push({
    id: etapa.id,
    titulo: etapa.titulo,
    instrucao: etapa.instrucao({ tema }),
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

  const report = {
    sistema: "Sistemas Elayon",
    modulo: "PRESENÇA",
    sessao: STATE.sessionId,
    data: nowLabel(),
    tema,
    contexto,
    resumo_sessao: summarizeSession(),
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

function buildPreviewText(report) {
  const lines = [];

  lines.push("Sistemas Elayon");
  lines.push("PRESENÇA • RELATÓRIO DE AUTOAVALIAÇÃO");
  lines.push("");
  lines.push(`Sessão: ${report.sessao}`);
  lines.push(`Data: ${report.data}`);
  lines.push(`Tema: ${report.tema || "não informado"}`);
  lines.push(`Contexto: ${report.contexto || "não informado"}`);
  lines.push("");
  lines.push("Resumo da sessão");
  lines.push(`Tempo total: ${report.resumo_sessao.tempo_total} s`);
  lines.push(`Silêncio médio: ${report.resumo_sessao.silencio_medio}%`);
  lines.push(`Pausas totais: ${report.resumo_sessao.pausas_total}`);
  lines.push(`Energia média: ${report.resumo_sessao.energia_media}%`);
  lines.push(`Oscilação média: ${report.resumo_sessao.oscilacao_media}%`);
  lines.push("");

  report.etapas.forEach((e) => {
    const r = e.relatorio_crs || {};
    const s = e.snapshot_sonoro || {};

    lines.push(`${e.titulo}`);
    lines.push(`Transcrição: ${e.transcricao || "sem conteúdo"}`);
    lines.push(`Análise sugestiva: ${e.analise_sugestiva || "sem análise"}`);
    lines.push(`Sugestão para IA: ${e.sugestao_ia || "sem sugestão"}`);
    lines.push(`Tempo total: ${r.tempo_total ?? "—"}`);
    lines.push(`Silêncio: ${r.porcentagem_silencio ?? "—"}%`);
    lines.push(`Pausas: ${r.total_pausas ?? "—"}`);
    lines.push(`Densidade: ${r.densidade ?? "—"}`);
    lines.push(
      `Snapshot sonoro: graves ${s.graves ?? "—"} | médios ${s.medios ?? "—"} | agudos ${s.agudos ?? "—"} | ruído ${s.ruido ?? "—"} | estabilidade ${s.estabilidade ?? "—"}`
    );
    lines.push("Imagem: gráfico temporal da etapa, mapa de calor vocal e leitura espectral resumida.");
    lines.push("");
  });

  lines.push("Síntese para IA externa");
  lines.push(
    "O presente relatório reúne transcrição consolidada, métricas temporais, snapshot sonoro, leitura sugestiva do núcleo CRS e descrição visual complementar."
  );

  return lines.join("\n");
}

function renderFinalReport() {
  const report = buildFinalReport();
  setText("relatorioFinal", buildPreviewText(report));
  showTela("final");
}

// ======================================
// PDF REAL
// ======================================

function gerarPdfRelatorio() {
  if (!STATE.report || !window.jspdf?.jsPDF) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });

  const marginX = 14;
  let y = 18;
  const pageWidth = 210;
  const usableWidth = pageWidth - marginX * 2;

  function writeBlock(text, fontSize = 11, gap = 6) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);

    const lines = doc.splitTextToSize(String(text || ""), usableWidth);
    const lineHeight = fontSize * 0.38 + 1.4;
    const blockHeight = lines.length * lineHeight;

    if (y + blockHeight > 280) {
      doc.addPage();
      y = 18;
    }

    doc.text(lines, marginX, y);
    y += blockHeight + gap;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Sistemas Elayon", marginX, y);
  y += 8;

  doc.setFontSize(13);
  doc.text("PRESENÇA • RELATÓRIO DE AUTOAVALIAÇÃO", marginX, y);
  y += 10;

  const texto = buildPreviewText(STATE.report);
  writeBlock(texto, 10, 4);

  doc.save(`${STATE.report.sessao}.pdf`);
}

// ======================================
// RESET
// ======================================

async function resetAllEngines() {
  try { await window.ELAYON_TUNNEL.audio.stopCapture(); } catch {}
  try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
}

// ======================================
// FLUXO
// ======================================

async function iniciarSessao() {
  try {
    const tema = (el("inpTema")?.value || "").trim();
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
      alert("Nem todos os serviços estão disponíveis. Verifique microfone, TTS, STT e núcleo CRS.");
      return;
    }

    STATE.etapaIndex = 0;
    STATE.etapas = [];
    STATE.report = null;
    STATE.mode = "intro";
    STATE.startedAt = new Date().toISOString();
    STATE.sessionId = `presenca-${Date.now()}`;

    setText("statusIntro", "Iniciando experiência...");
    setText("textoVivo", "");
    showTela("sessao");

    await window.ELAYON_TUNNEL.mic.open();
    await falarAberturaSistema();

    while (STATE.etapaIndex < ETAPAS.length) {
      await executarEtapa();
    }

    STATE.mode = "finalizado";
    await falarTextoLento("Relatório concluído.", "textoVivo", 22);
    renderFinalReport();
  } catch (err) {
    console.error(err);
    alert(`Falha na sessão: ${err.message || err}`);
    setText("statusSessao", "Falha detectada.");
  } finally {
    await resetAllEngines();
  }
}

function novaSessao() {
  STATE.etapaIndex = 0;
  STATE.etapas = [];
  STATE.report = null;
  STATE.mode = "idle";
  STATE.sessionId = null;
  STATE.startedAt = null;

  setText("statusIntro", "Aguardando início.");
  setText("statusSessao", "Preparando ambiente de interação.");
  setText("textoVivo", "");
  setText("relatorioFinal", "Nenhum relatório disponível.");

  showTela("intro");
}

// ======================================
// INIT
// ======================================

document.addEventListener("DOMContentLoaded", () => {
  log("cockpit carregado");
  showTela("intro");

  el("btnIniciar")?.addEventListener("click", iniciarSessao);
  el("btnNovaSessao")?.addEventListener("click", novaSessao);
  el("btnGerarPdf")?.addEventListener("click", gerarPdfRelatorio);
});