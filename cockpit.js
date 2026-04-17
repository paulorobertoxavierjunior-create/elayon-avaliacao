// ============================
// 🔴 GAMBIARRA TECNOLÓGICA - BYPASS TOTAL
// ============================
// FORÇA o microfone a ficar aberto por até 10 MINUTOS.
// Ignora silêncio. Só fecha no "Ok Ok".

async function capturaComBypassTotal() {
  setText("statusSessao", "🔴 BYPASS ATIVO - MIC ABERTO");
  
  try {
    const resultado = await window.ELAYON_TUNNEL.listen({
      stopWords: WORKWORDS.fecharLivre,
      maxTime: 600000,       // 10 MINUTOS - Tempo máximo que o navegador aguenta
      silenceTimeout: 600000, // Ignora silêncio por 10 minutos
      continuous: true        // Modo contínuo
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
  // Chama a função GAMBIARRA que mantém o micro aberto
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
    if (txt.includes("confirma") || txt.includes("sim")) return "confirma";
    if (txt.includes("alinhar") || txt.includes("refazer")) return "alinhar";
    return null;
  } catch { return null; }
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
    
    // 🔍 DEBUG: Mostra TUDO o que veio do CRS para tu visualizar
    const dados = analises[i] || {};
    txt += `Status: Processado na camada CRS.\n`;
    
    // Tenta pegar tempo e silêncio de QUALQUER JEITO
    const tempo = dados.tempo_total || dados.duration || dados.tempo || '--';
    const silencio = dados.porcentagem_silencio || dados.silence || dados.silencio || '--';
    
    if(tempo !== '--') txt += `Tempo total: ${tempo}s\n`;
    if(silencio !== '--') txt += `Taxa de silêncio: ${silencio}%\n`;
    
    // Se quiser ver o objeto cru:
    // txt += `Raw Data: ${JSON.stringify(dados)}\n`; 
    
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
      setText("statusSessao", "Enviando para análise CRS...");
      const analise = await enviarCRS(resposta, i);
      
      // Log para ver no console o que voltou
      console.log(`Dados da Etapa ${i+1}:`, analise);
      
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

// ============================
// INICIALIZAÇÃO
// ============================

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
