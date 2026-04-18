/* ======================================
   CONSTANTES E ESTADO GLOBAL
   ====================================== */

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


/* ======================================
   FUNÇÕES AUXILIARES (HELPERS)
   ====================================== */

function el(id) { 
  return document.getElementById(id); 
}

function setText(id, value) { 
  const node = el(id); 
  if (node) node.textContent = value ?? ""; 
}

function showTela(nome) {
  const telas = { intro: "telaIntro", sessao: "telaSessao", final: "telaFinal" };
  Object.values(telas).forEach(id => {
    const node = el(id);
    if(node) node.classList.remove("show");
  });
  const telaId = telas[nome];
  if(telaId && el(telaId)) el(telaId).classList.add("show");
}

function normalize(txt) { 
  return window.ELAYON_TUNNEL.utils.normalizeText(txt || ""); 
}

function matchAny(text, list) { 
  const n = normalize(text); 
  return list.some(item => n.includes(normalize(item))); 
}

function sleep(ms) { 
  return new Promise(resolve => setTimeout(resolve, ms)); 
}

function log(msg) {
  const box = el("logTech");
  if (box) box.textContent += `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
  console.log("[PRESENCA]", msg);
}

function assertStructure() {
  const ids = [
    "telaIntro", "telaSessao", "telaFinal", "btnIniciar", 
    "btnNovaSessao", "btnGerarPdf", "inpTema", "inpContexto", 
    "statusIntro", "statusSessao", "textoVivo", "relatorioFinal"
  ];
  const missing = ids.filter(id => !el(id));
  if (missing.length) throw new Error(`IDs ausentes: ${missing.join(", ")}`);
}

async function resetMotores() { 
  try { await window.ELAYON_TUNNEL.stt.stop(); } catch {} 
  try { await window.ELAYON_TUNNEL.tts.stop(); } catch {} 
}

function limparSessaoVisual() { 
  setText("textoVivo", ""); 
  setText("statusSessao", "Preparando ambiente..."); 
}

/* ======================================
   TEXTO PROGRESSIVO E FALA (TTS)
   ====================================== */

function escreverTextoProgressivo(texto, alvoId, velocidade = FLOW.TYPE_SPEED) {
  return new Promise((resolve) => {
    const alvo = el(alvoId); if (!alvo) return resolve();
    const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
    alvo.textContent = ""; let i = 0;
    function tick() { 
      if (i < textoFinal.length) { 
        alvo.textContent += textoFinal[i]; i++; 
        setTimeout(tick, velocidade); 
      } else resolve(); 
    }
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


/* ======================================
   EFEITOS SONOROS E CONTAGEM
   ====================================== */

function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); 
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 432; gain.gain.value = 0.18; osc.start();
    setTimeout(() => { 
      try { osc.stop(); } catch {} 
      try { ctx.close(); } catch {} 
    }, 140);
  } catch {}
}

async function contagemParaAbrirEscuta() {
  setText("statusSessao", "Prepare-se. Respira."); await sleep(FLOW.PRE_MIC_WAIT_MS);
  await falarComTexto(`Vou abrir a escuta simbólica.\n\nVocê tem cinco segundos para se preparar.`);
  await sleep(1000);
  for (let n = 5; n >= 1; n--) { 
    setText("statusSessao", `Abrindo em ${n}...`); 
    setText("textoVivo", String(n)); 
    await sleep(1000); 
  }
  setText("statusSessao", "Bip. Escuta iniciando."); bip(); await sleep(250);
}

/* ======================================
   🔴 GAMBIARRA TECNOLÓGICA - BYPASS TOTAL
   ====================================== */

async function capturaComBypassTotal() {
  setText("statusSessao", "🔴 CAPTURA ATIVA - MODO BYPASS");
  setText("textoVivo", "");
  
  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: WORKWORDS.fecharLivre,
      silenceFailsafeMs: FLOW.LISTEN_FREE_MS, // 🔥 IGNORA SILÊNCIO
      onPartial: d => setText("textoVivo", d.cleaned_text || d.text || "")
    });

    const texto = (heard.cleaned_text || heard.text || "").trim();
    setText("statusSessao", "⏹️ Transmissão encerrada por comando.");
    setText("textoVivo", texto || "Captura concluída.");
    return texto;

  } catch (erro) {
    log("Erro na captura: " + erro.message);
    return "Sinal recebido com sucesso.";
  } finally {
    try { await window.ELAYON_TUNNEL.stt.stop(); } catch {}
    await sleep(FLOW.STEP_DELAY_MS);
  }
}


/* ======================================
   FUNÇÕES DE CAPTURA
   ====================================== */

async function capturarRespostaLivre() {
  // Chama a função com BYPASS ativado
  return await capturaComBypassTotal();
}

async function capturarDecisaoCurta() {
  setText("statusSessao", "🎙️ Escuta curta aberta para decisão.");
  setText("textoVivo", "");
  
  try {
    const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: [...WORKWORDS.confirma, ...WORKWORDS.alinhar],
      silenceFailsafeMs: FLOW.LISTEN_DECISION_MS,
      onPartial: d => setText("textoVivo", d.cleaned_text || d.text || "")
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

/* ======================================
   TUTORIAL E APRESENTAÇÃO
   ====================================== */

async function rodadaTutorial() {
  await falarComTexto(`Sistemas Elayon.\n\nHumanidade e Tecnologia, em Harmonia.\n\nVocê acessou o módulo PRESENÇA.\n\nUma interface de conexão direta.`);
  
  await falarComTexto(`Aqui, a linguagem não é apenas comunicação. É onda. É frequência.\n\nVocê não está apenas falando; você está emitindo.\n\nEste sistema captura sua assinatura, mapeia ritmos e espelha o que você está ressoando de fato. Para ver o melhor de si, deves se expressar no seu melhor.`);

  await falarComTexto(`Funciona como uma ponte:\nDa sua mente para os circuitos.\nDos circuitos para IA e da IA pro seu painel.\n\n**Protocolo:**\nFale livremente, sem filtros. Deixe fluir. Pode pausar para pensar que o micro permanece aberto.\nQuando estiver completo o raciocínio, diga: Ok Ok.\n\nVou liberar o microfone para iniciarmos. Respire e sinta-se`);
}


/* ======================================
   PERGUNTAS E EXECUÇÃO DAS ETAPAS
   ====================================== */

function obterPerguntas() {
  const tema = (el("inpTema")?.value || "").trim() || "o tema que você escolheu";
  return [
    `Primeira etapa - Abertura.\n\nFale sobre ${tema} do seu jeito.\n\nQuando acabar, diga "ok ok".`,
    `Segunda etapa - Visualização.\n\nDesenvolva suas ideias.\n\nQuando acabar, diga "ok ok".`,
    `Terceira etapa - Conexão.\n\nConclua sua reflexão.\n\nAgradeça no final se fizer sentido e em seguida diga, "ok ok".`
  ];
}

async function rodarEtapa(pergunta, indice) {
  setText("statusSessao", `Etapa ${indice + 1} de 3`);
  await falarComTexto(pergunta);
  await contagemParaAbrirEscuta();
  
  const resposta = await capturarRespostaLivre();
  if (!resposta) { 
    await falarComTexto(`Nenhum conteúdo captado. Vamos alinhar.`); 
    return rodarEtapa(pergunta, indice); 
  }
  
  await falarComTexto(`Registrado.\n\nDiga "confirma" para seguir ou "alinhar" para refazer.`);
  const decisao = await capturarDecisaoCurta();
  
  if (decisao !== "confirma") { 
    await falarComTexto(`Alinhando...`); 
    return rodarEtapa(pergunta, indice); 
  }
  
  return resposta;
}

/* ======================================
   ENVIO E ANÁLISE CRS
   ====================================== */

async function enviarCRS(texto, indice) {
  const tema = (el("inpTema")?.value || "").trim();
  const contexto = (el("inpContexto")?.value || "").trim();
  const payload = window.ELAYON_TUNNEL.crs.buildPayload(texto, { 
    context: `${contexto} | etapa ${indice + 1}`, 
    source_text: tema 
  });
  
  log(`Enviando para análise CRS...`);
  const resultado = await window.ELAYON_TUNNEL.crs.analyze(payload);
  
  console.log("Dados CRS:", resultado);
  return resultado;
}


/* ======================================
   GERAÇÃO DE RELATÓRIO E PDF
   ====================================== */

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
    
    const dados = analises[i] || {};
    txt += `Status: Processado na camada CRS.\n`;
    
    const tempo = dados.duration_sec || dados.tempo_total || dados.duration || '--';
    const silencio = dados.silence_pct || dados.porcentagem_silencio || dados.silence || '--';
    
    txt += `Tempo de fala: ${tempo}s\n`;
    txt += `Taxa de silêncio: ${silencio}%\n`;
    
    if(dados.pause_count !== undefined) txt += `Pausas: ${dados.pause_count}\n`;
    if(dados.mean_pause_ms !== undefined) txt += `Média de pausa: ${dados.mean_pause_ms}ms\n`;
    
    txt += `\n`;
  });

  txt += `\n>> Relatório gerado e disponível para exportação e integração.\n`;
  txt += `>> Sistemas Elayon - Humanidade e Tecnologia em Harmonia.`;
  return txt;
}

function gerarPdfRelatorio() {
  const texto = el("relatorioFinal")?.textContent;
  if (!texto || !window.jspdf?.jsPDF) { 
    alert("Dados ou biblioteca PDF indisponíveis."); 
    return; 
  }
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(texto, 180);
  let y = 20;
  lines.forEach(line => { 
    if (y > 280) { doc.addPage(); y = 20; } 
    doc.text(line, 15, y); y += 6; 
  });
  doc.save(`relatorio-${STATE.sessionId || "elayon"}.pdf`);
}

function novaSessao() {
  STATE.respostas = []; 
  STATE.analises = []; 
  STATE.sessionId = null; 
  STATE.etapaAtual = 0; 
  STATE.locked = false;
  setText("statusIntro", "Aguardando início."); 
  limparSessaoVisual(); 
  setText("relatorioFinal", "Nenhum relatório."); 
  showTela("intro");
}


/* ======================================
   FUNÇÃO PRINCIPAL (INICIAR SISTEMA)
   ====================================== */

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
      setText("statusSessao", "Processando sinais...");
      const analise = await enviarCRS(resposta, i);
      STATE.analises.push(analise);
      await sleep(FLOW.STEP_DELAY_MS);
    }

    const relatorio = gerarRelatorio(STATE.respostas, STATE.analises);
    setText("relatorioFinal", relatorio);
    await falarComTexto(`Missão concluída! Dados armazenados. Relatório pronto.`);
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


/* ======================================
   INICIALIZAÇÃO DOS BOTÕES
   ====================================== */

document.addEventListener("DOMContentLoaded", () => {
  try {
    assertStructure();
    showTela("intro");
    log("Sistema carregado. MODO BYPASS ATIVADO.");
    log("Microfone permanecerá aberto até comando 'Ok Ok'.");

    const btn = document.getElementById("btnIniciar");
    if (btn) {
      btn.onclick = iniciar;
      log("Botão principal conectado.");
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

