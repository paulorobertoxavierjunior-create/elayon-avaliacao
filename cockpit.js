const TESTES = [
  {
    titulo: "Etapa 1 • Início da avaliação",
    subtitulo: "A IA se apresenta e pede confirmação simples para começar.",
    instrucao: "Bom dia. Tudo bem para começarmos? Quando ouvir o bip, responda. Ao terminar, fique três segundos em silêncio.",
    texto: "",
    tipo: "resposta_curta"
  },
  {
    titulo: "Etapa 2 • Leitura guiada",
    subtitulo: "O usuário lê um texto curto com clareza e calma.",
    instrucao: "Agora leia o texto abaixo. Ao terminar, fique três segundos em silêncio e avançaremos para o próximo estágio.",
    texto: "Eu estou presente, consciente do meu tempo e disposto a seguir com atenção.",
    tipo: "leitura"
  },
  {
    titulo: "Etapa 3 • Contagem e identificação",
    subtitulo: "O usuário conta de um a dez e no final diz seu nome completo.",
    instrucao: "Agora conte de um até dez. No final, diga o seu nome completo. Depois, fique três segundos em silêncio.",
    texto: "",
    tipo: "contagem"
  }
];

const HEURISTICA = {
  presenca: {
    alta: "Boa ancoragem inicial e chegada consistente ao processo.",
    baixa: "Baixa ancoragem inicial. Vale fortalecer a chegada antes de avançar."
  },
  clareza: {
    alta: "Boa nitidez de expressão e organização da fala.",
    baixa: "A clareza ficou reduzida. Pode ser útil repetir com mais calma."
  },
  ritmo: {
    alta: "Ritmo equilibrado e progressão temporal adequada.",
    baixa: "Ritmo irregular com oscilação na sustentação da fala."
  },
  firmeza: {
    alta: "Boa firmeza vocal e textual, com sustentação consistente.",
    baixa: "Firmeza baixa. O sistema sugere mais estabilidade antes de concluir."
  },
  continuidade: {
    alta: "Continuidade elevada entre as etapas.",
    baixa: "Continuidade baixa com quebras perceptíveis."
  },
  estabilidade: {
    alta: "Boa estabilidade geral durante a sessão.",
    baixa: "Estabilidade reduzida. Recomenda-se nova tentativa com menos ruído."
  },
  oscilacao: {
    alta: "Oscilação baixa, favorecendo leitura segura.",
    baixa: "Oscilação alta. Houve variação expressiva ao longo da sessão."
  }
};

let etapaAtual = -1;
let recognition = null;
let ouvindo = false;
let transcriptAtual = "";
let dadosSessao = [];

const el = (id) => document.getElementById(id);

function addTimeline(texto) {
  const item = document.createElement("div");
  item.className = "event";
  item.textContent = `[${new Date().toLocaleTimeString("pt-BR")}] ${texto}`;
  el("timeline").prepend(item);
}

function setPrompt(texto) {
  el("promptAtual").textContent = texto;
}

function setStatusMic(texto) {
  el("stMic").textContent = texto;
}

function setStatusEtapa(texto) {
  el("stEtapa").textContent = texto;
}

function setPainelTecnico(obj) {
  el("painelTecnico").textContent = Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function abrirModal() {
  el("modalFluxo").classList.add("show");
}

function fecharModal() {
  el("modalFluxo").classList.remove("show");
}

function beep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.05;

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    console.warn("Falha no beep", e);
  }
}

function falar(texto) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    u.rate = 1;
    u.pitch = 1;

    u.onend = () => resolve();
    u.onerror = () => resolve();

    window.speechSynthesis.speak(u);
  });
}

function iniciarRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert("Reconhecimento de fala não disponível neste navegador.");
    return null;
  }

  const rec = new SR();
  rec.lang = "pt-BR";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    ouvindo = true;
    setStatusMic("Ouvindo");
    addTimeline("Microfone liberado.");
  };

  rec.onresult = (event) => {
    let texto = "";
    for (let i = 0; i < event.results.length; i++) {
      texto += event.results[i][0].transcript + " ";
    }
    transcriptAtual = texto.trim();
    el("transcricaoAtual").textContent = transcriptAtual || "Aguardando fala...";
  };

  rec.onerror = (event) => {
    ouvindo = false;
    setStatusMic("Erro");
    addTimeline(`Erro de microfone: ${event.error}`);
  };

  rec.onend = () => {
    ouvindo = false;
    setStatusMic("Silêncio / Finalizado");
    addTimeline("Captação encerrada.");
    setTimeout(() => {
      el("btnConcluirEtapa").disabled = false;
    }, 300);
  };

  return rec;
}

function preencherMetricasFake(etapa) {
  const base = [
    { id: "Presenca", v: 22 + etapa * 18 },
    { id: "Clareza", v: 18 + etapa * 20 },
    { id: "Ritmo", v: 20 + etapa * 16 },
    { id: "Firmeza", v: 16 + etapa * 17 },
    { id: "Continuidade", v: 24 + etapa * 18 },
    { id: "Estabilidade", v: 19 + etapa * 15 },
    { id: "Oscilacao", v: 14 + etapa * 8 }
  ];

  base.forEach(item => {
    const val = Math.min(item.v, 100);
    el(`val${item.id}`).textContent = `${val}%`;
    el(`bar${item.id}`).style.width = `${val}%`;
  });
}

