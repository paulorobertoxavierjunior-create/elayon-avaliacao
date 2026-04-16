// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js
// ======================================

const WORKWORDS = {
  abrir: ["responder"],
  fechar: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok"],
  confirma: ["confirma", "confirmar"],
  alinhar: ["alinhar", "refazer"]
};

const STATE = {
  etapa: 0,
  respostas: [],
  analises: [],
  audioReports: [],
  sessionId: null
};

// ============================
// HELPERS
// ============================

function el(id) {
  return document.getElementById(id);
}

function setText(id, v) {
  if (el(id)) el(id).textContent = v;
}

function normalize(txt) {
  return window.ELAYON_TUNNEL.utils.normalizeText(txt);
}

function matchAny(text, list) {
  const n = normalize(text || "");
  return list.some(w => n.includes(normalize(w)));
}

function showTela(nome) {
  const telas = {
    intro: "telaIntro",
    sessao: "telaSessao",
    final: "telaFinal"
  };

  Object.values(telas).forEach(id => {
    if (el(id)) el(id).classList.remove("show");
  });

  if (telas[nome] && el(telas[nome])) {
    el(telas[nome]).classList.add("show");
  }
}

// ============================
// FLUXO BASE
// ============================

async function esperarPalavra(lista, status = "Aguardando comando...") {
  setText("statusSessao", status);

  while (true) {
    const r = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 4000 });
    const t = r.text || "";

    if (matchAny(t, lista)) {
      return t;
    }
  }
}

// ============================
// CAPTURA CONTROLADA
// ============================

async function capturarResposta() {
  setText("statusSessao", "🎙️ ouvindo...");
  setText("textoVivo", "");

  await window.ELAYON_TUNNEL.audio.startCapture();

  const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
    stopPhrases: WORKWORDS.fechar,
    silenceFailsafeMs: 120000,
    onPartial: (d) => {
      setText("textoVivo", d.text || "");
    }
  });

  const stopped = await window.ELAYON_TUNNEL.audio.stopCapture();
  const audioReport = stopped.report || window.ELAYON_TUNNEL.audio.getReport();

  const texto = (heard.cleaned_text || heard.text || "").trim();
  setText("textoVivo", texto || "—");

  return {
    texto,
    audioReport
  };
}

// ============================
// ETAPA
// ============================

async function rodarEtapa(pergunta) {
  await window.ELAYON_TUNNEL.tts.speak(pergunta);

  setText("textoVivo", "");
  await esperarPalavra(WORKWORDS.abrir, "Aguardando: responder");

  await window.ELAYON_TUNNEL.tts.speak("Microfone aberto.");

  const captura = await capturarResposta();
  const resposta = captura.texto;

  if (!resposta) {
    await window.ELAYON_TUNNEL.tts.speak("Nada captado. Vamos tentar novamente.");
    return rodarEtapa(pergunta);
  }

  await window.ELAYON_TUNNEL.tts.speak(
    "Se quiser confirmar diga confirma. Se quiser refazer diga alinhar."
  );

  setText("statusSessao", "Aguardando: confirma ou alinhar");

  let decisao = null;

  while (!decisao) {
    const r = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 4000 });
    const t = r.text || "";

    if (matchAny(t, WORKWORDS.confirma)) decisao = "confirmar";
    if (matchAny(t, WORKWORDS.alinhar)) decisao = "alinhar";
  }

  if (decisao === "alinhar") {
    await window.ELAYON_TUNNEL.tts.speak("Refazendo etapa.");
    return rodarEtapa(pergunta);
  }

  return captura;
}

// ============================
// CRS
// ============================

async function enviarCRS(texto, audioReport = {}) {
  const payload = window.ELAYON_TUNNEL.crs.buildPayload(texto, {
    duration_sec: audioReport.duration_sec,
    silence_pct: audioReport.silence_pct,
    pause_count: audioReport.pause_count,
    mean_pause_ms: audioReport.mean_pause_ms,
    energy_pct: audioReport.energy_pct,
    oscillation_pct: audioReport.oscillation_pct,
    continuity_pct: audioReport.continuity_pct,
    stability_pct: audioReport.stability_pct,
    noise_pct: audioReport.noise_pct,
    spectrum_snapshot: audioReport.spectrum_snapshot,
    timeline_events: audioReport.timeline_series,
    spectrum_series: audioReport.spectrum_series,
    context: (el("inpContexto")?.value || "").trim(),
    source_text: (el("inpTema")?.value || "").trim()
  });

  return await window.ELAYON_TUNNEL.crs.analyze(payload);
}

// ============================
// RELATÓRIO
// ============================

