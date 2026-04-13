import { ESCALA_ELAYON } from './tabela-referencia.js';

// --- CONFIGURAÇÃO ---
const URL_NUCLEO = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
const synth = window.speechSynthesis;

// --- MOTOR DE VOZ IA ---
const falarIA = (texto, callback) => {
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95;
    utterance.onend = callback;
    synth.speak(utterance);
};

// --- FLUXO DE INTERAÇÃO ---

// 1. Início do Protocolo
document.getElementById('btn-iniciar').onclick = () => {
    falarIA("Saudações. Iniciando protocolo. Todos os módulos validados. Você está pronto?", () => {
        // Simulação de microfone aberto (Ping-Pong 3s)
        setTimeout(() => {
            falarIA("Afirmativo. Vamos para o próximo passo. Diga seu nome completo e leia o texto de calibração.", () => {
                // Troca de tela: sai o início, entra a leitura
                document.getElementById('step-zero').classList.add('hidden');
                document.getElementById('area-leitura').classList.remove('hidden');
            });
        }, 3000);
    });
};

// 2. Conclusão da Leitura e Chamada ao Núcleo (Render)
document.getElementById('btn-concluir-leitura').onclick = async () => {
    falarIA("Leitura concluída. Analisando seu fluxo temporal e vibração interna...");

    // Dados capturados (Aqui você pode integrar com seus testes de CRS real)
    const payload = {
        context: "Avaliação Operacional de Presença",
        silence_pct: 18, // Exemplo vindo do seu CRS
        pause_count: 4,  // Exemplo
        transcript_raw: "Leitura do protocolo de consciência Elayon"
    };

    try {
        const response = await fetch(URL_NUCLEO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        processarResultadoFinal(data);

    } catch (error) {
        console.error("Erro no núcleo:", error);
        falarIA("Ocorreu uma interferência na rede. Mas sinto sua presença. Tente novamente.");
    }
};

// 3. Resultado Final e Feedback Heurístico
function processarResultadoFinal(data) {
    const diag = data.diagnostico;
    
    // Atualiza a Cor do Pulse Ring (Perfumaria Funcional)
    document.documentElement.style.setProperty('--cor-estado', diag.cor);
    
    // Mostra a tela de interação com o Ring
    document.getElementById('area-leitura').classList.add('hidden');
    document.getElementById('interacao-ia').classList.remove('hidden');
    
    const feedbackFinal = `${data.heuristica} Liberado seu acesso. Tenha um bom estado de presença. Melhorar sempre. — Paulo Roberto Xavier Junior.`;
    
    document.getElementById('ia-texto-legenda').innerText = feedbackFinal;
    falarIA(feedbackFinal);
}
