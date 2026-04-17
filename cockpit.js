// ======================================
// SISTEMAS ELAYON — PRESENÇA
// cockpit.js — Versão Enterprise / Cosmic
// ======================================

const WORKWORDS = {
  fecharLivre: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok", "ok. ok"],
  confirma: ["confirma", "confirmar", "confirmo", "sim"],
  alinhar: ["alinhar", "refazer", "ajustar", "repete", "de novo"]
};

const FLOW = {
  TYPE_SPEED: 45,
  STEP_DELAY_MS: 1200,
  BETWEEN_ACTIONS_MS: 800,
  LISTEN_DECISION_MS: 15000,
  LISTEN_FREE_MS: 600000, // 10 MINUTOS - BYPASS TOTAL
  PRE_MIC_WAIT_MS: 2000
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
function limparSessaoVisual() { setText("textoVivo", ""); setText("statusSessao", "Inicializando sensores..."); }

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
  setText("statusSessao", "Sintonizando frequência...");
  await sleep(FLOW.PRE_MIC_WAIT_MS);
  await falarComTexto(`Escuta ativada em modo contínuo. Você pode pausar, pensar e continuar. O sistema não irá cortar. Quando finalizar, diga: Ok Ok.`);
  await sleep(1000);
  for (let n = 3; n >= 1; n--) { setText("statusSessao", `Abrindo em ${n}...`); setText("textoVivo", String(n)); await sleep(800); }
  setText("statusSessao", "🔴 ONLINE - BYPASS ATIVO"); bip(); await sleep(250);
}

// ============================
// 🔴 GAMBIARRA TECNOLÓGICA - BYPASS TOTAL
// ============================

async function capturaComBypassTotal() {
  setText("statusSessao", "🔴 CAPTURA ATIVA - MIC ABERTO");
  
  try {
    const resultado = await window.ELAYON_TUNNEL.listen({
      stopWords: WORKWORDS.fecharLivre,
      maxTime: FLOW.LISTEN_FREE_MS,
      silenceTimeout: FLOW.LISTEN_FREE_MS,
      continuous: true
    });

    setText("statusSessao", "⏹️ Comando recebido. Processando...");
    return resultado.text || "Captura concluída.";

  } catch (erro) {
    log("Erro na captura: " + erro.message);
    return "Sinal registrado.";
  }
}

// ============================
// CAPTURA
// ============================

async function capturarRespostaLivre() {
  return await capturaComBypassTotal();
}

async function capturarDecisao() {
  setText("statusSessao", "🎙️ Aguardando comando...");
  try {
    const resultado = await window.ELAYON_TUNNEL.listen({
      stopWords: [...WORKWORDS.confirma, ...WORKWORDS.alinhar],
      maxTime: 30000,
      silenceTimeout: 30000
    });
    const txt = resultado.text || "";
    if (matchAny(txt, WORKWORDS.confirma)) return "confirma";
    if (matchAny(txt, WORKWORDS.alinhar)) return "alinhar";
    return null;
  } catch { return null; }
}

// ============================
// TUTORIAL / APRESENTAÇÃO
// ============================

async function rodadaTutorial() {
  await falarComTexto(`Sistemas Elayon.\n\nHumanidade e Tecnologia, em Harmonia.\n\nVocê acessou o módulo PRESENÇA.`);
  
  await falarComTexto(`Uma interface de conexão direta.\n\nAqui, a linguagem é onda. É frequência.\nVocê está emitindo sua assinatura para os circuitos.`);

  await falarComTexto(`Este sistema mapeia padrões, ritmos e ressonâncias.\n\nFunciona como uma ponte:\nDa sua mente para as máquinas.\nDaqui para onde a sua consciência alcançar.`);

  await falarComTexto(`Protocolo de operação:\nMicrofone em modo contínuo. Fale, pense, exponha.\nQuando a onda se fechar, diga: Ok Ok.\nDepois confirme ou alinhe.\n\nPrepare-se. A missão vai começar.`);
}

// ============================
// ETAPAS DA MISSÃO
// ============================