function gerarRelatorio(respostas, analises, audioReports) {
  let txt = "";

  txt += "SISTEMAS ELAYON\n";
  txt += "PRESENÇA — RELATÓRIO\n\n";
  txt += `Sessão: ${STATE.sessionId}\n`;
  txt += `Data: ${new Date().toLocaleString("pt-BR")}\n`;
  txt += `Tema: ${(el("inpTema")?.value || "").trim() || "não informado"}\n`;
  txt += `Contexto: ${(el("inpContexto")?.value || "").trim() || "não informado"}\n\n`;

  respostas.forEach((r, i) => {
    txt += `ETAPA ${i + 1}\n`;
    txt += `FALA: ${r}\n`;

    const a = analises[i]?.relatorio || {};
    const ar = audioReports[i] || {};
    const ss = ar.spectrum_snapshot || {};

    txt += `Tempo: ${a.tempo_total || ar.duration_sec || 0}s\n`;
    txt += `Silêncio: ${a.porcentagem_silencio || ar.silence_pct || 0}%\n`;
    txt += `Pausas: ${a.total_pausas || ar.pause_count || 0}\n`;
    txt += `Densidade: ${a.densidade || 0}\n`;
    txt += `Média de pausa: ${ar.mean_pause_ms || 0}ms\n`;
    txt += `Energia: ${ar.energy_pct || 0}%\n`;
    txt += `Oscilação: ${ar.oscillation_pct || 0}%\n`;
    txt += `Continuidade: ${ar.continuity_pct || 0}%\n`;
    txt += `Estabilidade: ${ar.stability_pct || 0}%\n`;
    txt += `Ruído: ${ar.noise_pct || 0}%\n`;
    txt += `Snapshot: graves ${ss.graves || 0} | médios ${ss.medios || 0} | agudos ${ss.agudos || 0} | ruído ${ss.ruido || 0} | estabilidade ${ss.estabilidade || 0}\n`;

    if (analises[i]?.analise_sugestiva) {
      txt += `Análise sugestiva: ${analises[i].analise_sugestiva}\n`;
    }

    if (analises[i]?.sugestao_ia) {
      txt += `Sugestão para IA: ${analises[i].sugestao_ia}\n`;
    }

    txt += "\n";
  });

  return txt;
}

// ============================
// PDF
// ============================

function gerarPdfRelatorio() {
  const texto = el("relatorioFinal")?.textContent?.trim();

  if (!texto || texto === "Nenhum relatório disponível.") {
    alert("Nenhum relatório disponível para exportar.");
    return;
  }

  if (!window.jspdf?.jsPDF) {
    alert("Biblioteca de PDF não carregada.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });

  const marginX = 14;
  let y = 18;
  const usableWidth = 210 - marginX * 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const lines = doc.splitTextToSize(texto, usableWidth);
  const lineHeight = 5.2;

  lines.forEach((line) => {
    if (y > 280) {
      doc.addPage();
      y = 18;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  });

  doc.save(`${STATE.sessionId || "relatorio-elayon"}.pdf`);
}

// ============================
// RESET
// ============================

async function resetMotores() {
  try { await window.ELAYON_TUNNEL.audio.stopCapture(); } catch {}
  try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
}

function novaSessao() {
  STATE.etapa = 0;
  STATE.respostas = [];
  STATE.analises = [];
  STATE.audioReports = [];
  STATE.sessionId = null;

  setText("statusIntro", "Aguardando início.");
  setText("statusSessao", "Preparando ambiente de interação.");
  setText("textoVivo", "");
  setText("relatorioFinal", "Nenhum relatório disponível.");

  showTela("intro");
}

// ============================
// FLUXO PRINCIPAL
// ============================

async function iniciar() {
  try {
    const tema = (el("inpTema")?.value || "").trim();

    if (!tema) {
      alert("Informe o tema antes de iniciar.");
      return;
    }

    const health = await window.ELAYON_TUNNEL.healthcheck();

    if (!health.authenticated) {
      alert("Faça login primeiro.");
      return;
    }

    if (!health.mic || !health.stt || !health.tts || !health.crs) {
      alert("Nem todos os serviços estão disponíveis. Verifique microfone, TTS, STT e núcleo CRS.");
      return;
    }

    STATE.sessionId = "sessao-" + Date.now();
    STATE.respostas = [];
    STATE.analises = [];
    STATE.audioReports = [];

    setText("statusIntro", "Iniciando experiência...");
    setText("textoVivo", "");
    showTela("sessao");

    await window.ELAYON_TUNNEL.mic.open();

    await window.ELAYON_TUNNEL.tts.speak(
`SISTEMAS ELAYON.
Bem-vindo ao PRESENÇA.
Diga responder para iniciar.`
    );

    const etapas = [
      "Fale sobre o tema.",
      "Agora aprofunde.",
      "Qual seu próximo passo?"
    ];

    for (let i = 0; i < etapas.length; i++) {
      const captura = await rodarEtapa(etapas[i]);

      STATE.respostas.push(captura.texto);
      STATE.audioReports.push(captura.audioReport);

      setText("statusSessao", "Processando no núcleo CRS...");
      const analise = await enviarCRS(captura.texto, captura.audioReport);
      STATE.analises.push(analise);
    }

    const relatorio = gerarRelatorio(
      STATE.respostas,
      STATE.analises,
      STATE.audioReports
    );

    setText("relatorioFinal", relatorio);

    await window.ELAYON_TUNNEL.tts.speak("Relatório concluído.");
    showTela("final");
  } catch (err) {
    console.error(err);
    alert(`Falha na sessão: ${err.message || err}`);
    setText("statusSessao", "Falha detectada.");
    showTela("intro");
  } finally {
    await resetMotores();
  }
}

// ============================
// INIT
// ============================

document.addEventListener("DOMContentLoaded", () => {
  showTela("intro");

  el("btnIniciar")?.addEventListener("click", iniciar);
  el("btnNovaSessao")?.addEventListener("click", novaSessao);
  el("btnGerarPdf")?.addEventListener("click", gerarPdfRelatorio);
});