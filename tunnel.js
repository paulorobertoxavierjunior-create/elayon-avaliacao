(function () {
  const CRS_URL = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
  const HEALTH_URL = "https://nucleo-crs-elayon.onrender.com/health";
  const TIMEOUT_MS = 20000;

  let activeStream = null;
  let activeRecognition = null;
  let recognitionRunning = false;
  let ttsActive = false;

  function withTimeout(promise, timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("timeout da requisição"));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function normalizeText(txt) {
    return (txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,;:!?-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripPhrase(txt, phrase) {
    if (!phrase) return (txt || "").trim();

    const normalizedPhrase = normalizeText(phrase);
    const variants = [
      normalizedPhrase,
      normalizedPhrase.replace(/\s+/g, ""),
      normalizedPhrase.replace(/\s+/g, "[\\s,.!?;:-]*")
    ];

    let out = txt || "";

    variants.forEach((variant) => {
      const re = new RegExp(variant, "gi");
      out = out.replace(re, " ");
    });

    return out.replace(/\s+/g, " ").trim();
  }

  function stripPhrases(txt, phrases = []) {
    let out = txt || "";
    phrases.forEach((p) => {
      out = stripPhrase(out, p);
    });
    return out.trim();
  }

  async function getAccessToken() {
    try {
      if (!window.ELAYON_SUPABASE?.auth?.getSession) return null;

      const { data, error } = await window.ELAYON_SUPABASE.auth.getSession();
      if (error) throw error;

      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function healthcheck() {
    const base = {
      tts: "speechSynthesis" in window,
      mic: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      crs: false,
      streamOpen: !!activeStream,
      ttsActive,
      recognitionRunning,
      authenticated: false
    };

    try {
      const token = await getAccessToken();
      base.authenticated = !!token;
    } catch {
      base.authenticated = false;
    }

    try {
      const res = await withTimeout(fetch(HEALTH_URL));
      base.crs = res.ok;
    } catch {
      base.crs = false;
    }

    return base;
  }

  const tts = {
    async speak(text, options = {}) {
      return new Promise((resolve, reject) => {
        try {
          if (!("speechSynthesis" in window)) {
            reject(new Error("TTS não disponível"));
            return;
          }

          const {
            lang = "pt-BR",
            rate = 0.96,
            pitch = 1,
            volume = 1,
            cancelPrevious = true
          } = options;

          if (cancelPrevious) {
            try {
              window.speechSynthesis.cancel();
            } catch {}
          }

          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = lang;
          utter.rate = rate;
          utter.pitch = pitch;
          utter.volume = volume;

          utter.onstart = () => {
            ttsActive = true;
          };

          utter.onend = () => {
            ttsActive = false;
            resolve({ ok: true, text });
          };

          utter.onerror = (e) => {
            ttsActive = false;
            reject(new Error(e.error || "erro no TTS"));
          };

          window.speechSynthesis.speak(utter);
        } catch (err) {
          ttsActive = false;
          reject(err);
        }
      });
    },

    async stop() {
      try {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      ttsActive = false;
      return { ok: true };
    },

    isActive() {
      return ttsActive;
    }
  };

  const mic = {
    async open() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("microfone não disponível");
      }

      if (activeStream) {
        return {
          ok: true,
          tracks: activeStream.getAudioTracks().length,
          labels: activeStream.getAudioTracks().map((t) => t.label || "Padrão")
        };
      }

      activeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      return {
        ok: true,
        tracks: activeStream.getAudioTracks().length,
        labels: activeStream.getAudioTracks().map((t) => t.label || "Padrão")
      };
    },

    async close() {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }
      return { ok: true };
    },

    isOpen() {
      return !!activeStream;
    }
  };

  function stopRecognitionInternal() {
    try {
      activeRecognition && activeRecognition.stop();
    } catch {}
    recognitionRunning = false;
    activeRecognition = null;
  }

  function createRecognition() {
    const RecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!RecognitionCtor) {
      throw new Error("SpeechRecognition não disponível");
    }

    return new RecognitionCtor();
  }

  const stt = {
    async listenForPhrase({
      stopPhrases = [],
      onPartial,
      interimResults = true,
      continuous = true,
      silenceFailsafeMs = 60000
    } = {}) {
      if (recognitionRunning) {
        stopRecognitionInternal();
      }

      return new Promise((resolve, reject) => {
        try {
          const recognition = createRecognition();

          let finalText = "";
          let partialText = "";
          let finished = false;
          let failsafeTimer = null;

          const normalizedStops = stopPhrases
            .map((s) => normalizeText(s))
            .filter(Boolean);

          function finish(result) {
            if (finished) return;
            finished = true;
            recognitionRunning = false;
            clearTimeout(failsafeTimer);

            try {
              recognition.stop();
            } catch {}

            activeRecognition = null;
            resolve(result);
          }

          function refreshFailsafe() {
            clearTimeout(failsafeTimer);
            failsafeTimer = setTimeout(() => {
              finish({
                ok: true,
                text: `${finalText}${partialText}`.trim(),
                final: finalText.trim(),
                partial: partialText.trim(),
                matched_phrase: null,
                timed_out: true,
                cleaned_text: stripPhrases(
                  `${finalText}${partialText}`.trim(),
                  stopPhrases
                )
              });
            }, silenceFailsafeMs);
          }

          activeRecognition = recognition;
          recognition.lang = "pt-BR";
          recognition.interimResults = interimResults;
          recognition.continuous = continuous;

          recognition.onstart = () => {
            recognitionRunning = true;
            refreshFailsafe();
          };

          recognition.onresult = (event) => {
            partialText = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const trecho = event.results[i][0].transcript || "";
              if (event.results[i].isFinal) {
                finalText += `${trecho} `;
              } else {
                partialText += `${trecho} `;
              }
            }

            const currentText = `${finalText}${partialText}`.trim();

            if (typeof onPartial === "function") {
              onPartial({
                ok: true,
                text: currentText,
                final: finalText.trim(),
                partial: partialText.trim(),
                cleaned_text: stripPhrases(currentText, stopPhrases)
              });
            }

            refreshFailsafe();

            const normalizedCurrent = normalizeText(currentText);
            const matched = normalizedStops.find((phrase) =>
              normalizedCurrent.includes(phrase)
            );

            if (matched) {
              finish({
                ok: true,
                text: currentText,
                final: finalText.trim(),
                partial: partialText.trim(),
                matched_phrase: matched,
                cleaned_text: stripPhrases(currentText, stopPhrases)
              });
            }
          };

          recognition.onerror = (event) => {
            recognitionRunning = false;
            clearTimeout(failsafeTimer);
            activeRecognition = null;
            reject(new Error(event.error || "erro no reconhecimento"));
          };

          recognition.onend = () => {
            if (!finished) {
              recognitionRunning = false;
              clearTimeout(failsafeTimer);

              finish({
                ok: true,
                text: `${finalText}${partialText}`.trim(),
                final: finalText.trim(),
                partial: partialText.trim(),
                matched_phrase: null,
                cleaned_text: stripPhrases(
                  `${finalText}${partialText}`.trim(),
                  stopPhrases
                )
              });
            }
          };

          recognition.start();
        } catch (err) {
          recognitionRunning = false;
          activeRecognition = null;
          reject(err);
        }
      });
    },

    async listenForAnyPhrase({
      phrases = [],
      onPartial,
      silenceFailsafeMs = 15000
    } = {}) {
      return this.listenForPhrase({
        stopPhrases: phrases,
        onPartial,
        silenceFailsafeMs
      });
    },

    async listenOnce({ silenceMs = 4000, onPartial } = {}) {
      return this.listenForPhrase({
        stopPhrases: [],
        onPartial,
        silenceFailsafeMs: silenceMs
      });
    },

    stop() {
      stopRecognitionInternal();
      return { ok: true };
    },

    isRunning() {
      return recognitionRunning;
    }
  };

  const crs = {
    buildPayload(transcript, extra = {}) {
      const text = (transcript || "").trim();

      return {
        context: extra.context || "",
        transcript_raw: text,
        duration_sec: extra.duration_sec ?? Math.max(1, Math.ceil(text.length / 12)),
        silence_pct: extra.silence_pct ?? 15,
        pause_count: extra.pause_count ?? 2,
        mean_pause_ms: extra.mean_pause_ms ?? 180,
        energy_pct: extra.energy_pct ?? 0,
        oscillation_pct: extra.oscillation_pct ?? 0,
        continuity_pct: extra.continuity_pct ?? 0,
        stability_pct: extra.stability_pct ?? 0,
        noise_pct: extra.noise_pct ?? 0,
        spectrum_snapshot: extra.spectrum_snapshot || {},
        timeline_events: extra.timeline_events || [],
        spectrum_series: extra.spectrum_series || [],
        source_text: extra.source_text || "",
        uploaded_file_name: extra.uploaded_file_name || ""
      };
    },

    async analyze(payload) {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        throw new Error("acesso negado: usuário não autenticado no Supabase");
      }

      const res = await withTimeout(
        fetch(CRS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        })
      );

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`CRS HTTP ${res.status}: ${text}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error("CRS respondeu sem JSON válido");
      }
    }
  };

  const audio = (() => {
  let audioContext = null;
  let analyser = null;
  let timeData = null;
  let freqData = null;
  let rafId = null;
  let running = false;

  let captureStartedAt = 0;
  let frameCount = 0;
  let silenceFrames = 0;
  let energyAccum = 0;
  let oscillationAccum = 0;
  let lastVolume = 0;

  let pauseCount = 0;
  let pauseOpenAt = null;
  let pauseDurations = [];

  let timelineSeries = [];
  let spectrumSeries = [];
  let currentSnapshot = null;

  const CONFIG = {
    silenceThreshold: 8,
    frameIntervalMs: 100,
    shortPauseMinMs: 220,
    maxSeriesPoints: 240
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resetInternal() {
    frameCount = 0;
    silenceFrames = 0;
    energyAccum = 0;
    oscillationAccum = 0;
    lastVolume = 0;

    pauseCount = 0;
    pauseOpenAt = null;
    pauseDurations = [];

    timelineSeries = [];
    spectrumSeries = [];
    currentSnapshot = null;
    captureStartedAt = 0;
  }

  function rmsFromTimeDomain(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = (arr[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / arr.length);
  }

  function averageBand(arr, start, end) {
    let sum = 0;
    let count = 0;
    for (let i = start; i < end && i < arr.length; i++) {
      sum += arr[i];
      count++;
    }
    return count ? sum / count : 0;
  }

  function ensureSnapshot() {
    return currentSnapshot || {
      graves: 0,
      medios: 0,
      agudos: 0,
      ruido: 0,
      estabilidade: 0,
      continuidade: 0,
      volume: 0,
      timestamp: new Date().toISOString()
    };
  }

  function processFrame() {
    if (!analyser || !timeData || !freqData) return;

    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    const rms = rmsFromTimeDomain(timeData);
    const volume = Math.round(clamp(rms * 140, 0, 100));

    const graves = Math.round(clamp(averageBand(freqData, 2, 12) / 2.55, 0, 100));
    const medios = Math.round(clamp(averageBand(freqData, 12, 40) / 2.55, 0, 100));
    const agudos = Math.round(clamp(averageBand(freqData, 40, 90) / 2.55, 0, 100));
    const ruido = Math.round(clamp(averageBand(freqData, 90, freqData.length) / 2.55, 0, 100));

    const delta = Math.abs(volume - lastVolume);
    const estabilidade = Math.round(clamp(100 - delta, 0, 100));
    const continuidade = Math.round(
      clamp(100 - (ruido * 0.35) - (delta * 0.85), 0, 100)
    );

    frameCount += 1;
    energyAccum += volume;
    oscillationAccum += delta;

    const now = performance.now();

    if (volume < CONFIG.silenceThreshold) {
      silenceFrames += 1;
      if (pauseOpenAt === null) pauseOpenAt = now;
    } else if (pauseOpenAt !== null) {
      const pauseMs = now - pauseOpenAt;
      if (pauseMs >= CONFIG.shortPauseMinMs) {
        pauseCount += 1;
        pauseDurations.push(pauseMs);
      }
      pauseOpenAt = null;
    }

    lastVolume = volume;

    const timestamp = new Date().toISOString();

    currentSnapshot = {
      graves,
      medios,
      agudos,
      ruido,
      estabilidade,
      continuidade,
      volume,
      timestamp
    };

    timelineSeries.push({
      timestamp,
      energia_pct: volume,
      silencio_pct: volume < CONFIG.silenceThreshold ? 100 : 0,
      continuidade_pct: continuidade,
      pause_count: pauseCount,
      oscilacao_pct: Math.round(clamp(oscillationAccum / frameCount, 0, 100))
    });

    spectrumSeries.push({
      timestamp,
      graves,
      medios,
      agudos,
      ruido,
      estabilidade
    });

    if (timelineSeries.length > CONFIG.maxSeriesPoints) timelineSeries.shift();
    if (spectrumSeries.length > CONFIG.maxSeriesPoints) spectrumSeries.shift();
  }

  function renderLoop(lastTick = 0) {
    if (!running) return;

    const now = performance.now();
    if (!lastTick || (now - lastTick) >= CONFIG.frameIntervalMs) {
      processFrame();
      lastTick = now;
    }

    rafId = requestAnimationFrame(() => renderLoop(lastTick));
  }

  return {
    async startCapture() {
      await mic.open();

      if (running) {
        return { ok: true, alreadyRunning: true };
      }

      resetInternal();

      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(activeStream);

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;

      source.connect(analyser);

      timeData = new Uint8Array(analyser.fftSize);
      freqData = new Uint8Array(analyser.frequencyBinCount);

      captureStartedAt = performance.now();
      running = true;

      renderLoop();

      return { ok: true };
    },

    async stopCapture() {
      if (!running) {
        return {
          ok: true,
          report: this.getReport()
        };
      }

      running = false;

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (pauseOpenAt !== null) {
        const pauseMs = performance.now() - pauseOpenAt;
        if (pauseMs >= CONFIG.shortPauseMinMs) {
          pauseCount += 1;
          pauseDurations.push(pauseMs);
        }
        pauseOpenAt = null;
      }

      if (audioContext && audioContext.state !== "closed") {
        try {
          await audioContext.close();
        } catch {}
      }

      audioContext = null;
      analyser = null;
      timeData = null;
      freqData = null;

      return {
        ok: true,
        report: this.getReport()
      };
    },

    getSnapshot() {
      return ensureSnapshot();
    },

    getTimelineSeries() {
      return [...timelineSeries];
    },

    getSpectrumSeries() {
      return [...spectrumSeries];
    },

    getReport() {
      const snapshot = ensureSnapshot();

      const durationSec = captureStartedAt
        ? Math.max(1, Math.round((performance.now() - captureStartedAt) / 1000))
        : 0;

      const silencePct = frameCount
        ? Math.round((silenceFrames / frameCount) * 100)
        : 0;

      const meanPauseMs = pauseDurations.length
        ? Math.round(
            pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length
          )
        : 0;

      const energyPct = frameCount
        ? Math.round(energyAccum / frameCount)
        : 0;

      const oscillationPct = frameCount
        ? Math.round(clamp(oscillationAccum / frameCount, 0, 100))
        : 0;

      return {
        duration_sec: durationSec,
        silence_pct: silencePct,
        pause_count: pauseCount,
        mean_pause_ms: meanPauseMs,
        energy_pct: energyPct,
        oscillation_pct: oscillationPct,
        continuity_pct: snapshot.continuidade || 0,
        stability_pct: snapshot.estabilidade || 0,
        noise_pct: snapshot.ruido || 0,
        spectrum_snapshot: {
          graves: snapshot.graves || 0,
          medios: snapshot.medios || 0,
          agudos: snapshot.agudos || 0,
          ruido: snapshot.ruido || 0,
          estabilidade: snapshot.estabilidade || 0
        },
        timeline_series: [...timelineSeries],
        spectrum_series: [...spectrumSeries]
      };
    },

    reset() {
      resetInternal();
      return { ok: true };
    },

    isRunning() {
      return running;
    }
  };
})();

  const loop = {
    async runStep({
      instruction,
      context,
      sourceText,
      stopPhrase = "ok ok"
    }) {
      await tts.speak(instruction);

      const heard = await stt.listenForPhrase({
        stopPhrases: [stopPhrase, "okok"]
      });

      const finalText = heard.cleaned_text || heard.text || "";

      const payload = crs.buildPayload(finalText, {
        context: context || "",
        source_text: sourceText || instruction
      });

      const analysis = await crs.analyze(payload);

      return {
        ok: true,
        heard,
        payload,
        analysis
      };
    }
  };

  window.ELAYON_TUNNEL = {
    healthcheck,
    tts,
    mic,
    stt,
    audio,
    crs,
    loop,
    utils: {
      normalizeText,
      stripPhrase,
      stripPhrases,
      getAccessToken
    }
  };
})();