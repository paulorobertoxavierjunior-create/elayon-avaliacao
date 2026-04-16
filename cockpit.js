// ============================
// CONFIG
// ============================

const WORKWORDS = {
  fecharLivre: "ok ok",
  fecharLivreAlt: "okok",
  confirmar: "confirma",
  alinhar: "alinhar"
};

const ETAPAS = [
  {
    id: 1,
    titulo: "Abertura",
    pergunta: ({ tema }) =>
      `Prepare-se para mostrar seu ponto de vista sobre o tema. Pode falar sobre ${tema || "o tema que você trouxe"} do jeito que achar mais natural.`
  },
  {
    id: 2,
    titulo: "Continuidade",
    pergunta: () =>
      `Agora continue. Dentro do que você disse, o que merece mais atenção neste momento?`
  },
  {
    id: 3,
    titulo: "Consolidação",
    pergunta: () =>
      `Para concluir, qual é o próximo passo mais honesto para você agora?`
  }
];

const STATE = {
  etapaIndex: 0,
  tema: "",
  contexto: "",
  sessionId: null,
  transcriptAtual: "",
  etapas: [],
  relatorioFinal: null,
  micBusy: false
};

// ============================
// DOM
// ============================

const el = (id) => document.getElementById(id);

// ============================
// UTIL
// ============================

