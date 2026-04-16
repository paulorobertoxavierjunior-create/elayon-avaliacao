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
    source_text: etapa.pergunta({ tema: STATE.tema