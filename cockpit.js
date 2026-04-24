/* ======================================
   ELAYON SPACE — PROTOCOLO DE INICIAÇÃO
   cockpit.js v1.2 — boot limpo, sem auto-disparo
   ====================================== */

const STATE = { etapa: 1, tema: "", locked: false };
const FLOW  = { TYPE_SPEED: 28, WAIT: 700 };

const el      = id  => document.getElementById(id);
const setText = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };

let abortController = null;

/* ── NAVEGAÇÃO ── */
function voltarPainel()    { window.location.href = "../elayon-avaliacao/index.html"; }
function pularCalibracao() { window.location.href = "../presenca/index.html"; }

/* ── BOOT — só registra listeners, NUNCA dispara protocolo ── */
document.addEventListener("DOMContentLoaded", () => {
  // Estado visual inicial limpo
  setText("statusSessao", "Aguardando Início");
  setText("textoVivo", "");
  if (el("btnStopManual"))     el("btnStopManual").classList.add("hidden");
  if (el("btnIrParaPresenca")) el("btnIrParaPresenca").classList.add("hidden");
  if (el("btnAction"))         el("btnAction").classList.remove("hidden");
  if (window.setPip)           window.setPip(0);

  // Botão principal — único ponto de entrada
  const btnAction = el("btnAction");
  if (btnAction) {
    btnAction.addEventListener("click", () => {
      btnAction.classList.add("hidden");
      iniciarIniciacao();
    });
  }

  // Botão vermelho — encerra captura ativa
  const btnStop = el("btnStopManual");
  if (btnStop) {
    btnStop.addEventListener("click", () => {
      if (abortController) abortController.abort();
      bip();
    });
  }
});

/* ── ORQUESTRADOR ── */
async function iniciarIniciacao() {
  if (STATE.locked) return;
  STATE.locked = true;

  try {
    setText("statusSessao", "SISTEMA ATIVO");
    await falar("Sistema Elayon Space ativo.");
    await falar("Protocolo de auto-avaliação iniciado. Três fases. Sem julgamento.");

    await faseVoz(1, "Fase um. Qual o tema da sua missão hoje? Fale e encerre no botão vermelho.");
    await falar("Sinal captado. Tema registrado.");

    await faseVoz(2, "Fase dois. Desenvolva seu raciocínio sobre esse tema. Sem pressa.");
    await falar("Padrão de ritmo registrado.");

    await faseVoz(3, "Fase três. Defina em uma frase o objetivo real por trás desse tema.");

    await finalizarProtocolo();

  } catch (e) {
    console.error("Protocolo interrompido:", e);
    setText("statusSessao", "PROTOCOLO ENCERRADO");
  } finally {
    STATE.locked = false;
  }
}

/* ── FASE DE VOZ ── */
async function faseVoz(num, comando) {
  setText("statusSessao", "FASE 0" + num + " DE 03");
  if (window.setPip) window.setPip(num);
  await falar(comando);

  const btnStop = el("btnStopManual");
  if (btnStop) btnStop.classList.remove("hidden");

  abortController = new AbortController();

  try {
    const captura = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: ["ok ok", "fechar", "pronto"],
      onPartial:   function(d) { setText("textoVivo", d.text); },
      signal:      abortController.signal
    });
    if (num === 1) STATE.tema = captura.text || "Missão Alpha";

    window._lastCRSMetrics = Object.assign(
      window._lastCRSMetrics || {},
      { state: "NEUTRO", hesitation: 0, rhythm: 0, silence: 0 }
    );

  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  } finally {
    if (btnStop) btnStop.classList.add("hidden");
    setText("textoVivo", "");
  }

  await falar("Sinal captado. Continuando.");
  await sleep(FLOW.WAIT);
}

/* ── FINALIZAÇÃO ── */
async function finalizarProtocolo() {
  if (window.setPip) window.setPip(4);
  await falar("Calibração concluída.");
  await falar("Bem-vindo. Você é agora um piloto ativo do sistema ELAYON SPACE.");

  setText("statusSessao", "ACESSO LIBERADO");
  setText("textoVivo", "Protocolo completo. Acesse sua Presença Real.");

  const btnPresenca = el("btnIrParaPresenca");
  if (btnPresenca) {
    btnPresenca.classList.remove("hidden");
    btnPresenca.addEventListener("click", () => {
      try {
        sessionStorage.setItem("elayon_crs_last",
          JSON.stringify(window._lastCRSMetrics || {}));
      } catch(e) {}
      window.location.href = "../presenca/index.html";
    });
  }
}

/* ── HELPERS ── */
async function falar(txt) {
  setText("textoVivo", "");
  await Promise.all([
    escrever(txt),
    window.ELAYON_TUNNEL.tts.speak(txt, { rate: 1.15 })
  ]);
  await sleep(FLOW.WAIT);
}

async function escrever(txt) {
  const alvo = el("textoVivo");
  if (!alvo) return;
  alvo.textContent = "";
  for (var i = 0; i < txt.length; i++) {
    alvo.textContent += txt[i];
    await sleep(FLOW.TYPE_SPEED);
  }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function bip() {
  try {
    var ctx  = new AudioContext();
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}