function consolidarHeuristica() {
  const metricas = {
    presenca: parseInt(el("valPresenca").textContent),
    clareza: parseInt(el("valClareza").textContent),
    ritmo: parseInt(el("valRitmo").textContent),
    firmeza: parseInt(el("valFirmeza").textContent),
    continuidade: parseInt(el("valContinuidade").textContent),
    estabilidade: parseInt(el("valEstabilidade").textContent),
    oscilacao: parseInt(el("valOscilacao").textContent)
  };

  const maior = Object.entries(metricas).sort((a, b) => b[1] - a[1])[0][0];
  const menor = Object.entries(metricas).sort((a, b) => a[1] - b[1])[0][0];

  el("resultadoFinal").innerHTML = `
    <strong>Destaque positivo:</strong> ${HEURISTICA[maior].alta}<br><br>
    <strong>Ponto de melhoria:</strong> ${HEURISTICA[menor].baixa}<br><br>
    <strong>Orientação final:</strong> A sessão foi concluída. Revise os indicadores antes de seguir para a próxima etapa.
  `;

  setPainelTecnico({
    etapa: "concluida",
    instrucao: "finalizada",
    microfone: "encerrado",
    tts: "finalizado",
    texto_guiado: TESTES[1].texto ? "utilizado" : "nao",
    transcricao: dadosSessao.length ? "captada" : "nao_captada",
    silencio_final_3s: "concluido",
    decisao_heuristica: "gerada",
    liberacao_catraca: "pronta_para_analise"
  });
}

function carregarEtapa(indice) {
  etapaAtual = indice;
  const etapa = TESTES[indice];

  setStatusEtapa(`${indice + 1} de 3`);
  setPrompt(etapa.instrucao);

  el("modalTitulo").textContent = etapa.titulo;
  el("modalSubtitulo").textContent = etapa.subtitulo;
  el("modalInstrucao").textContent = etapa.instrucao;
  el("transcricaoAtual").textContent = "A transcrição aparecerá aqui.";
  el("btnConcluirEtapa").disabled = true;
  el("btnIniciarMic").disabled = true;

  transcriptAtual = "";

  if (etapa.texto) {
    el("caixaTextoLeitura").style.display = "block";
    el("textoLeitura").textContent = etapa.texto;
  } else {
    el("caixaTextoLeitura").style.display = "none";
    el("textoLeitura").textContent = "";
  }

  abrirModal();
  addTimeline(`Etapa ${indice + 1} preparada.`);
}

async function ouvirInstrucaoAtual() {
  const etapa = TESTES[etapaAtual];
  addTimeline(`IA iniciou fala da etapa ${etapaAtual + 1}.`);
  await falar(etapa.instrucao);
  el("btnIniciarMic").disabled = false;
  addTimeline("Instrução concluída. Microfone liberado.");
}

function iniciarMicrofone() {
  recognition = iniciarRecognition();
  if (!recognition) return;

  el("btnIniciarMic").disabled = true;
  beep();
  setTimeout(() => {
    recognition.start();
  }, 300);
}

function concluirEtapa() {
  dadosSessao.push({
    etapa: etapaAtual + 1,
    tipo: TESTES[etapaAtual].tipo,
    instrucao: TESTES[etapaAtual].instrucao,
    transcricao: transcriptAtual
  });

  addTimeline(`Etapa ${etapaAtual + 1} concluída.`);
  preencherMetricasFake(etapaAtual + 1);

  if (etapaAtual < TESTES.length - 1) {
    fecharModal();
    carregarEtapa(etapaAtual + 1);
    return;
  }

  fecharModal();
  consolidarHeuristica();
}

function resetCockpit() {
  etapaAtual = -1;
  dadosSessao = [];
  transcriptAtual = "";
  setPrompt("A avaliação ainda não começou. Clique em “Iniciar avaliação”.");
  setStatusMic("Aguardando");
  setStatusEtapa("0 de 3");
  el("resultadoFinal").textContent = "O resultado final aparecerá aqui após a conclusão dos testes.";
  el("timeline").innerHTML = `<div class="event">[00:00] sistema pronto • aguardando início da avaliação</div>`;
  ["Presenca","Clareza","Ritmo","Firmeza","Continuidade","Estabilidade","Oscilacao"].forEach(id => {
    el(`val${id}`).textContent = "0%";
    el(`bar${id}`).style.width = "0%";
  });
  setPainelTecnico({
    etapa: "aguardando_inicio",
    instrucao: "nao_emitida",
    microfone: "bloqueado",
    tts: "pronto",
    texto_guiado: "vazio",
    transcricao: "nao_captada",
    silencio_final_3s: "pendente",
    decisao_heuristica: "pendente",
    liberacao_catraca: "em_analise"
  });
}

document.addEventListener("DOMContentLoaded", () => {
  resetCockpit();

  el("btnAbrirFluxo").addEventListener("click", () => carregarEtapa(0));
  el("btnPararTudo").addEventListener("click", () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (recognition && ouvindo) recognition.stop();
    fecharModal();
    addTimeline("Sessão interrompida manualmente.");
  });
  el("btnResetarCockpit").addEventListener("click", resetCockpit);
  el("btnEncerrarSessao").addEventListener("click", () => {
    fecharModal();
    addTimeline("Sessão encerrada pelo usuário.");
  });

  el("btnFalarInstrucao").addEventListener("click", ouvirInstrucaoAtual);
  el("btnIniciarMic").addEventListener("click", iniciarMicrofone);
  el("btnConcluirEtapa").addEventListener("click", concluirEtapa);
  el("btnEncerrarModal").addEventListener("click", () => {
    fecharModal();
    addTimeline("Modal encerrado.");
  });
  el("btnAvancoManual").addEventListener("click", () => {
    if (etapaAtual === -1) carregarEtapa(0);
  });
});