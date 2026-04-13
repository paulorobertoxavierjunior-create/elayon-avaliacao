import { ESCALA_ELAYON } from './tabela-referencia.js';

// --- CONFIGURAÇÃO ---
const URL_NUCLEO = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
const synth = window.speechSynthesis;

// Variáveis para Captura Real (Onde guardaremos os dados da sua voz)
let inicioLeitura = 0;
let listaPausas = []; // Isso vai guardar os "silêncios"

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
        
        // --- AJUSTE: RECONHECIMENTO DE VOZ PARA "SIM/NÃO" ---
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) {
            alert("Seu navegador não suporta reconhecimento de voz.");
            return;
        }

        const recognition = new Recognition();
        recognition.lang = 'pt-BR';
        recognition.start();

        recognition.onresult = (event) => {
            const resposta = event.results[0][0].transcript.toLowerCase();
            console.log("O operador disse:", resposta);

            if (resposta.includes("sim")) {
                falarIA("Afirmativo. Diga seu nome completo e leia o texto de calibração.", () => {
                    // Troca de tela
                    document.getElementById('step-zero').classList.add('hidden');
                    document.getElementById('area-leitura').classList.remove('hidden');
                    
                    // CRONÔMETRO REAL COMEÇA AQUI
                    inicioLeitura = Date.now();
                });
            } else {
                falarIA("Entendido. O protocolo foi interrompido. Reinicie quando estiver pronto.", () => {
                    location.reload(); // Reseta o teste
                });
            }
        };
    });
};

// 2. Conclusão da Leitura e Chamada ao Núcleo (Render)
document.getElementById('btn-concluir-leitura').onclick = async () => {
    falarIA("Leitura concluída. Analisando seu fluxo temporal e vibração interna...");

    // --- AJUSTE: CÁLCULO REAL (Aqui para de ser robótico) ---
    const fimLeitura = Date.now();
    const duracaoTotalSegundos = (fimLeitura - inicioLeitura) / 1000;
    
    // Se não tivermos o sensor de silêncio ligado ainda, usamos um valor dinâmico
    // baseado no tempo que você levou para ler os 5 parágrafos.
    // Se ler muito rápido (menos de 20s), o silêncio é baixo.
    const silence_pct = duracaoTotalSegundos < 25 ? 10 : 35; 

    const payload = {
        context: "Avaliação Operacional Real",
        silence_pct: silence_pct, 
        pause_count: silence_pct > 20 ? 12 : 4, // Se demorou, teve mais pausas
        duration_sec: duracaoTotalSegundos.toFixed(2),
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
        falarIA("Houve uma falha na conexão com o núcleo Render. Verifique o servidor.");
    }
};

// 3. Resultado Final
function processarResultadoFinal(data) {
    const diag = data.diagnostico;
    
    document.documentElement.style.setProperty('--cor-estado', diag.cor);
    
    document.getElementById('area-leitura').classList.add('hidden');
    document.getElementById('interacao-ia').classList.remove('hidden');
    
    const feedbackFinal = `${data.heuristica} Liberado seu acesso. Tenha um bom estado de presença. Melhorar sempre. — Paulo Roberto Xavier Junior.`;
    
    document.getElementById('ia-texto-legenda').innerText = feedbackFinal;
    falarIA(feedbackFinal);
}
