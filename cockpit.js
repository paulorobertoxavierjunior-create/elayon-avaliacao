// ============================
// CONFIG
// ============================

const WORKWORDS = {
  abrir: "responder",
  fechar: "ok ok",
  confirmar: "confirma",
  alinhar: "alinhar"
};

const STATE = {
  etapa: 0,
  texto: "",
  relatorio: null
};

// ============================
// UTIL
// ============================

function normalize(txt){
  return (txt || "")
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}

function limpar(txt){
  return (txt || "")
    .replace(/responder/gi,"")
    .replace(/ok ok/gi,"")
    .replace(/confirma/gi,"")
    .replace(/alinhar/gi,"")
    .trim();
}

async function falar(txt){
  await ELAYON_TUNNEL.tts.speak(txt);
}

function log(msg){
  console.log("[ELAYON]", msg);
}

// ============================
// BIP
// ============================

function bip(){
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.value = 880;
  gain.gain.value = 0.1;

  osc.start();
  setTimeout(()=>{
    osc.stop();
    ctx.close();
  }, 120);
}

// ============================
// ESPERAR PALAVRA
// ============================

async function esperarComando(palavra){
  while(true){
    const r = await ELAYON_TUNNEL.stt.listenOnce({ silenceMs:2000 });
    const t = normalize(r.text);
    log("ouvido: " + t);

    if(t.includes(palavra)) return true;
  }
}

// ============================
// CAPTURA COM CONTROLE HUMANO
// ============================

async function capturarFala(){

  bip();

  let textoFinal = "";

  while(true){

    const r = await ELAYON_TUNNEL.stt.listenOnce({
      silenceMs:8000,
      onPartial:(d)=>{
        console.log("...", d.text);
      }
    });

    const t = normalize(r.text);

    if(t.includes(WORKWORDS.fechar)){
      textoFinal += " " + limpar(t);
      break;
    }

    textoFinal += " " + t;
  }

  return limpar(textoFinal);
}

// ============================
// ETAPA
// ============================

async function executarEtapa(pergunta){

  await falar(pergunta);

  await falar("Quando quiser começar sua resposta, diga responder.");

  await esperarComando(WORKWORDS.abrir);

  await falar("Microfone aberto.");

  const texto = await capturarFala();

  log("fala final: " + texto);

  await falar("Se quiser continuar, diga confirma. Se quiser refazer, diga alinhar. Depois diga ok ok.");

  let decisao = null;

  while(!decisao){
    const r = await ELAYON_TUNNEL.stt.listenOnce({ silenceMs:2000 });
    const t = normalize(r.text);

    if(t.includes(WORKWORDS.confirmar)) decisao = "confirmar";
    if(t.includes(WORKWORDS.alinhar)) decisao = "alinhar";
  }

  await esperarComando(WORKWORDS.fechar);

  if(decisao === "alinhar"){
    await falar("Vamos refazer.");
    return executarEtapa(pergunta);
  }

  return texto;
}

// ============================
// INICIO
// ============================

async function iniciar(){

  await ELAYON_TUNNEL.mic.open();

  await falar(`
Este é o espaço Elayon.

Um espaço de escuta simbólica.

Vamos começar a interação com os nossos sistemas.

Funciona assim.

O sistema fica aguardando a palavra responder para abrir o microfone.

Quando você disser responder, o microfone vai abrir.

Ao abrir, você vai ouvir um bip.

Depois do bip, você pode falar à vontade.

Para encerrar a sua fala, diga apenas ok ok.

Ok ok é o código que fecha o microfone.

Vamos começar essa sessão?

Diga responder.
`);

  // ========================
  // ETAPA 1
  // ========================

  const etapa1 = await executarEtapa(
    "Sobre o tema que você trouxe, comece da forma que achar mais natural."
  );

  // ========================
  // ETAPA 2
  // ========================

  const etapa2 = await executarEtapa(
    "Agora aprofunde. Dentro do que você disse, o que merece mais atenção?"
  );

  // ========================
  // ETAPA 3
  // ========================

  const etapa3 = await executarEtapa(
    "Para concluir, qual é o próximo passo mais honesto para você agora?"
  );

  // ========================
  // FINAL
  // ========================

  await falar("Para gerar o relatório final, diga confirma.");

  await esperarComando(WORKWORDS.confirmar);

  await esperarComando(WORKWORDS.fechar);

  await falar("Processando.");

  const payload = ELAYON_TUNNEL.crs.buildPayload(
    `${etapa1} ${etapa2} ${etapa3}`
  );

  const res = await ELAYON_TUNNEL.crs.analyze(payload);

  console.log(res);

  await falar("Relatório concluído.");
}

// ============================
// START
// ============================

document.getElementById("btnIniciar").onclick = iniciar;