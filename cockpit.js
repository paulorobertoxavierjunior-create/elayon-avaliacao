/* ======================================
   ELAYON SPACE — PROTOCOLO DE INICIAÇÃO
   cockpit.js — lógica das 3 fases
   ====================================== */

const STATE = { etapa: 1, tema: "", locked: false };
const FLOW  = { TYPE_SPEED: 28, WAIT: 700 };

const el      = id  => document.getElementById(id);
const setText = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };

let abortController = null;

/* ── NAVEGAÇÃO ── */
function voltarPainel()    { window.location.href = "../elayon-avaliacao/index.html"; }
function pularCalibracao() { window.location.href = "../presenca/index.html"; }

/* ── ORQUESTRADOR PRINCIPAL ── */
async function iniciarIniciacao() {
  if (STATE.locked) return;
  STATE.locked = true;

  el("btnAction").classList.add("hidden");

  try {
    setText("statusSessao", "SISTEMA ATIVO");

    await falar("Sistema Elayon Space ativo.");
    await falar("Protocolo de auto-avaliação iniciado. Três fases. Sem julgamento.");

    /* FASE 1 — TEMA */
    await faseVoz(1, "Fase um. Qual o tema da sua missão hoje? Fale com naturalidade e encerre no botão vermelho.");
    await falar("Sinal captado. Tema registrado: " + (STATE.tema || "missão em andamento") + ".");

    /* FASE 2 — DESENVOLVIMENTO */
    await faseVoz(2, "Fase dois. Desenvolva seu raciocínio sobre esse tema. Sem pressa.");
    await falar("Padrão de ritmo registrado.");

    /* FASE 3 — OBJETIVO */
    await faseVoz(3, "Fase três e final. Defina em uma frase o objetivo real por trás desse tema.");

    await finalizarProtocolo();

  } catch (e) {
    console.error("Protocolo interrompido:", e);
    setText("statusSessao", "FALHA NO PROTOCOLO");
    STATE.locked = false;
  }
}

/* ── FASE DE VOZ ── */
async function faseVoz(num, comando) {
  setText("statusSessao", `FASE 0${num} DE 03`);
  await falar(comando);

  const btnStop = el("btnStopManual");
  if (btnStop) btnStop.classList.remove("hidden");

  abortController = new AbortController();

  try {
    const captura = await window.ELAYON_TUNNEL.stt.listenForPhrase({
      stopPhrases: ["ok ok", "fechar", "pronto"],
      onPartial:   d => setText("textoVivo", d.text),
      signal:      abortController.signal
    });
    if (num === 1) STATE.tema = captura.text || "Missão Alpha";
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  } finally {
    if (btnStop) btnStop.classList.add("hidden");
  }

  setText("textoVivo", "");
  await falar("Sinal captado. Continuando.");
  await sleep(FLOW.WAIT);
}

/* ── FINALIZAÇÃO ── */
async function finalizarProtocolo() {
  await falar("Calibração concluída.");
  await falar("Bem-vindo. Você é agora um piloto ativo do sistema ELAYON SPACE.");

  setText("statusSessao", "ACESSO LIBERADO");
  setText("textoVivo", "Protocolo completo. Acesse sua Presença Real.");

  const btnPresenca = el("btnIrParaPresenca");
  if (btnPresenca) {
    btnPresenca.classList.remove("hidden");
    btnPresenca.onclick = () => { window.location.href = "../presenca/index.html"; };
  }
  STATE.locked = false;
}

/* ── HELPERS ── */
async function falar(txt) {
  setText("textoVivo", "");
  await Promise.all([escrever(txt), window.ELAYON_TUNNEL.tts.speak(txt, { rate: 1.2 })]);
  await sleep(FLOW.WAIT);
}

async function escrever(txt) {
  const alvo = el("textoVivo");
  if (!alvo) return;
  alvo.textContent = "";
  for (const char of txt) {
    alvo.textContent += char;
    await sleep(FLOW.TYPE_SPEED);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function bip() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

/* ── BOOT ── */
document.addEventListener("DOMContentLoaded", () => {
  const btnAction = el("btnAction");
  if (btnAction) {
    btnAction.onclick = iniciarIniciacao;
  }

  const btnStop = el("btnStopManual");
  if (btnStop) {
    btnStop.onclick = () => {
      if (abortController) abortController.abort();
      bip();
    };
  }
});
