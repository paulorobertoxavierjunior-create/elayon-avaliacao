(function () {
  const SUPABASE_URL = "https://eudcjihffrfmhzmfwtlg.supabase.co";
  const SUPABASE_ANON_KEY = "SUA_CHAVE_AQUI";

  if (!window.supabase) {
    console.error("[ELAYON] Supabase JS não carregado.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  window.ELAYON_SUPABASE = supabaseClient;

  console.log("[ELAYON] boot-auth carregado");
})();