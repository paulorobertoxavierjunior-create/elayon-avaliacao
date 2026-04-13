// js/app.js - O Integrador Elayon
import { ESCALA_HAWKINS } from './tabela-referencia.js'; // A que criamos antes

const URL_NUCLEO = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";

// 1. Captura de Dados do Espectro (Baseado no seu Teste 10.2)
function capturarVibracaoHumana() {
    const energia = document.getElementById('inputEnergiaBase').value || 68;
    const estabilidade = document.getElementById('inputEstabilidadeBase').value || 72;
    return { energia, estabilidade };
}

// 2. Envio e Processamento (A Mágica do Entrou-Saiu)
async function processarDiagnostico(metricasCRS) {
    const vibracao = capturarVibracaoHumana();
    
    const payload = {
        context: "Avaliação Operacional Real",
        silence_pct: metricasCRS.silence_pct,
        pause_count: metricasCRS.pause_count,
        transcript_raw: metricasCRS.texto,
        // Somando a vibração capturada no Lab
        vibracao_interna: vibracao 
    };

    try {
        const response = await fetch(URL_NUCLEO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        exibirResultadoFinal(data);
    } catch (err) {
        console.error("Erro na integração:", err);
    }
}

// 3. Saída com Voz (Baseado no seu Teste 5 TTS)
function exibirResultadoFinal(data) {
    const diag = data.diagnostico;
    const msg = `${data.heuristica} Seu estado de presença foi calibrado em ${diag.freq} hertz.`;
    
    // Altera o Pulse Ring para a cor do estado (Ex: #ffff00 para Coragem)
    document.documentElement.style.setProperty('--cor-estado', diag.cor);
    
    // Executa a voz (TTS)
    const utterance = new SpeechSynthesisUtterance(msg);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);

    // Atualiza a UI do Relatório
    document.getElementById('ia-texto-legenda').innerText = msg;
}
