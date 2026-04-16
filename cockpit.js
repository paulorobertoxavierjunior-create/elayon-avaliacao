// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js
// ======================================

const WORKWORDS = {
  abrir: ["responder"],
  fechar: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok", "ok. ok"],
  confirma: ["confirma", "confirmar", "confirmo"],
  alinhar: ["alinhar", "refazer", "ajustar"]
};

const FLOW = {
  TYPE_SPEED: 24,
  STEP_DELAY_MS: 900,
  BETWEEN_ACTIONS_MS: 700,
  LISTEN_SHORT_MS: 3000,
  LISTEN_DECISION_MS: 12000,
  LISTEN_FREE_MS: 240000,
  PRE_MIC_WAIT_MS: 3000
};

const STATE = {
  respostas: [],
  analises: [],
  sessionId: null,
  etapaAtual: 0,
  locked: false
};

// ============================
// HELPERS
// ============================

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value ?? "";
}

function showTela(nome) {
  const telas = {
    intro: "telaIntro",
    sessao: "telaSessao",
    final: "telaFinal"
  };

  Object.values(telas).forEach((id) => {
    const node = el(id);
    if (node) node.classList.remove("show");
  });

  const telaId = telas[nome];
  if (telaId && el(telaId)) {
    el(telaId).classList.add("show");
  }
}

function normalize(txt) {
  return window.ELAYON_TUNNEL.utils.normalizeText(txt || "");
}

