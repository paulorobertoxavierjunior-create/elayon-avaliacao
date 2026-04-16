const WORKWORDS = {
  abrir: "responder",
  fechar: "ok ok",
  confirmar: "confirma",
  alinhar: "alinhar"
};

const ETAPAS = [
  {
    id: 1,
    titulo: "Abertura",
    instrucao: ({ tema }) =>
      `Vamos começar. Quando eu disser a palavra responder, aguarde o microfone abrir. Depois fale sobre ${tema || "o tema que você escolheu"} do jeito mais natural possível. Quando terminar, diga ok ok.`
  },
  {
    id: 2,
    titulo: "Continuidade",
    instrucao: () =>
      `Agora aprofunde um pouco mais. Dentro do que você trouxe, o que merece mais atenção neste momento? Quando terminar, diga ok ok.`
  },
  {
    id: 3,
    titulo: "Consolidação",
    instrucao: () =>
      `Para concluir, diga qual é o próximo passo mais honesto para você agora. Quando terminar, diga ok ok.`
  }
];

const STATE = {
  mode: "idle", // idle | ativando | ia_falando | aguardando_abrir | ouvindo | aguardando_decisao | processando | finalizado
  etapaIndex: 0,
  tema: "",
  contexto: "",
  transcriptAtual: "",
  transcriptParcial: "",
  etapas: [],
  micHabilitado: false,
  ultimoRelatorio: null,
  sessionId: null
};

const el = (id) => document.getElementById(id);

