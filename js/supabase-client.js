(function () {
  "use strict";

  const config = window.ARVEL_SUPABASE_CONFIG || {};
  const hasPublicKey =
    typeof config.publishableKey === "string" &&
    config.publishableKey.length > 20 &&
    !config.publishableKey.includes("PEGA_AQUI");

  window.ArvelSupabase = Object.freeze({
    config,
    isConfigured: Boolean(config.projectUrl && hasPublicKey && window.supabase?.createClient),
    client:
      config.projectUrl && hasPublicKey && window.supabase?.createClient
        ? window.supabase.createClient(config.projectUrl, config.publishableKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          })
        : null
  });
})();

