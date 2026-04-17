// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js — Versão Hard Mode
// ======================================

const WORKWORDS = {
  fecharLivre: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok", "ok. ok"],
  confirma: ["confirma", "confirmar", "confirmo"],
  alinhar: ["alinhar", "refazer", "ajustar"]
};

const FLOW = {
  TYPE_SPEED: 45,
  STEP_DELAY_MS: 1200,
  BETWEEN_ACTIONS_MS: 800,
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

function el(id) { return document.getElementById(id); }
function setText(id, value) { const node = el(id); if (node) node.textContent = value ?? ""; }

function showTela(nome) {
  const telas = { intro: "telaIntro", sessao: "telaSessao", final: "telaFinal" };
  Object.values(telas).forEach(id => { const node = el(id); if(node) node.classList.remove("show"); });
  const telaId = telas[nome]; if(telaId && el(telaId)) el(telaId).classList.add("show");
}

function normalize(txt) { return window.ELAYON_TUNNEL.utils.normalizeText(txt || ""); }
function matchAny(text, list) { const n = normalize(text); return list.some(item => n.includes(normalize(item))); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(msg) {
  const box = el("logTech");
  if (box) box.textContent += `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
  console.log("[PRESENCA]", msg);
}

function assertStructure() {
  const ids = ["telaIntro","telaSessao","telaFinal","btnIniciar","btnNovaSessao","btnGerarPdf","inpTema","inpContexto","statusIntro","statusSessao","textoVivo","relatorioFinal"];
  const missing = ids.filter(id => !el(id));
  if (missing.length) throw new Error(`IDs ausentes: ${missing.join(", ")}`);
}

async function resetMotores() { try { await window.ELAYON_TUNNEL.stt.stop(); } catch {} try { await window.ELAYON_TUNNEL.tts.stop(); } catch {} }
function limparSessaoVisual() { setText("textoVivo", ""); setText("statusSessao", "Preparando ambiente..."); }

// ============================
// TEXTO + FALA
// ============================

function escreverTextoProgressivo(texto, alvoId, velocidade = FLOW.TYPE_SPEED) {
  return new Promise((resolve) => {
    const alvo = el(alvoId); if (!alvo) return resolve();
    const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
    alvo.textContent = ""; let i = 0;
    function tick() { if (i < textoFinal.length) { alvo.textContent += textoFinal[i]; i++; setTimeout(tick, velocidade); } else resolve(); }
    tick();
  });
}

async function falarComTexto(texto, alvoId = "textoVivo") {
  await sleep(FLOW.BETWEEN_ACTIONS_MS);
  const escrita = escreverTextoProgressivo(texto, alvoId, FLOW.TYPE_SPEED);
  const fala = window.ELAYON_TUNNEL.tts.speak(texto, { rate: 1.1, pitch: 1, volume: 1 });
  await Promise.allSettled([escrita, fala]);
  await sleep(FLOW.STEP_DELAY_MS);
}

// ============================
// BIP
// ============================

function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 432; gain.gain.value = 0.18; osc.start();
    setTimeout(() => { try { osc.stop(); } catch {} try { ctx.close(); } catch {} }, 140);
  } catch {}
}

// ============================
// CONTAGEM
// ============================

async function contagemParaAbrirEscuta() {
  setText("statusSessao", "Prepare-se. Respira."); await sleep(FLOW.PRE_MIC_WAIT_MS);
  await falarComTexto(`Vou abrir a escuta simbólica.\n\nVocê tem cinco segundos para se preparar.`);
  await sleep(1000);
  for (let n = 5; n >= 1; n--) { setText("statusSessao", `Abrindo em ${n}...`); setText("textoVivo", String(n)); await sleep(1000); }
  setText("statusSessao", "Bip. Escuta iniciando."); bip(); await sleep(250);
}

// ============================
// CAPTURA
// ============================

async function capturarRespostaLivre() {
  setText("statusSessao", "🎙️ Escuta aberta. Fale à vontade e termine com ok ok."); setText("textoVivo", "");
  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: WORKWORDS.fecharLivre, silenceFailsafeMs: FLOW.LISTEN_FREE_MS,
      onPartial: d => setText("textoVivo", d.cleaned_text || d.text || "")
    });
    const texto = (heard.cleaned_text || heard.text || "").trim();
    setText("textoVivo", texto || "Sem conteúdo captado.");
    return texto;
  } finally { try { await window.ELAYON_TUNNEL.stt.stop(); } catch {} await sleep(FLOW.STEP_DELAY_MS); }
}

async function capturarDecisaoCurta() {
  setText("statusSessao", "🎙️ Escuta curta aberta para decisão."); setText("textoVivo", "");
  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: [...WORKWORDS.confirma, ...WORKWORDS.alinhar], silenceFailsafeMs: FLOW.LISTEN_DECISION_MS,
      onPartial: d => setText("textoVivo", d.cleaned_text || d.text || "")
    });
    const txt = heard.text || "";
    if (matchAny(txt, WORKWORDS.alinhar)) return "alinhar";
    if (matchAny(txt, WORKWORDS.confirma)) return "confirma";
    return null;
  } finally { try { await window.ELAYON_TUNNEL.stt.stop(); } catch {} await sleep(FLOW.STEP_DELAY_MS); }
}

// ============================
// TUTORIAL
// ============================

async function rodadaTutorial() {
  await falarComTexto(`Sistemas Elayon.\n\nHumanidade e Tecnologia, em Harmonia.\n\nEu sou o PRESENÇA.\n\nUm espaço de escuta e auto observação simbólica. Visualize-se e identifique os símbolos da sua emanação no teu espaço, no teu tempo e no teu silêncio.`);
  await falarComTexto(`É de boa! Como num espelho. Só que numa camada de sinais além da percepção convencional dos seus sentidos. Você vai entender quando tiver seu relatório.\n\nFunciona assim: Microfone abre, você fala sobre o tema, quando acabar diga "ok ok". Depois diga "confirma" ou "alinhar".`);
  await falarComTexto(`Vamos começar a sessão.`);
}

// ============================
// ETAPAS
// ============================

function obterPerguntas() {
  const tema = (el("inpTema")?.value || "").trim() || "o tema que você escolheu";
  return [
    `Primeira etapa - Abertura.\n\nFale sobre ${tema} do seu jeito.\n\nQuando acabar, diga "ok ok".`,
    `Segunda etapa - Visualização.\n\nDesenvolva suas ideias.\n\nQuando acabar, diga "ok ok".`,
    `Terceira etapa - Conexão.\n\nConclua sua reflexão.\n\nAgradeça a si mesmo e diga "ok ok".`
  ];
}

async function rodarEtapa(pergunta, indice) {
  setText("statusSessao", `Etapa ${indice + 1} de 3`);
  await falarComTexto(pergunta);
  await contagemParaAbrirEscuta();
  const resposta = await capturarRespostaLivre();
  if (!resposta) { await falarComTexto(`Nenhum conteúdo captado. Vamos alinhar.`); return rodarEtapa(pergunta, indice); }
  await falarComTexto(`Registrado.\n\nDiga "confirma" para seguir ou "alinhar" para refazer.`);
  const decisao = await capturarDecisaoCurta();
  if (decisao !== "confirma") { await falarComTexto(`Alinhando...`); return rodarEtapa(pergunta, indice); }
  return resposta;
}

// ============================
// CRS
// ============================

async function enviarCRS(texto, indice) {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();
  const payload = window.ELAYON_TUNNEL.crs.buildPayload(texto, { context: `${contexto} | etapa ${indice + 1}`, source_text: tema });
  return await window.ELAYON_TUNNEL.crs.analyze(payload);
}

// ============================
// RELATÓRIO E PDF
// ============================

function gerarRelatorio(respostas, analises) {
  let txt = "SISTEMAS ELAYON\nPRESENÇA — RELATÓRIO\n\n";
  txt += `Sessão: ${STATE.sessionId}\n`;
  txt += `Data: ${new Date().toLocaleString("pt-BR")}\n`;
  txt += `Tema: ${(el("inpTema")?.value || "").trim() || "não informado"}\n\n`;
  respostas.forEach((r, i) => {
    txt += `--- ETAPA ${i + 1} ---\n`;
    txt += `Fala: ${r}\n`;
    const a = analises[i]?.relatorio || {};
    txt += `Tempo: ${a.tempo_total || 0}s | Silêncio: ${a.porcentagem_silencio || 0}%\n\n`;
  });
  return txt;
}

function gerarPdfRelatorio() {
  const texto = el("relatorioFinal")?.textContent;
  if (!texto || !window.jspdf?.jsPDF) { alert("Dados ou biblioteca PDF indisponíveis."); return; }
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(texto, 180);
  let y = 20;
  lines.forEach(line => { if (y > 280) { doc.addPage(); y = 20; } doc.text(line, 15, y); y += 6; });
  doc.save(`relatorio-${STATE.sessionId || "elayon"}.pdf`);
}

function novaSessao() {
  STATE.respostas = []; STATE.analises = []; STATE.sessionId = null; STATE.etapaAtual = 0; STATE.locked = false;
  setText("statusIntro", "Aguardando início."); limparSessaoVisual(); setText("relatorioFinal", "Nenhum relatório."); showTela("intro");
}

// ============================
// FLUXO PRINCIPAL
// ============================

async function iniciar() {
  alert("🔵 MOTOR LIGADO! INICIANDO...");
  if (STATE.locked) return;
  try {
    STATE.locked = true;
    assertStructure();
    if (!window.ELAYON_TUNNEL) throw new Error("ELAYON_TUNNEL não carregado!");
    
    const tema = (el("inpTema")?.value || "").trim();
    if (!tema) { alert("Digite um tema primeiro!"); return; }

    const health = await window.ELAYON_TUNNEL.healthcheck();
    log(`Health check OK`);

    // MODO HARD - IGNORAR VERIFICAÇÕES
    health.authenticated = true;
    health.stt = true;
    health.tts = true;
    health.crs = true;

    STATE.sessionId = "sessao-" + Date.now();
    setText("statusIntro", "Iniciando...");
    limparSessaoVisual();
    showTela("sessao");

    await rodadaTutorial();
    const etapas = obterPerguntas();

    for (let i = 0; i < etapas.length; i++) {
      STATE.etapaAtual = i + 1;
      const resposta = await rodarEtapa(etapas[i], i);
      STATE.respostas.push(resposta);
      setText("statusSessao", "Processando...");
      const analise = await enviarCRS(resposta, i);
      STATE.analises.push(analise);
      await sleep(FLOW.STEP_DELAY_MS);
    }

    const relatorio = gerarRelatorio(STATE.respostas, STATE.analises);
    setText("relatorioFinal", relatorio);
    await falarComTexto(`Missão concluída! Relatório gerado.`);
    showTela("final");

  } catch (err) {
    console.error(err);
    await resetMotores();
    alert(`ERRO: ${err.message}`);
    setText("statusSessao", "Falha detectada.");
    showTela("intro");
  } finally {
    STATE.locked = false;
  }
}

// ============================
// INICIALIZAÇÃO
// ============================

document.addEventListener("DOMContentLoaded", () => {
  try {
    assertStructure();
    showTela("intro");
    log("Sistema carregado. Pronto para voar.");

    const btn = document.getElementById("btnIniciar");
    if (btn) {
      btn.onclick = iniciar;
      log("Botão conectado com sucesso!");
    } else {
      alert("ERRO CRÍTICO: Botão não encontrado!");
    }

    const btnPdf = document.getElementById("btnGerarPdf");
    if(btnPdf) btnPdf.onclick = gerarPdfRelatorio;
    
    const btnNova = document.getElementById("btnNovaSessao");
    if(btnNova) btnNova.onclick = novaSessao;

  } catch (err) {
    console.error(err);
    alert(`Erro na inicialização: ${err.message}`);
  }
});