function normalize(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setTextoVivo(txt) {
  const node = el("textoVivo");
  if (node) node.textContent = txt || "";
}

function setStatusIntro(txt) {
  const node = el("statusIntro");
  if (node) node.textContent = txt || "";
}

function setStatusSessao(txt) {
  const node = el("statusSessao");
  if (node) node.textContent = txt || "";
}

function showScreen(screenId) {
  ["telaIntro", "telaSessao", "telaFinal"].forEach((id) => {
    el(id)?.classList.remove("show");
  });
  el(screenId)?.classList.add("show");
}

function logTech(msg) {
  const node = el("logTech");
  if (!node) return;
  node.textContent += `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
}

function nextSessionId() {
  return `presenca-${Date.now()}`;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================
// ÁUDIO
// ============================

function bip() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 880;
    gain.gain.value = 0.06;

    osc.start();

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 140);
  } catch (e) {
    logTech(`falha no bip: ${e.message}`);
  }
}

async function falar(texto, velocidade = 45) {
  setTextoVivo("");
  let i = 0;

  const escrita = new Promise((resolve) => {
    function tick() {
      if (i < texto.length) {
        const atual = el("textoVivo")?.textContent || "";
        setTextoVivo(atual + texto[i]);
        i += 1;
        setTimeout(tick, velocidade);
      } else {
        resolve();
      }
    }
    tick();
  });

  const voz = window.ELAYON_TUNNEL.tts.speak(texto, {
    lang: "pt-BR",
    rate: 0.95,
    pitch: 1,
    volume: 1
  });

  await Promise.allSettled([escrita, voz]);
}

// ============================
// CONTAGEM
// ============================

async function contagemAbertura() {
  await waitMs(3000);

  setTextoVivo("5...");
  await waitMs(1000);

  setTextoVivo("4...");
  await waitMs(1000);

  setTextoVivo("3...");
  await waitMs(1000);

  setTextoVivo("2...");
  await waitMs(1000);

  setTextoVivo("1...");
  await waitMs(1000);

  setTextoVivo("");
  bip();
}

// ============================
// CAPTURA LIVRE
// ============================

async function capturarTextoLivre() {
  if (STATE.micBusy) {
    throw new Error("microfone já está em uso");
  }

  STATE.micBusy = true;

  try {
    setStatusSessao("Microfone aberto. Fale à vontade e termine com okok.");

    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: [WORKWORDS.fecharLivre, WORKWORDS.fecharLivreAlt],
      silenceFailsafeMs: 90000,
      onPartial: (data) => {
        const limpo =
          data?.cleaned_text ||
          window.ELAYON_TUNNEL.utils.stripPhrases(data?.text || "", [
            WORKWORDS.fecharLivre,
            WORKWORDS.fecharLivreAlt
          ]);

        setTextoVivo(limpo);
      }
    });

    const finalText =
      heard?.cleaned_text ||
      window.ELAYON_TUNNEL.utils.stripPhrases(heard?.text || "", [
        WORKWORDS.fecharLivre,
        WORKWORDS.fecharLivreAlt
      ]);

    STATE.transcriptAtual = finalText.trim();
    setTextoVivo(STATE.transcriptAtual || "Sem conteúdo consolidado.");
    setStatusSessao("Fala encerrada.");

    logTech(`texto livre capturado: ${STATE.transcriptAtual}`);

    return STATE.transcriptAtual;
  } finally {
    STATE.micBusy = false;
  }
}

// ============================
// CAPTURA DECISÃO
// ============================

async function capturarDecisao() {
  if (STATE.micBusy) {
    throw new Error("microfone já está em uso");
  }

  STATE.micBusy = true;

  try {
    setStatusSessao("Escolha sua decisão: confirma ou alinhar.");

    const heard = await window.ELAYON_TUNNEL.stt.listenForAnyPhrase({
      phrases: [WORKWORDS.confirmar, WORKWORDS.alinhar],
      silenceFailsafeMs: 15000,
      onPartial: (data) => {
        setTextoVivo(data?.text || "");
      }
    });

    const txt = normalize(heard?.text || "");
    logTech(`decisão capturada: ${txt}`);

    if (txt.includes(WORKWORDS.alinhar)) return WORKWORDS.alinhar;
    return WORKWORDS.confirmar;
  } finally {
    STATE.micBusy = false;
  }
}

// ============================
// CRS
// ============================

function buildPayload(texto, etapa) {
  return window.ELAYON_TUNNEL.crs.buildPayload(texto, {
    context: `${STATE.contexto} | etapa ${etapa.id} | tema ${STATE.tema}`,
    source_text: etapa.pergunta({ tema: STATE.tema, contexto: STATE.contexto })
  });
}

// ============================
// RELATÓRIO
// ============================

function buildReport(snapshot) {
  const linhas = [];

  linhas.push("SISTEMAS ELAYON");
  linhas.push("");
  linhas.push("PRESENÇA • RELATÓRIO DE AUTOAVALIAÇÃO");
  linhas.push("");
  linhas.push(`Sessão: ${snapshot.session_id}`);
  linhas.push(`Data: ${new Date(snapshot.timestamp).toLocaleString("pt-BR")}`);
  linhas.push(`Tema: ${snapshot.tema || "não definido"}`);
  linhas.push(`Contexto: ${snapshot.contexto || "não definido"}`);
  linhas.push("");

  snapshot.etapas.forEach((et) => {
    linhas.push(`Etapa ${et.etapa} — ${et.titulo}`);
    linhas.push(`Transcrição: ${et.transcricao || "sem conteúdo"}`);
    linhas.push(`Resumo CRS: ${et.analysis?.user_report?.summary || "sem resumo"}`);
    linhas.push(`Heurística CRS: ${et.analysis?.heuristica || "sem heurística"}`);
    linhas.push("");
  });

  return linhas.join("\n");
}

async function concluirSessao() {
  const snapshot = {
    session_id: STATE.sessionId,
    timestamp: new Date().toISOString(),
    tema: STATE.tema,
    contexto: STATE.contexto,
    etapas: STATE.etapas
  };

  const relatorioTexto = buildReport(snapshot);

  STATE.relatorioFinal = {
    ...snapshot,
    relatorio_texto: relatorioTexto
  };

  if (typeof salvarSessao === "function") {
    salvarSessao(snapshot);
  }

  if (typeof salvarRelatorio === "function") {
    salvarRelatorio(STATE.relatorioFinal);
  }

  const relatorioNode = el("relatorioFinal");
  if (relatorioNode) {
    relatorioNode.textContent = relatorioTexto;
  }

  showScreen("telaFinal");
}

// ============================
// ETAPAS
// ============================

async function executarEtapa(etapa) {
  const pergunta = etapa.pergunta({
    tema: STATE.tema,
    contexto: STATE.contexto
  });

  await falar(pergunta);

  await falar(`Respira.`);

  await falar(
    `Vou abrir o microfone e você fala à vontade. Quando terminar, diga okok.`
  );

  await falar(`Concentre-se.`);

  await contagemAbertura();

  const texto = await capturarTextoLivre();

  await falar(`Tudo certo?`);

  await falar(
    `Se quiser refazer, diga alinhar. Se estiver pronto para seguir, diga confirma.`
  );

  bip();

  const decisao = await capturarDecisao();

  if (decisao === WORKWORDS.alinhar) {
    await falar(`Vamos alinhar.`);
    return executarEtapa(etapa);
  }

  setStatusSessao("Enviando análise desta etapa.");

  const payload = buildPayload(texto, etapa);
  const analysis = await window.ELAYON_TUNNEL.crs.analyze(payload);

  logTech(`análise etapa ${etapa.id}: ${JSON.stringify(analysis)}`);

  STATE.etapas.push({
    etapa: etapa.id,
    titulo: etapa.titulo,
    pergunta,
    transcricao: texto,
    payload,
    analysis
  });

  return true;
}

// ============================
// FLUXO INICIAL
// ============================

async function fluxoInicial() {
  await falar(`SISTEMAS ELAYON`);

  await falar(`Bem-vindo ao PRESENÇA.`);

  await falar(
    `Um espaço de reflexão e escuta simbólica, configurado para visualizar e alinhar o comportamento humano aos seus próprios sentidos e emoções.`
  );

  await falar(`Dica ELAYON.`);

  await falar(
    `Conhece-te a ti mesmo, e conhecerás o universo observável que és e o Deus que há em ti contigo.`
  );

  await falar(`Vamos começar?`);

  await falar(`Instruções.`);

  await falar(
    `Quando eu abrir o microfone num bip, você poderá falar o quanto quiser.`
  );

  await falar(`Quando terminar sua fala, diga: okok.`);

  await falar(`Essa é a expressão que fecha o microfone e envia sua análise.`);

  await falar(`Depois, se quiser seguir, diga: confirma.`);

  await falar(`Se quiser refazer, diga: alinhar.`);

  await falar(`Agora, lembre-se do tema e do contexto.`);
}

// ============================
// INICIAR
// ============================

async function iniciar() {
  STATE.tema = (el("inpTema")?.value || "").trim();
  STATE.contexto = (el("inpContexto")?.value || "").trim();

  if (!STATE.tema) {
    setStatusIntro("Defina ao menos um tema para iniciar.");
    return;
  }

  setStatusIntro("Ativando ambiente...");
  logTech("início da sessão");

  const health = await window.ELAYON_TUNNEL.healthcheck();
  logTech(`healthcheck: ${JSON.stringify(health)}`);

  if (!health.mic || !health.tts || !health.stt || !health.crs) {
    throw new Error("Ambiente incompleto para iniciar a sessão");
  }

  await window.ELAYON_TUNNEL.mic.open();

  STATE.sessionId = nextSessionId();
  STATE.etapas = [];
  STATE.relatorioFinal = null;
  STATE.etapaIndex = 0;
  STATE.transcriptAtual = "";

  showScreen("telaSessao");

  await fluxoInicial();

  for (let i = 0; i < ETAPAS.length; i += 1) {
    STATE.etapaIndex = i;
    await executarEtapa(ETAPAS[i]);
  }

  await falar(`Sessão concluída. Seu relatório está pronto.`);

  await concluirSessao();
}

// ============================
// PDF
// ============================

async function gerarPdf() {
  if (!STATE.relatorioFinal?.relatorio_texto) return;
  if (!window.jspdf) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const linhas = doc.splitTextToSize(STATE.relatorioFinal.relatorio_texto, 180);
  let y = 12;

  linhas.forEach((linha) => {
    if (y > 280) {
      doc.addPage();
      y = 12;
    }
    doc.text(linha, 12, y);
    y += 7;
  });

  doc.save(`presenca-relatorio-${Date.now()}.pdf`);
}

// ============================
// RESET
// ============================

function novaSessao() {
  STATE.etapaIndex = 0;
  STATE.tema = "";
  STATE.contexto = "";
  STATE.sessionId = null;
  STATE.transcriptAtual = "";
  STATE.etapas = [];
  STATE.relatorioFinal = null;
  STATE.micBusy = false;

  setTextoVivo("");
  setStatusIntro("Aguardando início.");
  setStatusSessao("");

  const inpTema = el("inpTema");
  const inpContexto = el("inpContexto");

  if (inpTema) inpTema.value = "";
  if (inpContexto) inpContexto.value = "";

  showScreen("telaIntro");
}

// ============================
// EVENTOS
// ============================

document.addEventListener("DOMContentLoaded", () => {
  el("btnIniciar")?.addEventListener("click", async () => {
    try {
      await iniciar();
    } catch (e) {
      logTech(`erro geral: ${e.message}`);
      setStatusIntro(`Falha: ${e.message}`);
      setStatusSessao(`Falha: ${e.message}`);
      showScreen("telaIntro");
    }
  });

  el("btnGerarPdf")?.addEventListener("click", gerarPdf);
  el("btnNovaSessao")?.addEventListener("click", novaSessao);
});