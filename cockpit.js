/* ======================================
   ELAYON SPACE — PROTOCOLO DE INICIAÇÃO
   ====================================== */

const STATE = { etapa: 1, tema: "", locked: false };
const FLOW = { TYPE_SPEED: 30, WAIT: 800 }; 

const el = id => document.getElementById(id);
const setText = (id, txt) => { if(el(id)) el(id).textContent = txt; };

let abortController = null;

// MOTOR DE INICIALIZAÇÃO
async function iniciarIniciacao() {
    if (STATE.locked) return;
    STATE.locked = true;
    
    try {
        setText("statusSessao", "SISTEMA ATIVO");
        await falar("Sistema Elayon Space ativo. Protocolo de calibração iniciado.");
        await falar("Sou sua interface. Não haverá textos desnecessários. Apenas nossa conexão.");

        // FASE 1
        await faseVoz(1, "Qual o tema da sua missão hoje? Fale agora e encerre no botão vermelho.");
        
        // FASE 2
        await falar(`Sincronizando sobre ${STATE.tema}.`);
        await faseVoz(2, "Desenvolva sua linha de raciocínio agora.");

        // FASE 3
        await faseVoz(3, "Para finalizar a calibração, defina o objetivo real desse tema.");

        await finalizarProtocolo();
    } catch (e) {
        console.error(e);
        setText("statusSessao", "FALHA NO PROTOCOLO");
    } finally {
        STATE.locked = false;
    }
}

// MOTOR DE VOZ E CAPTURA
async function faseVoz(num, comando) {
    setText("statusSessao", `Etapa 0${num} de 03`);
    await falar(comando);
    
    const btnStop = el("btnStopManual");
    if(btnStop) btnStop.classList.remove("hidden");

    abortController = new AbortController();

    try {
        // Abre o microfone via Túnel
        const captura = await window.ELAYON_TUNNEL.stt.listenForPhrase({
            stopPhrases: ["ok ok", "fechar"],
            silenceFailsafeMs: 999999,
            onPartial: d => { setText("textoVivo", d.text); },
            signal: abortController.signal 
        });

        if (num === 1) STATE.tema = captura.text || "Missão Alpha";

    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    } finally {
        if(btnStop) btnStop.classList.add("hidden");
    }

    await falar("Sinal captado. Continuando...");
    await sleep(1000);
}

// MOTOR DE SAÍDA (IA)
async function falar(txt) {
    setText("textoVivo", "");
    const escrita = escrever(txt);
    const voz = window.ELAYON_TUNNEL.tts.speak(txt, { rate: 1.2 });
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
    await falar("Calibração concluída com sucesso.");
    await falar("Gratidão pela paciência. O respeito ao tempo é o que nos une.");
    await falar("Bem-vindo. Você é agora um Piloto oficial dos Sistemas Elayon Space.");
    
    el("btnIrParaPresenca").classList.remove("hidden");
    setText("statusSessao", "ACESSO LIBERADO");
}

// CONTROLES MANUAIS
document.addEventListener("DOMContentLoaded", () => {
    const btnAction = el("btnAction");
    if (btnAction) {
        btnAction.onclick = () => {
            btnAction.classList.add("hidden");
            iniciarIniciacao();
        };
    }

    const btnStop = el("btnStopManual");
    if(btnStop) {
        btnStop.onclick = () => {
            if(abortController) abortController.abort();
            bip();
        };
    }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function bip() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
}