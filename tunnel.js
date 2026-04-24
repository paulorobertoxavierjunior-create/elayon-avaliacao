/* ======================================
   ELAYON SPACE — NÚCLEO TÚNEL (V1.1)
   ====================================== */

(function () {
  const tts = {
    async speak(text, options = {}) {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        window.speechSynthesis.cancel(); 
        // Melhora a pronúncia: Elayon escrito assim soa melhor em pt-BR
        const msg = text.replace(/ELAYON/g, "Elayon");
        const utter = new SpeechSynthesisUtterance(msg);
        utter.lang = "pt-BR";
        utter.rate = options.rate || 1.1; // Ajuste para fluidez humana
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      });
    }
  };

  const stt = {
    async listenForPhrase({ onPartial, signal } = {}) {
      return new Promise((resolve, reject) => {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Speech) return reject("STT não suportado");

        const recognition = new Speech();
        recognition.lang = "pt-BR";
        recognition.interimResults = true;
        recognition.continuous = true; // Mantém o mic aberto sem cortes

        if (signal) {
          signal.addEventListener('abort', () => {
            recognition.stop();
            resolve({ text: document.getElementById("textoVivo").textContent });
          });
        }

        recognition.onresult = (event) => {
          let text = "";
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          if (onPartial) onPartial({ text });
        };

        recognition.onerror = (e) => {
           if (e.error !== 'no-speech') console.error("STT Error:", e.error);
        };
        
        recognition.start();
      });
    }
  };

  window.ELAYON_TUNNEL = { tts, stt };
})();
