/* ======================================
   ELAYON SPACE — NÚCLEO TÚNEL (V1.0)
   ALINHADO PARA COCKPIT DE ALTA PERFORMANCE
   ====================================== */

(function () {
  const CRS_URL = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
  let activeRecognition = null;
  let ttsActive = false;

  // --- Módulo TTS (Voz da IA) ---
  const tts = {
    async speak(text, options = {}) {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        window.speechSynthesis.cancel(); 
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "pt-BR";
        utter.rate = options.rate || 1.15; // Velocidade ELAYON
        utter.onstart = () => { ttsActive = true; };
        utter.onend = () => { ttsActive = false; resolve(); };
        utter.onerror = () => { ttsActive = false; resolve(); };
        window.speechSynthesis.speak(utter);
      });
    },
    stop() { window.speechSynthesis.cancel(); ttsActive = false; }
  };

  // --- Módulo STT (Escuta e Captura) ---
  const stt = {
    // 1. Unidade de escuta individual (Curta)
    async _listenOnceInternal(config = {}) {
      return new Promise((resolve, reject) => {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Speech) return reject("STT não suportado");

        const recognition = new Speech();
        recognition.lang = "pt-BR";
        recognition.interimResults = true;
        recognition.continuous = false;

        // ACIONADOR DO BOTÃO VERMELHO (ABORT)
        if (config.signal) {
          config.signal.addEventListener('abort', () => {
            recognition.abort();
            reject(new Error("AbortError"));
          });
        }

        recognition.onresult = (event) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          if (config.onPartial) config.onPartial({ text });
        };

        recognition.onend = () => resolve();
        recognition.onerror = (e) => {
           if (e.error === 'no-speech') resolve(); // Silêncio não é erro
           else reject(e);
        };
        
        recognition.start();
      });
    },

    // 2. Loop Inteligente (Captura até Comando ou Botão)
    async listenForPhrase({ stopPhrases = [], onPartial, signal } = {}) {
      let textoAcumulado = "";
      let rodando = true;

      while (rodando) {
        try {
          await this._listenOnceInternal({
            signal: signal,
            onPartial: (dados) => {
              const parcial = (textoAcumulado + " " + dados.text).trim();
              if (onPartial) onPartial({ text: parcial });
              
              // Verifica se disse "Ok Ok" ou similar
              if (stopPhrases.some(p => parcial.toLowerCase().includes(p))) {
                rodando = false;
              }
            }
          });
          // Pequena pausa para o hardware respirar
          await new Promise(r => setTimeout(r, 100)); 
        } catch (err) {
          if (err.message === "AbortError") {
            rodando = false; // Botão vermelho apertado
          } else {
            console.warn("Reabrindo mic...");
          }
        }
      }
      return { text: textoVivo.textContent || "" };
    }
  };

  // --- Exportação Global ---
  window.ELAYON_TUNNEL = {
    tts,
    stt,
    healthcheck: async () => ({
        stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        tts: "speechSynthesis" in window,
        crs: true
    }),
    crs: {
      analyze: async (payload) => {
        console.log("CRS Payload:", payload);
        return { status: "Sincronizado" };
      }
    }
  };
})();