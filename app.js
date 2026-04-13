import { ESCALA_ELAYON } from './tabela-referencia.js';

let mediaLatencia = 0;
let intensidadeVoz = 0;

// Configuração da Voz da IA
const falarIA = (texto) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    synth.speak(utterance);
};

// Lógica de Análise de Oscilação
const analisarEstado = (latencia, volume) => {
    // Cálculo Dinâmico: Latência alta derruba a frequência. Volume/Estabilidade eleva.
    let base = (1000 - (latencia * 150)) * (volume / 100);
    if (base < 20) base = 20;
    if (base > 1000) base = 1000;

    return ESCALA_ELAYON.reduce((prev, curr) => {
        return (Math.abs(curr.freq - base) < Math.abs(prev.freq - base) ? curr : prev);
    });
};

// O Fluxo de Interação
document.getElementById('btn-iniciar').addEventListener('click', () => {
    falarIA("Saudações. Iniciando protocolo. Todos os módulos validados. Você está pronto?");
    
    // Simula abertura de microfone por 3s
    setTimeout(() => {
        let respostaHumana = "sim"; // Aqui entra o seu SpeechRecognition
        
        if (respostaHumana.includes("sim")) {
            falarIA("Afirmativo. Vamos para o próximo passo. Diga seu nome completo quando estiver pronto.");
            document.getElementById('btn-mic').classList.remove('hidden');
        } else {
            falarIA("Protocolo interrompido. Reinicie quando houver presença.");
        }
    }, 3000);
});

// A Captura Manual (Leitura dos 5 Parágrafos)
document.getElementById('btn-concluir-leitura').addEventListener('click', () => {
    // Aqui você finaliza o microfone manual
    falarIA("Dados de latência e vibração capturados. Você se sente apto a prosseguir?");
    
    // Exemplo de retorno:
    let resultado = analisarEstado(0.5, 80); // Valores fictícios capturados
    console.log("Estado Detectado:", resultado.estado);
    
    falarIA(`Acesso liberado. Seu estado de presença é compatível com ${resultado.estado}. Tenha um bom estudo. Melhorar sempre.`);
});