function matchAny(text, list) {
  const n = normalize(text);
  return list.some((item) => n.includes(normalize(item)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  const box = el("logTech");
  if (box) {
    box.textContent += `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
  }
  console.log("[PRESENCA]", msg);
}

async function resetMotores() {
  try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
}

function limparSessaoVisual() {
  setText("textoVivo", "");
  setText("statusSessao", "Preparando ambiente de interação.");
}

// ============================
// TEXTO PROGRESSIVO
// ============================

function escreverTextoProgressivo(texto, alvoId, velocidade = FLOW.TYPE_SPEED) {
  return new Promise((resolve) => {
    const alvo = el(alvoId);
    if (!alvo) {
      resolve();
      return;
    }

    alvo.textContent = "";
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
}

async function falarComTexto(texto, alvoId = "textoVivo") {
  await sleep(FLOW.BETWEEN_ACTIONS_MS);

  const escrita = escreverTextoProgressivo(texto, alvoId, FLOW.TYPE_SPEED);
  const fala = window.ELAYON_TUNNEL.tts.speak(texto, {
    rate: 0.94,
    pitch: 1,
    volume: 1,
    cancelPrevious: true
  });

  await Promise.allSettled([escrita, fala]);
  await sleep(FLOW.STEP_DELAY_MS);
}

// ============================
// BIP
// ============================

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

// ============================
// ESPERA POR PALAVRA
// ============================

async function esperarPalavra(lista, status = "Aguardando comando...") {
  setText("statusSessao", status);

  while (true) {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}

    const r = await window.ELAYON_TUNNEL.stt.listenOnce({
      silenceMs: FLOW.LISTEN_SHORT_MS
    });

    const t = r.text || "";
    log(`ouvido: ${t}`);

    if (matchAny(t, lista)) {
      return t;
    }

    await sleep(350);
  }
}

// ============================
// TUTORIAL
// ============================

async function rodadaTutorial() {
  await falarComTexto(
`Sistemas Elai ôn.

Bem-vindo ao PRESENÇA.

Este é um espaço de escuta simbólica.`
  );

  await falarComTexto(
`O PRESENÇA foi criado para conduzir uma avaliação da sua fala. No ritmo humano, mais pausado e mais confiável.`
  );

  await falarComTexto(
`Nesta experiência, o sistema fala com você passo a passo.

Cada instrução aparece escrita na tela e também é falada.`
  );

  await falarComTexto(
`Funciona assim.

Quando o sistema pedir, você dirá a palavra responder.

Somente depois disso o microfone será preparado para abrir.`
  );

  await falarComTexto(
`Antes da abertura do microfone, o sistema fará uma pequena contagem.

Depois da contagem, haverá um bip.

Só então você fala à vontade.`
  );

  await falarComTexto(
`Quando terminar sua fala, diga ok ok.

A expressão ok ok é o código que fecha sua resposta livre nesta fase.`
  );

  await falarComTexto(
`Depois disso, o sistema perguntará se você quer seguir ou refazer.

Se quiser seguir, diga confirma.

Se quiser refazer, diga alinhar.`
  );

  await falarComTexto(
`Agora vamos começar.

Quando estiver pronto para iniciar a sessão, diga responder.`
  );
}

// ============================
// CONTAGEM HUMANA
// ============================

async function contagemParaAbrirMic() {
  setText("statusSessao", "Prepare-se. Respira.");
  await sleep(FLOW.PRE_MIC_WAIT_MS);

  for (let n = 5; n >= 1; n--) {
    setText("statusSessao", `Vou abrir o microfone em ${n}...`);
    setText("textoVivo", String(n));
    await sleep(1000);
  }

  setText("statusSessao", "Bip. Microfone abrindo.");
  bip();
  await sleep(250);
}

// ============================
// CAPTURA LIVRE
// ============================

async function capturarRespostaLivre() {
  setText("statusSessao", "🎙️ Microfone aberto. Fale à vontade e termine com ok ok.");
  setText("textoVivo", "");

  await window.ELAYON_TUNNEL.mic.open();

  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: WORKWORDS.fechar,
      silenceFailsafeMs: FLOW.LISTEN_FREE_MS,
      onPartial: (d) => {
        setText("textoVivo", d.cleaned_text || d.text || "");
      }
    });

    const texto = (heard.cleaned_text || heard.text || "").trim();
    setText("textoVivo", texto || "Sem conteúdo captado.");

    return texto;
  } finally {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
    try { await window.ELAYON_TUNNEL.mic.close(); } catch {}
    await sleep(FLOW.STEP_DELAY_MS);
  }
}

// ============================
// DECISÃO
// ============================

async function capturarDecisao() {
  await falarComTexto(
`Tudo certo até aqui?

Se quiser seguir, diga confirma.

Se quiser refazer, diga alinhar.`
  );

  setText("statusSessao", "Aguardando: confirma ou alinhar");

  while (true) {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}

    const r = await window.ELAYON_TUNNEL.stt.listenOnce({
      silenceMs: FLOW.LISTEN_DECISION_MS
    });

    const t = r.text || "";
    log(`decisão ouvida: ${t}`);

    if (matchAny(t, WORKWORDS.alinhar)) return "alinhar";
    if (matchAny(t, WORKWORDS.confirma)) return "confirma";

    await sleep(350);
  }
}

// ============================
// ETAPAS
// ============================

function obterPerguntas() {
  const tema = (el("inpTema")?.value || "").trim() || "o tema que você escolheu";

  return [
    `Vamos começar.

Quando eu disser responder, você prepara sua fala.

Depois da contagem e do bip, fale sobre ${tema} do jeito mais natural possível.

Quando terminar, diga ok ok.`,

    `Agora aprofunde um pouco mais.

Dentro do que você trouxe, o que merece mais atenção neste momento?

Quando terminar, diga ok ok.`,

    `Para concluir, diga qual é o próximo passo mais honesto para você agora.

Quando terminar, diga ok ok.`
  ];
}

async function rodarEtapa(pergunta, indice) {
  setText("statusSessao", `Etapa ${indice + 1} de 3`);

  await falarComTexto(pergunta);
  await falarComTexto(`Quando estiver pronto para esta etapa, diga responder.`);

  await esperarPalavra(WORKWORDS.abrir, "Aguardando: responder");
  await contagemParaAbrirMic();

  const resposta = await capturarRespostaLivre();

  if (!resposta) {
    await falarComTexto(`Nenhum conteúdo válido foi captado. Vamos alinhar e repetir esta etapa.`);
    return rodarEtapa(pergunta, indice);
  }

  const decisao = await capturarDecisao();

  if (decisao === "alinhar") {
    await falarComTexto(`Vamos refazer esta etapa com calma.`);
    return rodarEtapa(pergunta, indice);
  }

  return resposta;
}

// ============================
// CRS
// ============================

async function enviarCRS(texto, indice) {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();

  const payload = window.ELAYON_TUNNEL.crs.buildPayload(texto, {
    context: `${contexto} | etapa ${indice + 1} | tema ${tema}`,
    source_text: tema
  });

  return await window.ELAYON_TUNNEL.crs.analyze(payload);
}

// ============================
// RELATÓRIO
// ============================

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

// ============================
// NOVA SESSÃO
// ============================

function novaSessao() {
  STATE.respostas = [];
  STATE.analises = [];
  STATE.sessionId = null;
  STATE.etapaAtual = 0;
  STATE.locked = false;

  setText("statusIntro", "Aguardando início.");
  limparSessaoVisual();
  setText("relatorioFinal", "Nenhum relatório disponível.");

  showTela("intro");
}

// ============================
// FLUXO PRINCIPAL
// ============================

async function iniciar() {
  if (STATE.locked) return;

  try {
    STATE.locked = true;

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
    STATE.etapaAtual = 0;

    setText("statusIntro", "Iniciando experiência...");
    limparSessaoVisual();
    showTela("sessao");

    await rodadaTutorial();

    const etapas = obterPerguntas();

    for (let i = 0; i < etapas.length; i++) {
      STATE.etapaAtual = i + 1;

      const resposta = await rodarEtapa(etapas[i], i);
      STATE.respostas.push(resposta);

      setText("statusSessao", "Processando no núcleo CRS...");
      await sleep(FLOW.BETWEEN_ACTIONS_MS);

      const analise = await enviarCRS(resposta, i);
      STATE.analises.push(analise);

      await sleep(FLOW.STEP_DELAY_MS);
    }

    const relatorio = gerarRelatorio(STATE.respostas, STATE.analises);
    setText("relatorioFinal", relatorio);

    await falarComTexto(`Relatório concluído.`, "textoVivo");
    showTela("final");
  } catch (err) {
    console.error(err);
    alert(`Falha na sessão: ${err.message || err}`);
    setText("statusSessao", "Falha detectada.");
    showTela("intro");
  } finally {
    await resetMotores();
    STATE.locked = false;
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