function logTech(msg) {
  const box = el("logTech");
  if (!box) return;
  const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`;
  box.textContent += `${line}\n`;
}

function setStatusIntro(txt) {
  const node = el("statusIntro");
  if (node) node.textContent = txt;
}

function setStatusSessao(txt) {
  const node = el("statusSessao");
  if (node) node.textContent = txt;
}

function setTextoVivo(txt, cursor = false) {
  const node = el("textoVivo");
  if (!node) return;
  node.innerHTML = "";
  node.textContent = txt || "";
  if (cursor) {
    const c = document.createElement("span");
    c.className = "cursor";
    node.appendChild(c);
  }
}

function showScreen(screenId) {
  ["telaIntro", "telaSessao", "telaFinal"].forEach((id) => {
    el(id)?.classList.remove("show");
  });
  el(screenId)?.classList.add("show");
}

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWorkwords(txt) {
  let t = txt || "";
  [WORKWORDS.abrir, WORKWORDS.fechar, WORKWORDS.confirmar, WORKWORDS.alinhar].forEach((w) => {
    const re = new RegExp(w, "gi");
    t = t.replace(re, " ");
  });
  return t.replace(/\s+/g, " ").trim();
}

function nextSessionId() {
  return `elayon-${Date.now()}`;
}

function buildSessionSnapshot() {
  return {
    session_id: STATE.sessionId,
    timestamp: new Date().toISOString(),
    tema: STATE.tema,
    contexto: STATE.contexto,
    etapas: STATE.etapas,
    relatorio_final: STATE.ultimoRelatorio
  };
}

async function speakProgressive(text) {
  STATE.mode = "ia_falando";
  setTextoVivo("");
  setStatusSessao("A IA está conduzindo a sessão.");

  const target = el("textoVivo");
  const writing = new Promise((resolve) => {
    if (!target) return resolve();

    let i = 0;
    target.textContent = "";
    function tick() {
      if (i < text.length) {
        target.textContent += text[i];
        i += 1;
        setTimeout(tick, 55);
      } else {
        resolve();
      }
    }
    tick();
  });

  const speaking = window.ELAYON_TUNNEL.tts.speak(text);
  await Promise.allSettled([writing, speaking]);
}

async function healthcheck() {
  const health = await window.ELAYON_TUNNEL.healthcheck();
  logTech(`healthcheck: ${JSON.stringify(health)}`);
  return health;
}

async function ativarSistema() {
  STATE.mode = "ativando";
  setStatusIntro("Ativando microfone e verificando conexão...");
  logTech("ativando sistema");

  const health = await healthcheck();
  if (!health.crs) throw new Error("CRS indisponível");
  if (!health.mic) throw new Error("Microfone indisponível");
  if (!health.tts) throw new Error("TTS indisponível");
  if (!health.stt) throw new Error("STT indisponível");

  await window.ELAYON_TUNNEL.mic.open();
  STATE.micHabilitado = true;
  logTech("microfone habilitado pelo usuário");
}

async function waitForOpenCommand() {
  STATE.mode = "aguardando_abrir";
  setStatusSessao(`Aguardando o comando "${WORKWORDS.abrir}".`);
  setTextoVivo("");

  while (true) {
    const heard = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 2200 });
    const txt = normalizeText(heard?.text || "");
    logTech(`aguardando abrir | ouvido: ${txt}`);
    if (txt.includes(WORKWORDS.abrir)) return true;
  }
}

async function captureSpeechUntilClose() {
  STATE.mode = "ouvindo";
  STATE.transcriptAtual = "";
  STATE.transcriptParcial = "";
  setStatusSessao("Microfone aberto. Fale no seu tempo. Para encerrar, diga “ok ok”.");
  setTextoVivo("", true);

  const heard = await window.ELAYON_TUNNEL.stt.listenOnce({
    silenceMs: 10000,
    onPartial: (data) => {
      const raw = data?.text || "";
      STATE.transcriptParcial = raw;
      const clean = stripWorkwords(raw);
      setTextoVivo(clean, true);
    }
  });

  const bruto = heard?.final?.trim() ? heard.final.trim() : (heard?.text || "").trim();
  const limpo = stripWorkwords(bruto);

  STATE.transcriptAtual = limpo;
  setTextoVivo(limpo || "Sem fala consolidada.");
  setStatusSessao("Captação encerrada.");
  logTech(`fala consolidada: ${limpo}`);

  return limpo;
}

async function waitDecision() {
  STATE.mode = "aguardando_decisao";
  setStatusSessao(`Diga "${WORKWORDS.confirmar}" ou "${WORKWORDS.alinhar}". Depois diga "${WORKWORDS.fechar}".`);
  await speakProgressive(`Se quiser seguir, diga ${WORKWORDS.confirmar}. Se quiser refazer, diga ${WORKWORDS.alinhar}. Depois diga ${WORKWORDS.fechar}.`);

  let decision = null;
  while (!decision) {
    const heard = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 2200 });
    const txt = normalizeText(heard?.text || "");
    logTech(`decisão | ouvido: ${txt}`);

    if (txt.includes(WORKWORDS.confirmar)) decision = WORKWORDS.confirmar;
    if (txt.includes(WORKWORDS.alinhar)) decision = WORKWORDS.alinhar;
  }

  while (true) {
    const heard = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs: 2200 });
    const txt = normalizeText(heard?.text || "");
    logTech(`fechando decisão | ouvido: ${txt}`);
    if (txt.includes(WORKWORDS.fechar)) break;
  }

  return decision;
}

function buildPayload(texto, etapa) {
  return window.ELAYON_TUNNEL.crs.buildPayload(texto, {
    context: `${STATE.contexto} | etapa ${etapa.id} | tema ${STATE.tema}`,
    source_text: etapa.instrucao({ tema: STATE.tema, contexto: STATE.contexto })
  });
}

function buildFinalReport(snapshot) {
  const linhas = [];
  linhas.push(`ELAYON • RELATÓRIO DE SESSÃO`);
  linhas.push(``);
  linhas.push(`Sessão: ${snapshot.session_id}`);
  linhas.push(`Data: ${new Date(snapshot.timestamp).toLocaleString("pt-BR")}`);
  linhas.push(`Tema: ${snapshot.tema || "não definido"}`);
  linhas.push(`Contexto: ${snapshot.contexto || "não definido"}`);
  linhas.push(``);
  snapshot.etapas.forEach((et) => {
    linhas.push(`Etapa ${et.etapa} — ${et.titulo}`);
    linhas.push(`Transcrição: ${et.transcricao || "sem conteúdo"}`);
    linhas.push(`Heurística CRS: ${et.analysis?.heuristica || "sem heurística"}`);
    linhas.push(`Resumo CRS: ${et.analysis?.user_report?.summary || "sem resumo"}`);
    linhas.push(``);
  });
  return linhas.join("\n");
}

async function runEtapa(etapa) {
  const instrucao = etapa.instrucao({ tema: STATE.tema, contexto: STATE.contexto });
  await speakProgressive(instrucao);
  await speakProgressive(`Quando estiver pronto, diga ${WORKWORDS.abrir}.`);

  await waitForOpenCommand();

  await speakProgressive(`Microfone aberto.`);
  const texto = await captureSpeechUntilClose();

  const decisao = await waitDecision();

  if (decisao === WORKWORDS.alinhar) {
    await speakProgressive(`Tudo bem. Vamos alinhar.`);
    return runEtapa(etapa);
  }

  STATE.mode = "processando";
  setStatusSessao("Processando cálculo e consolidando resultado.");
  await speakProgressive(`Processando.`);

  const payload = buildPayload(texto, etapa);
  const analysis = await window.ELAYON_TUNNEL.crs.analyze(payload);
  logTech(`crs etapa ${etapa.id}: ${JSON.stringify(analysis)}`);

  STATE.etapas.push({
    etapa: etapa.id,
    titulo: etapa.titulo,
    instrucao,
    transcricao: texto,
    payload,
    analysis
  });
}

async function concluirSessao() {
  const snapshot = buildSessionSnapshot();
  const relatorioTexto = buildFinalReport(snapshot);

  STATE.ultimoRelatorio = {
    ...snapshot,
    relatorio_texto: relatorioTexto
  };

  salvarSessao(snapshot);
  salvarRelatorio(STATE.ultimoRelatorio);

  el("relatorioFinal").textContent = relatorioTexto;
  showScreen("telaFinal");
  STATE.mode = "finalizado";
}

async function iniciarFluxo() {
  STATE.tema = (el("inpTema")?.value || "").trim();
  STATE.contexto = (el("inpContexto")?.value || "").trim();

  if (!STATE.tema) {
    setStatusIntro("Defina ao menos um tema para iniciar.");
    return;
  }

  STATE.sessionId = nextSessionId();
  STATE.etapas = [];
  STATE.ultimoRelatorio = null;

  await ativarSistema();

  showScreen("telaSessao");
  await speakProgressive(`Vamos aprender como funciona o sistema de interação.`);
  await speakProgressive(`Eu, a IA, vou dizer a palavra responder e vou abrir o microfone. Preste atenção. Depois da sua fala, diga ok ok.`);

  for (let i = 0; i < ETAPAS.length; i += 1) {
    STATE.etapaIndex = i;
    await runEtapa(ETAPAS[i]);
  }

  await speakProgressive(`Sessão concluída. Seu relatório está pronto.`);
  await concluirSessao();
}

async function gerarPdf() {
  if (!STATE.ultimoRelatorio?.relatorio_texto) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margemX = 12;
  let y = 12;

  const linhas = doc.splitTextToSize(STATE.ultimoRelatorio.relatorio_texto, 180);
  linhas.forEach((linha) => {
    if (y > 280) {
      doc.addPage();
      y = 12;
    }
    doc.text(linha, margemX, y);
    y += 7;
  });

  doc.save(`elayon-relatorio-${Date.now()}.pdf`);
}

function resetToIntro() {
  STATE.mode = "idle";
  STATE.etapaIndex = 0;
  STATE.transcriptAtual = "";
  STATE.transcriptParcial = "";
  STATE.etapas = [];
  STATE.ultimoRelatorio = null;
  STATE.sessionId = null;
  setTextoVivo("");
  setStatusIntro("Aguardando início.");
  showScreen("telaIntro");
}

document.addEventListener("DOMContentLoaded", () => {
  el("btnIniciar")?.addEventListener("click", async () => {
    try {
      await iniciarFluxo();
    } catch (e) {
      logTech(`erro geral: ${e.message}`);
      setStatusIntro(`Falha ao iniciar: ${e.message}`);
      setStatusSessao(`Falha: ${e.message}`);
      showScreen("telaIntro");
    }
  });

  el("btnGerarPdf")?.addEventListener("click", gerarPdf);
  el("btnNovaSessao")?.addEventListener("click", resetToIntro);
});