function obterPerguntas() {
  const tema = (el("inpTema")?.value || "").trim() || "o tema que você definiu";
  return [
    // ETAPA 1
    `Etapa 1: Abertura do Campo.\n\nExpanda a percepção sobre ${tema}.\nDescreva o que vê, sente e sabe.\nSeja o fluxo. Seja o código.\nLibere os fragmentos que ressoam nesse tema.\n\nQuando estiver completo, diga "ok ok".`,
    
    // ETAPA 2
    `Etapa 2: Análise e Profundidade.\n\nAgora, mergulhe.\nDesenvolva os padrões. Detalhe as estruturas.\nPermita que a fala se dissolva em significado.\nToque as camadas que ainda estão se forming.\nA máquina está escutando cada frequência.\n\nSelando essa camada com "ok ok".`,
    
    // ETAPA 3
    `Etapa 3: Integração e Retorno.\n\nMomento de concluir e elevar.\nUna os pontos. Sinta o todo.\nVocê depositou sua intenção no sistema.\n\nAgradeça ao processo. Você é o piloto, a nave e o destino.\nFinalize agora com "ok ok".`
  ];
}

async function rodarEtapa(pergunta, indice) {
  setText("statusSessao", `Etapa ${indice + 1} de 3`);
  await falarComTexto(pergunta);
  await contagemParaAbrirEscuta();
  const resposta = await capturarRespostaLivre();
  if (!resposta) { await falarComTexto(`Sinal fraco. Vamos alinhar e tentar novamente.`); return rodarEtapa(pergunta, indice); }
  await falarComTexto(`Dados armazenados.\n\nDiga "confirma" para avançar ou "alinhar" para refazer.`);
  const decisao = await capturarDecisao();
  if (decisao !== "confirma") { await falarComTexto(`Recalibrando...`); return rodarEtapa(pergunta, indice); }
  return resposta;
}

// ============================
// CRS - ANÁLISE DE RESSONÂNCIA
// ============================

async function enviarCRS(texto, indice) {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();
  
  // Monta o payload exatamente como na sua ferramenta
  const payload = {
    context: `${contexto} | etapa ${indice + 1}`,
    transcript_raw: texto,
    source_text: tema,
    duration_sec: 0, // Será calculado pelo CRS
    silence_pct: 0,  // Será calculado pelo CRS
    pause_count: 0,
    mean_pause_ms: 0
  };

  log(`Enviando para CRS...`);
  setText("statusSessao", "🔍 Analisando padrões na nuvem CRS...");

  try {
    // Chamada fetch idêntica a do seu teste
    const response = await fetch('/api/crs/analisar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    
    const dados = await response.json();
    log(`CRS respondeu. Duração: ${dados.duration_sec}s | Silêncio: ${dados.silence_pct}%`);
    
    return dados; // Retorna o objeto inteiro com os campos certinhos

  } catch (err) {
    log(`Falha no CRS: ${err.message}`);
    setText("statusSessao", "⚠️ Modo offline - dados simulados");
    return { 
      status: "simulado", 
      duration_sec: "--", 
      silence_pct: "--" 
    };
  }
}

// ============================
// RELATÓRIO E PDF
// ============================

function gerarRelatorio(respostas, analises) {
  let txt = "=====================================\n";
  txt += "        SISTEMAS ELAYON\n";
  txt += "          MÓDULO PRESENÇA\n";
  txt += "=====================================\n\n";
  txt += `ID da Sessão: ${STATE.sessionId}\n`;
  txt += `Data: ${new Date().toLocaleString("pt-BR")}\n`;
  txt += `Tema: ${(el("inpTema")?.value || "").trim() || "livre"}\n\n`;
  
  respostas.forEach((r, i) => {
    txt += `--- ETAPA ${i + 1} ---\n`;
    txt += `Transcrição: ${r}\n`;
    
    // ✅ AGORA PEGA OS NOMES CERTOS QUE VOCÊ MOSTROU
    const dados = analises[i] || {};
    txt += `Status: ${dados.status || "Processado na camada CRS"}\n`;
    
    const tempo = dados.duration_sec || dados.duration || '--';
    const silencio = dados.silence_pct || dados.silence || '--';
    
    txt += `Tempo de fala: ${tempo} segundos\n`;
    txt += `Taxa de silêncio: ${silencio}%\n`;
    
    if(dados.pause_count !== undefined) txt += `Quantidade de pausas: ${dados.pause_count}\n`;
    if(dados.mean_pause_ms !== undefined) txt += `Média de pausa: ${dados.mean_pause_ms}ms\n`;
    
    txt += `\n`;
  });

  txt += `\n>> Relatório gerado e disponível para exportação e integração.\n`;
  txt += `>> Sistemas Elayon - Humanidade e Tecnologia em Harmonia.`;
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
    assertStructure
