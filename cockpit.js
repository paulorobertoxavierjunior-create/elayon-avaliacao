// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js — isolado no SpeechRecognition
// ======================================

const WORKWORDS = {
  fecharLivre: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok", "ok. ok"],
  confirma: ["confirma", "confirmar", "confirmo"],
  alinhar: ["alinhar", "refazer", "ajustar"]
};

const FLOW = {
  TYPE_SPEED: 45, // 👈 Esse número controla a velocidade da digitação (antes era 24, agora 45 fica mais humano)
  STEP_DELAY_MS: 1200, // 👈 Aumentei o tempo de espera depois de falar
  BETWEEN_ACTIONS_MS: 800, // 👈 Tempo de espera antes de começar a falar
  LISTEN_DECISION_MS: 15000,
  LISTEN_FREE_MS: 999999,
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

function assertStructure() {
  const ids = [
    "telaIntro",
    "telaSessao",
    "telaFinal",
    "btnIniciar",
    "btnNovaSessao",
    "btnGerarPdf",
    "inpTema",
    "inpContexto",
    "statusIntro",
    "statusSessao",
    "textoVivo",
    "relatorioFinal"
  ];

  const missing = ids.filter((id) => !el(id));
  if (missing.length) {
    throw new Error(`IDs ausentes no index: ${missing.join(", ")}`);
  }
}

async function resetMotores() {
  try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
  try { await window.ELAYON_TUNNEL.tts.stop(); } catch {}
}

function limparSessaoVisual() {
  setText("textoVivo", "");
  setText("statusSessao", "Preparando ambiente de interação.");
}

// ============================
// TEXTO + FALA
// ============================

function escreverTextoProgressivo(texto, alvoId, velocidade = FLOW.TYPE_SPEED) {
  return new Promise((resolve) => {
    const alvo = el(alvoId);
    if (!alvo) return resolve();

    // Garante primeira letra maiúscula
    const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
    
    alvo.textContent = "";
    let i = 0;

    function tick() {
      if (i < textoFinal.length) {
        alvo.textContent += textoFinal[i];
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
    rate: 1.1,
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

    osc.frequency.value = 432;
    gain.gain.value = 0.18;

    osc.start();

    setTimeout(() => {
      try { osc.stop(); } catch {}
      try { ctx.close(); } catch {}
    }, 140);
  } catch {}
}

// ============================
// CONTAGEM
// ============================

async function contagemParaAbrirEscuta() {
  setText("statusSessao", "Prepare-se. Respira.");
  await sleep(FLOW.PRE_MIC_WAIT_MS);

  await falarComTexto(
`Vou abrir a escuta simbólica.

Você tem cinco segundos para se preparar.`
  );

  await sleep(1000);

  for (let n = 5; n >= 1; n--) {
    setText("statusSessao", `Abrindo em ${n}...`);
    setText("textoVivo", String(n));
    await sleep(1000);
  }

  setText("statusSessao", "Bip. Escuta iniciando.");
  bip();
  await sleep(250);
}

// ============================
// CAPTURA LIVRE
// ============================

async function capturarRespostaLivre() {
  setText("statusSessao", "🎙️ Escuta aberta. Fale à vontade e termine com ok ok.");
  setText("textoVivo", "");

  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: WORKWORDS.fecharLivre,
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
    await sleep(FLOW.STEP_DELAY_MS);
  }
}

// ============================
// CAPTURA DECISÃO
// ============================

async function capturarDecisaoCurta() {
  setText("statusSessao", "🎙️ Escuta curta aberta para decisão.");
  setText("textoVivo", "");

  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: [...WORKWORDS.confirma, ...WORKWORDS.alinhar],
      silenceFailsafeMs: FLOW.LISTEN_DECISION_MS,
      onPartial: (d) => {
        setText("textoVivo", d.cleaned_text || d.text || "");
      }
    });

    const txt = heard.text || "";

    if (matchAny(txt, WORKWORDS.alinhar)) return "alinhar";
    if (matchAny(txt, WORKWORDS.confirma)) return "confirma";
    return null;
  } finally {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
    await sleep(FLOW.STEP_DELAY_MS);
  }
}

