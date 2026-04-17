async function runTunnelTests() {
  const logEl = document.getElementById("logTech");

  function log(msg) {
    const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`;
    console.log(line);
    if (logEl) logEl.textContent += line + "\n";
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  log("=== INICIANDO DIAGNÓSTICO ELAYON ===");

  if (!window.ELAYON_TUNNEL) {
    log("❌ Tunnel NÃO carregado");
    alert("ELAYON_TUNNEL não carregado.");
    return;
  }

  const T = window.ELAYON_TUNNEL;

  // ============================
  // 1. HEALTHCHECK
  // ============================
  log("Testando healthcheck...");
  try {
    const health = await T.healthcheck();
    log("✅ Healthcheck OK:");
    log(JSON.stringify(health, null, 2));
  } catch (e) {
    log("❌ Healthcheck falhou: " + e.message);
  }

  await wait(1500);

  // ============================
  // 2. MICROFONE
  // ============================
  log("Testando microfone...");
  try {
    await T.mic.open();
    log("🎤 Microfone aberto");

    await wait(2000);

    await T.mic.close();
    log("🎤 Microfone fechado");
  } catch (e) {
    log("❌ Microfone erro: " + e.message);
  }

  await wait(1500);

  // ============================
  // 3. TTS
  // ============================
  log("Testando TTS...");
  try {
    await T.tts.speak("Teste de voz do sistema Elayon.");
    log("🔊 TTS executado com sucesso");
  } catch (e) {
    log("❌ TTS erro: " + e.message);
  }

  await wait(2000);

  // ============================
  // 4. STT (fala)
  // ============================
  log("Testando STT...");
  try {
    const result = await T.stt.listenOnce({
      silenceMs: 5000,
      onPartial: (data) => {
        log("📝 Parcial: " + data.text);
      }
    });

    log("✅ STT final:");
    log(JSON.stringify(result, null, 2));
  } catch (e) {
    log("❌ STT erro: " + e.message);
  }

  await wait(1500);

  // ============================
  // 5. CRS (se autenticado)
  // ============================
  log("Testando CRS...");
  try {
    const payload = T.crs.buildPayload("teste de análise elayon");

    const res = await T.crs.analyze(payload);
    log("📊 CRS OK:");
    log(JSON.stringify(res, null, 2));
  } catch (e) {
    log("⚠️ CRS falhou (normal se não autenticado): " + e.message);
  }

  log("=== FIM DO DIAGNÓSTICO ===");
}