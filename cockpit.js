/* ======================================
   ELAYON SPACE — PROTOCOLO DE INICIAÇÃO
   ====================================== */

const STATE = { etapa: 1, tema: "", locked: false };
const FLOW = { TYPE_SPEED: 25, WAIT: 600 }; 

const el = id => document.getElementById(id);
const setText = (id, txt) => { if(el(id)) el(id).textContent = txt; };

let abortController = null;

// Atalho para entrar direto
function pularCalibracao() {
    window.location.href = "index.html"; // Vai para o Presença
}

// Botão Voltar
function voltarPainel() {
    window.location.href = "https://paulorobertoxavierjunior-create.github.io/elayon-cadastro/painel.html";
}

async function iniciarIniciacao() {
    if (STATE.locked) return;
    STATE.locked = true;
    el("navVoluntaria").classList.add("hidden"); // Esconde opções ao iniciar
    
    try {
        setText("statusSessao", "SISTEMA ATIVO");
        await falar("Sistema Elayon Space ativo. Protocolo de calibração iniciado.");
        await falar("Qual o tema da sua missão hoje?");
        
        await faseVoz(1);
        await finalizarProtocolo();
    } catch (e) {
        setText("statusSessao", "CALIBRAÇÃO MANUAL");
    } finally {
        STATE.locked = false;
    }
}

async function faseVoz(num) {
    const btnStop = el("btnStopManual");
    btnStop.classList.remove("hidden");
    abortController = new AbortController();

    try {
        await window.ELAYON_TUNNEL.stt.listenForPhrase({
            onPartial: d => { setText("textoVivo", d.text); },
            signal: abortController.signal 
        });
    } finally {
        btnStop.classList.add("hidden");
    }
}

async function falar(txt) {
    const limpo = txt.replace(/ELAYON/g, "Elayon");
    const escrita = escrever(limpo);
    const voz = window.ELAYON_TUNNEL.tts.speak(limpo);
    await Promise.all([escrita, voz]);
    await sleep(FLOW.WAIT);
}

async function escrever(txt) {
    const alvo = el("textoVivo");
    alvo.textContent = "";
    for (let i = 0; i < txt.length; i++) {
        alvo.textContent += txt[i];
        await sleep(FLOW.TYPE_SPEED);
    }
}

async function finalizarProtocolo() {
    await falar("Calibração concluída. Acesso liberado.");
    el("btnIrParaPresenca").classList.remove("hidden");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
