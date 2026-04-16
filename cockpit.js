// ======================================
// SISTEMAS ELAYON — PRESENÇA (COCKPIT FINAL)
// ======================================

const WORKWORDS = {
  abrir: ["responder"],
  fechar: ["ok ok", "okok", "ok, ok", "ok,ok", "ok-ok"],
  confirma: ["confirma", "confirmar"],
  alinhar: ["alinhar", "refazer"]
};

const STATE = {
  etapa: 0,
  respostas: [],
  sessionId: null
};

// ============================
// HELPERS
// ============================

function el(id){ return document.getElementById(id); }

function setText(id, v){
  if(el(id)) el(id).textContent = v;
}

function normalize(txt){
  return window.ELAYON_TUNNEL.utils.normalizeText(txt);
}

function matchAny(text, list){
  const n = normalize(text);
  return list.some(w => n.includes(normalize(w)));
}

// ============================
// FLUXO BASE
// ============================

async function esperarPalavra(lista){
  while(true){
    const r = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs:4000 });
    const t = r.text || "";

    if(matchAny(t, lista)){
      return t;
    }
  }
}

// ============================
// CAPTURA CONTROLADA
// ============================

async function capturarResposta(){

  setText("statusSessao","🎙️ ouvindo...");
  setText("textoVivo","");

  const heard = await window.ELAYON_TUNNEL.stt.listenForPhrase({
    stopPhrases: WORKWORDS.fechar,
    silenceFailsafeMs: 120000,
    onPartial:(d)=>{
      setText("textoVivo", d.text || "");
    }
  });

  const texto = (heard.cleaned_text || heard.text || "").trim();

  setText("textoVivo", texto || "—");

  return texto;
}

// ============================
// ETAPA
// ============================

async function rodarEtapa(pergunta){

  await window.ELAYON_TUNNEL.tts.speak(pergunta);

  setText("statusSessao","Aguardando: responder");

  await esperarPalavra(WORKWORDS.abrir);

  await window.ELAYON_TUNNEL.tts.speak("Microfone aberto.");

  const resposta = await capturarResposta();

  if(!resposta){
    await window.ELAYON_TUNNEL.tts.speak("Nada captado. Vamos tentar novamente.");
    return rodarEtapa(pergunta);
  }

  await window.ELAYON_TUNNEL.tts.speak(
    "Se quiser confirmar diga confirma. Se quiser refazer diga alinhar."
  );

  let decisao = null;

  while(!decisao){
    const r = await window.ELAYON_TUNNEL.stt.listenOnce({ silenceMs:4000 });
    const t = r.text || "";

    if(matchAny(t, WORKWORDS.confirma)) decisao = "confirmar";
    if(matchAny(t, WORKWORDS.alinhar)) decisao = "alinhar";
  }

  await esperarPalavra(WORKWORDS.fechar);

  if(decisao === "alinhar"){
    await window.ELAYON_TUNNEL.tts.speak("Refazendo etapa.");
    return rodarEtapa(pergunta);
  }

  return resposta;
}

// ============================
// CRS
// ============================

async function enviarCRS(texto){

  const payload = window.ELAYON_TUNNEL.crs.buildPayload(texto);

  const res = await window.ELAYON_TUNNEL.crs.analyze(payload);

  return res;
}

// ============================
// RELATÓRIO
// ============================

function gerarRelatorio(respostas, analises){

  let txt = "";

  txt += "SISTEMAS ELAYON\n";
  txt += "PRESENÇA — RELATÓRIO\n\n";

  respostas.forEach((r,i)=>{
    txt += `ETAPA ${i+1}\n`;
    txt += `FALA: ${r}\n`;

    const a = analises[i]?.relatorio || {};

    txt += `Tempo: ${a.tempo_total || 0}s\n`;
    txt += `Silêncio: ${a.porcentagem_silencio || 0}%\n`;
    txt += `Pausas: ${a.total_pausas || 0}\n`;
    txt += `Densidade: ${a.densidade || 0}\n`;

    txt += "\n";
  });

  return txt;
}

// ============================
// FLUXO PRINCIPAL
// ============================

async function iniciar(){

  const health = await window.ELAYON_TUNNEL.healthcheck();

  if(!health.authenticated){
    alert("Faça login primeiro.");
    return;
  }

  STATE.sessionId = "sessao-" + Date.now();
  STATE.respostas = [];

  await window.ELAYON_TUNNEL.mic.open();

  await window.ELAYON_TUNNEL.tts.speak(
`SISTEMAS ELAYON.
Bem-vindo ao PRESENÇA.
Diga responder para iniciar.`
  );

  const etapas = [
    "Fale sobre o tema.",
    "Agora aprofunde.",
    "Qual seu próximo passo?"
  ];

  const analises = [];

  for(let i=0;i<etapas.length;i++){

    const r = await rodarEtapa(etapas[i]);

    STATE.respostas.push(r);

    const analise = await enviarCRS(r);

    analises.push(analise);
  }

  const relatorio = gerarRelatorio(STATE.respostas, analises);

  setText("relatorioFinal", relatorio);

  await window.ELAYON_TUNNEL.tts.speak("Relatório concluído.");
}

// ============================
// INIT
// ============================

document.addEventListener("DOMContentLoaded", ()=>{

  el("btnIniciar")?.addEventListener("click", iniciar);

});