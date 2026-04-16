const WORKWORDS = {
  abrir: ["responder"],
  fechar: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok"],
  confirma: ["confirma", "confirmar", "confirmo"],
  alinhar: ["alinhar", "refazer", "ajustar"]
};

const STATE = {
  respostas: [],
  analises: [],
  sessionId: null
};

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  if (el(id)) el(id).textContent = value ?? "";
}

function normalize(txt) {
  return window.ELAYON_TUNNEL.utils.normalizeText(txt);
}

function matchAny(text, list) {
  const n = normalize(text || "");
  return list.some((w) => n.includes(normalize(w)));
}

function showTela(nome) {
  const telas = {
    intro: "telaIntro",
    sessao: "telaSessao",
    final: "telaFinal"
  };

  Object.values(telas).forEach((id) => {
    if (el(id)) el(id).classList.remove("show");
  });

  if (telas[nome] && el(telas[nome])) {
    el(telas[nome]).classList.add("show");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetMotores() {
  try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
}

async function esperarPalavra(lista, status = "Aguardando comando...") {
  setText("statusSessao", status);

  while (true) {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}

    const r = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 2500 });
    const t = r.text || "";

    if (matchAny(t, lista)) {
      return t;
    }

    await sleep(300);
  }
}

async function capturarResposta() {
  setText("statusSessao", "🎙️ ouvindo...");
  setText("textoVivo", "");

  await window.ELAYON_TUNNEL.mic.open();

  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: WORKWORDS.fechar,
      silenceFailsafeMs: 120000,
      onPartial: (d) => {
        setText("textoVivo", d.cleaned_text || d.text || "");
      }
    });

    const texto = (heard.cleaned_text || heard.text || "").trim();
    setText("textoVivo", texto || "—");

    return texto;
  } finally {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
    try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
  }
}

async function rodarEtapa(pergunta) {
  await window.ELAYON_TUNNEL.tts.speak(pergunta);
  setText("textoVivo", "");

  await window.ELAYON_TUNNEL.tts.speak("Quando quiser começar sua resposta, diga responder.");
  await esperarPalavra(WORKWORDS.abrir, "Aguardando: responder");

  await window.ELAYON_TUNNEL.tts.speak("Microfone aberto.");
  const resposta = await capturarResposta();

  if (!resposta) {
    await window.ELAYON_TUNNEL.tts.speak("Nada captado. Vamos tentar novamente.");
    return rodarEtapa(pergunta);
  }

  await window.ELAYON_TUNNEL.tts.speak(
    "Se quiser confirmar, diga confirma. Se quiser refazer, diga alinhar."
  );

  setText("statusSessao", "Aguardando: confirma ou alinhar");

  while (true) {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}

    const r = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 2500 });
    const t = r.text || "";

    if (matchAny(t, WORKWORDS.alinhar)) {
      await window.ELAYON_TUNNEL.tts.speak("Refazendo etapa.");
      return rodarEtapa(pergunta);
    }

    if (matchAny(t, WORKWORDS.confirma)) {
      return resposta;
    }

    await sleep(300);
  }
}

async function enviarCRS(texto, idx) {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();

  const payload = window.ELAYON_TUNNEL.crs.buildPayload(texto, {
    context: `${contexto} | etapa ${idx + 1} | tema ${tema}`,
    source_text: tema
  });

  return await window.ELAYON_TUNNEL.crs.analyze(payload);
}

function gerarRelatorio(respostas, analises) {
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

    txt += `Tempo: ${a.tempo_total || 0}s\n`;
    txt += `Silêncio: ${a.porcentagem_silencio || 0}%\n`;
    txt += `Pausas: ${a.total_pausas || 0}\n`;
    txt += `Densidade: ${a.densidade || 0}\n`;

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
  const usableWidth = 210 - marginX * 2;
  let y = 18;

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

function novaSessao() {
  STATE.respostas = [];
  STATE.analises = [];
  STATE.sessionId = null;

  setText("statusIntro", "Aguardando início.");
  setText("statusSessao", "Preparando ambiente de interação.");
  setText("textoVivo", "");
  setText("relatorioFinal", "Nenhum relatório disponível.");

  showTela("intro");
}

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

    setText("statusIntro", "Iniciando experiência...");
    setText("textoVivo", "");
    showTela("sessao");

    await window.ELAYON_TUNNEL.tts.speak(
`SISTEMAS ELAYON.
Bem-vindo ao PRESENÇA.
Este é um espaço de escuta simbólica.
Quando quiser iniciar, diga responder.`
    );

    const etapas = [
      "Fale sobre o tema.",
      "Agora aprofunde.",
      "Qual é o próximo passo mais honesto para você agora?"
    ];

    for (let i = 0; i < etapas.length; i++) {
      const resposta = await rodarEtapa(etapas[i]);
      STATE.respostas.push(resposta);

      setText("statusSessao", "Processando no núcleo CRS...");
      const analise = await enviarCRS(resposta, i);
      STATE.analises.push(analise);
    }

    const relatorio = gerarRelatorio(STATE.respostas, STATE.analises);
    setText("relatorioFinal", relatorio);

    await window.ELAYON_TUNNEL.tts.speak("Relatório concluído.");
    showTela("final");
  } catch (err) {
    console.error(err);
    await resetMotores();
    alert(`Falha na sessão: ${err.message || err}`);
    setText("statusSessao", "Falha detectada.");
    showTela("intro");
  } finally {
    await resetMotores();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  showTela("intro");

  el("btnIniciar")?.addEventListener("click", iniciar);
  el("btnNovaSessao")?.addEventListener("click", novaSessao);
  el("btnGerarPdf")?.addEventListener("click", gerarPdfRelatorio);
});