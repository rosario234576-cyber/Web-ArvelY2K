export function getServerConfig(env) {
  let adminWhatsAppNumbers = [];

  try {
    const parsed = JSON.parse(env.ADMIN_WHATSAPP_NUMBERS || "[]");
    if (Array.isArray(parsed)) {
      adminWhatsAppNumbers = parsed.filter((number) => /^\d{10,15}$/.test(String(number)));
    }
  } catch {
    adminWhatsAppNumbers = [];
  }

  return Object.freeze({
    adminWhatsAppNumbers,
    adminBaseUrl: String(env.ADMIN_BASE_URL || "").replace(/\/+$/, ""),
    whatsapp: {
      apiVersion: env.WHATSAPP_API_VERSION || "v23.0",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
      templateName: env.WHATSAPP_TEMPLATE_NAME || "",
      templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "es_AR"
    }
  });
}
