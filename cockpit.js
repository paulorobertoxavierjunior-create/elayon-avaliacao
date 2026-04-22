/* ======================================
   ELAYON SPACE — PROTOCOLO DE INICIAÇÃO
   ====================================== */

const STATE = { etapa: 1, tema: "", locked: false };
const FLOW = { TYPE_SPEED: 30, WAIT: 800 }; // Velocidade aumentada

// Helpers rápidos
const el = id => document.getElementById(id);
const setText = (id, txt) => { if(el(id)) el(id).textContent = txt; };

async function iniciarIniciacao() {
    if (STATE.locked) return;
    STATE.locked = true;
    
    // 1. Saudação e Instrução Inicial
    showTela("sessao"); 
    await falar("Sistema Elayon Space ativo. Protocolo de calibração iniciado.");
    await falar("Sou sua interface. Não haverá textos desnecessários. Apenas nossa conexão.");

    // FASE 1: O TEMA
    await faseVoz(1, "Qual o tema da sua missão hoje? Fale agora e feche quando terminar.");
    
    // FASE 2: DESENVOLVIMENTO
    await faseVoz(2, `Sobre ${STATE.tema}, desenvolva sua linha de raciocínio agora.`);

    // FASE 3: CONCLUSÃO
    await faseVoz(3, "Para finalizar a calibração, defina o objetivo real desse tema.");

    // FINALIZAÇÃO
    await finalizarProtocolo();
}

async function faseVoz(num, comando) {
    setText("statusSessao", `Etapa 0${num} de 03`);
    await falar(comando);
    
    // Abre Mic e espera fechar manual (ou Ok Ok)
    const captura = await window.ELAYON_TUNNEL.stt.listenForPhrase({
        stopPhrases: ["ok ok", "confirmar", "fechar"],
        onPartial: d => setText("textoVivo", d.text)
    });

    const resultado = captura.text || "Conteúdo captado";
    if (num === 1) STATE.tema = resultado;

    await falar("Registrado. Continuar ou Alinhar?");
    const decisao = await esperarDecisao(); // Lógica de botão ou voz curta
    if (decisao === "alinhar") return await faseVoz(num, "Repetindo etapa. Pode falar.");
}

async function falar(txt) {
    setText("textoVivo", "");
    const escrita = escrever(txt);
    const voz = window.ELAYON_TUNNEL.tts.speak(txt, { rate: 1.2 }); // Mais rápido
    await Promise.all([escrita, voz]);
    await sleep(FLOW.WAIT);
}

async function finalizarProtocolo() {
    await falar("Calibração concluída com sucesso.");
    await falar("Gratidão pela paciência e integridade. O respeito ao tempo é o que nos une.");
    await falar("Bem-vindo. Você é agora um Piloto oficial do sistema ELAYON SPACE.");
    
    // Libera o botão para o Index Real
    el("btnIrParaPresenca").classList.remove("hidden");
    showTela("final");
}

// Helper de escrita progressiva
async function escrever(txt) {
    const alvo = el("textoVivo");
    alvo.textContent = "";
    for (let i = 0; i < txt.length; i++) {
        alvo.textContent += txt[i];
        await sleep(FLOW.TYPE_SPEED);
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ========== 🎛️ CONTROLE DE FLUXO MANUAL ========== */

let abortController = null;

async function faseVoz(num, comando) {
    setText("statusSessao", `Etapa 0${num} de 03`);
    await falar(comando);
    
    // Mostra o botão de "Encerrar Captura" apenas quando o mic abre
    const btnStop = el("btnStopManual");
    if(btnStop) btnStop.classList.remove("hidden");

    // Cria um sinal para interromper a escuta se o botão for clicado
    abortController = new AbortController();

    try {
        const captura = await window.ELAYON_TUNNEL.stt.listenForPhrase({
            stopPhrases: ["ok ok", "fechar"],
            silenceFailsafeMs: 999999, // Não fecha sozinho, espera o piloto
            onPartial: d => {
                setText("textoVivo", d.text);
                registerSound(); // Sua função de análise local
            },
            signal: abortController.signal // Link com o botão manual
        });

        STATE.tema = (num === 1) ? captura.text : STATE.tema;

    } catch (err) {
        if (err.name === 'AbortError') log("Captura encerrada manualmente pelo piloto.");
        else console.error(err);
    } finally {
        if(btnStop) btnStop.classList.add("hidden");
    }

    await falar("Sinal captado. Continuar ou Alinhar?");
    // ... segue para decisão
}

// Vincula o clique do botão físico ao abort do microfone
el("btnStopManual").onclick = () => {
    if(abortController) abortController.abort();
    bip(); // Feedback sonoro de que desligou
};