// ============================
// TUTORIAL
// ============================

async function rodadaTutorial() {
  await falarComTexto(
`Sistemas Elayon.

Humanidade e Tecnologia, em Harmonia.

Eu sou o PRESENÇA.

Um espaço de escuta e auto observação simbólica. Observe-se. Vizualize e identifique os símbolos da sua emanação no espaço tempo.
  );

  await falarComTexto(
`É de boa! Como num espelho. Só que de sinais além da visão. Você vai entender.

Funciona assim. O microfone vai abrir. Você se expressa sobre seu tema livremente. Quando acabar de falar, diga a expressão, "ok ok". Só isso`
  );

  await falarComTexto(
`Diga, "confirma", pra enviar, ou diga "alinhar" para refazer a etapa.`
  );

  await falarComTexto(`Vamos começar a sessão.`);
}

// ============================
// ETAPAS
// ============================

function obterPerguntas() {
  const tema = (el("inpTema")?.value || "").trim() || "o tema que você escolheu";

  return [
    `Primeira etapa - Abertura ou Introdução.

Fale sobre o tema ${tema} do seu jeito.

Lembre-se da instrução: Ouvi o Bip do microfone? Fala. Acabou? diga "ok ok", pra encerrar. Depois, alinha de novo, ou confirma e continua. Prepare-se. 5 segundos, e avançamos.`

    `Segunda etapa - Visualização ou Desenvolvimento.

Quando terminar sua fala, diga ok ok.`,

    `Terceira etapa. Conexão ou Conclusão.

Para concluir essa etapa, aproveite para agradecer a si mesmo pela postura diante de si, no final, diga apenas "ok ok" pra terminar. Do mesmo jeito.`
  ];
}

async function rodarEtapa(pergunta, indice) {
  setText("statusSessao", `Etapa ${indice + 1} de 3`);

  await falarComTexto(pergunta);
  await contagemParaAbrirEscuta();

  const resposta = await capturarRespostaLivre();

  if (!resposta) {
    await falarComTexto(`Nenhum conteúdo válido foi captado. Vamos alinhar esta etapa sem erro.`);
    return rodarEtapa(pergunta, indice);
  }

  await falarComTexto(
`Sua fala foi registrada.

Para continuar, diga confirma.

Pra refazer, diga alinhar.`
  );

  const decisao = await capturarDecisaoCurta();

  if (decisao !== "confirma") {
    await falarComTexto(`Vamos alinhar esta etapa com calma.`);
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
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

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

    assertStructure();

    if (!window.ELAYON_TUNNEL) {
      throw new Error("ELAYON_TUNNEL não foi carregado");
    }

    const tema = (el("inpTema")?.value || "").trim();
    if (!tema) {
      alert("Informe o tema antes de iniciar.");
      return;
    }

    const health = await window.ELAYON_TUNNEL.healthcheck();
    log(`health: ${JSON.stringify(health)}`);

    if (!health.authenticated) {
      alert("Faça login primeiro.");
      return;
    }

    if (!health.stt || !health.tts || !health.crs) {
      alert("Nem todos os serviços estão disponíveis. Verifique STT, TTS e núcleo CRS.");
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
    await resetMotores();
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
  try {
    assertStructure();
    showTela("intro");

    el("btnIniciar")?.addEventListener("click", iniciar);
    el("btnNovaSessao")?.addEventListener("click", novaSessao);
    el("btnGerarPdf")?.addEventListener("click", gerarPdfRelatorio);

    log("cockpit carregado");
  } catch (err) {
    console.error(err);
    alert(`Falha estrutural do cockpit: ${err.message || err}`);
  }
});