import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const FACEBOOK_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
const FACEBOOK_GRAPH_ORIGIN = "https://graph.facebook.com";
const INSTAGRAM_GRAPH_ORIGIN = "https://graph.instagram.com";
const FEED_PATH = "data/instagram-feed.json";
const STATUS_PATH = "data/instagram-sync-status.json";
const TOKEN_HANDOFF_PATH = ".instagram-access-token";
const IMAGE_DIRECTORY = "assets/images/instagram/feed";
const MAX_POSTS = Math.min(100, Math.max(1, Number(process.env.INSTAGRAM_SYNC_LIMIT) || 50));
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

const configuredFacebookToken = String(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
const configuredInstagramToken = String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();
const instagramUserId = String(process.env.INSTAGRAM_USER_ID || "").trim();
const configuredUsername = String(process.env.INSTAGRAM_USERNAME || "").replace(/^@/, "").trim();
const tokenMode = configuredFacebookToken ? "facebook-page" : "instagram-login";
let accessToken = configuredFacebookToken || configuredInstagramToken;

class SyncError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SyncError";
    Object.assign(this, details);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function publicMessage(error) {
  if (error?.reconnectRequired) return "La autorización de Instagram venció o fue revocada. El administrador debe volver a conectar la cuenta.";
  if (error?.category === "permissions") return "Meta rechazó los permisos necesarios. Revisá que la cuenta y la página sigan asignadas a la aplicación.";
  if (error?.category === "rate_limit") return "Meta limitó temporalmente las consultas. Conservamos el último contenido y volveremos a intentar.";
  if (error?.category === "temporary") return "Meta no respondió correctamente. Conservamos el último contenido y volveremos a intentar.";
  if (error?.category === "configuration") return error.message;
  return "No se pudo actualizar Instagram. Conservamos la última sincronización disponible.";
}

function sanitizeError(error) {
  let message = publicMessage(error);
  for (const secret of [configuredFacebookToken, configuredInstagramToken, process.env.INSTAGRAM_APP_SECRET]) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return {
    message,
    category: error?.category || "unknown",
    httpStatus: Number(error?.httpStatus) || null,
    metaCode: Number(error?.metaCode) || null,
    metaSubcode: Number(error?.metaSubcode) || null,
    reconnectRequired: Boolean(error?.reconnectRequired)
  };
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function atomicJsonWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function classifyMetaError(status, body) {
  const meta = body?.error || {};
  const code = Number(meta.code) || null;
  const subcode = Number(meta.error_subcode) || null;
  const transient = Boolean(meta.is_transient) || status >= 500;
  let category = transient ? "temporary" : "api";
  let reconnectRequired = false;
  if (status === 401 || code === 190 || [458, 459, 460, 463, 464, 467].includes(subcode)) {
    category = "authentication";
    reconnectRequired = true;
  } else if (status === 403 || [10, 200, 294].includes(code)) {
    category = "permissions";
    reconnectRequired = true;
  } else if (status === 429 || [4, 17, 32, 613].includes(code)) {
    category = "rate_limit";
  }
  return new SyncError(String(meta.message || `Meta respondió con HTTP ${status}.`), {
    category,
    httpStatus: status,
    metaCode: code,
    metaSubcode: subcode,
    reconnectRequired,
    retryable: transient || category === "rate_limit"
  });
}

async function request(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25_000) });
      if (response.ok) return response;
      let body = {};
      try { body = await response.clone().json(); } catch { /* Meta can return an HTML gateway error. */ }
      const error = classifyMetaError(response.status, body);
      if (!error.retryable || attempt === RETRY_DELAYS_MS.length) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof SyncError && !error.retryable) throw error;
      lastError = error instanceof SyncError ? error : new SyncError(error.message || "Error de red.", {
        category: "temporary",
        retryable: true
      });
      if (attempt === RETRY_DELAYS_MS.length) throw lastError;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  throw lastError;
}

async function requestJson(url, options) {
  const response = await request(url, options);
  try {
    return await response.json();
  } catch {
    throw new SyncError("Meta devolvió una respuesta inválida.", { category: "temporary", retryable: true });
  }
}

async function refreshInstagramLoginToken() {
  if (tokenMode !== "instagram-login" || process.env.INSTAGRAM_REFRESH_TOKEN === "false") return null;
  const url = new URL(`${INSTAGRAM_GRAPH_ORIGIN}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  try {
    const result = await requestJson(url);
    if (!result.access_token) return null;
    accessToken = String(result.access_token);
    await writeFile(TOKEN_HANDOFF_PATH, accessToken, { encoding: "utf8", mode: 0o600 });
    return {
      refreshed: true,
      expiresAt: result.expires_in ? new Date(Date.now() + Number(result.expires_in) * 1000).toISOString() : null
    };
  } catch (error) {
    // A refresh can be rejected when the token is too new. The regular request still
    // determines whether the current token is usable.
    if (error?.reconnectRequired) throw error;
    console.warn(`::warning::No se pudo renovar el token de Instagram Login: ${publicMessage(error)}`);
    return { refreshed: false, expiresAt: null };
  }
}

async function inspectFacebookToken() {
  const appId = String(process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || "").trim();
  if (tokenMode !== "facebook-page" || !appId || !appSecret) return null;
  const url = new URL(`${FACEBOOK_GRAPH_ORIGIN}/${FACEBOOK_GRAPH_VERSION}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const result = await requestJson(url);
  const data = result?.data || {};
  if (!data.is_valid) {
    throw new SyncError("El token de Meta ya no es válido.", {
      category: "authentication",
      reconnectRequired: true,
      metaCode: 190
    });
  }
  const expiresAt = Number(data.expires_at) > 0 ? new Date(Number(data.expires_at) * 1000).toISOString() : null;
  const secondsRemaining = Number(data.expires_at) > 0 ? Number(data.expires_at) - Math.floor(Date.now() / 1000) : null;
  return {
    valid: true,
    expiresAt,
    dataAccessExpiresAt: Number(data.data_access_expires_at) > 0
      ? new Date(Number(data.data_access_expires_at) * 1000).toISOString()
      : null,
    warning: secondsRemaining !== null && secondsRemaining < 14 * 24 * 60 * 60
      ? "El token vence en menos de 14 días. Reemplazalo por un token estable antes de que se corte la sincronización."
      : ""
  };
}

function graphUrl(endpoint) {
  const origin = tokenMode === "facebook-page" ? FACEBOOK_GRAPH_ORIGIN : INSTAGRAM_GRAPH_ORIGIN;
  return new URL(`${origin}/${FACEBOOK_GRAPH_VERSION}/${endpoint.replace(/^\//, "")}`);
}

async function fetchPosts() {
  const posts = [];
  let url = graphUrl(`${encodeURIComponent(instagramUserId)}/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
  url.searchParams.set("limit", String(Math.min(MAX_POSTS, 50)));
  url.searchParams.set("access_token", accessToken);

  while (url && posts.length < MAX_POSTS) {
    const result = await requestJson(url);
    if (Array.isArray(result.data)) posts.push(...result.data);
    const next = result?.paging?.next;
    url = next && posts.length < MAX_POSTS ? new URL(next) : null;
  }
  return posts.slice(0, MAX_POSTS);
}

function extensionFor(contentType, sourceUrl) {
  const types = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
  if (types[contentType]) return types[contentType];
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension) ? extension : ".jpg";
}

async function findExistingImage(postId) {
  for (const extension of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
    const candidate = path.join(IMAGE_DIRECTORY, `${postId}${extension}`);
    try {
      await access(candidate);
      return candidate.replaceAll("\\", "/");
    } catch { /* Try the next supported extension. */ }
  }
  return "";
}

async function cacheImage(post) {
  const sourceUrl = String(post.thumbnail_url || post.media_url || "");
  if (!sourceUrl) return "";
  const postId = String(post.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!postId) return "";
  const existing = await findExistingImage(postId);
  if (existing) return existing;

  try {
    const response = await request(sourceUrl);
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error(`Tipo de archivo no admitido: ${contentType || "desconocido"}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("La imagen está vacía o supera 15 MB.");
    await mkdir(IMAGE_DIRECTORY, { recursive: true });
    const filePath = path.join(IMAGE_DIRECTORY, `${postId}${extensionFor(contentType, sourceUrl)}`);
    await writeFile(filePath, bytes);
    return filePath.replaceAll("\\", "/");
  } catch (error) {
    console.warn(`::warning::No se pudo guardar la imagen de la publicación ${postId}: ${error.message}`);
    return sourceUrl;
  }
}

async function main() {
  const attemptedAt = new Date().toISOString();
  const previousFeed = await readJson(FEED_PATH, { connected: false, username: "", updatedAt: "", posts: [] });
  const previousStatus = await readJson(STATUS_PATH, {});
  const username = configuredUsername || String(previousFeed.username || "").replace(/^@/, "").trim();

  try {
    if (!accessToken || !instagramUserId) {
      throw new SyncError("Faltan INSTAGRAM_USER_ID y un token privado de Instagram en GitHub Secrets.", {
        category: "configuration"
      });
    }
    const refresh = await refreshInstagramLoginToken();
    const token = await inspectFacebookToken();
    const rawPosts = await fetchPosts();
    const posts = [];
    for (const post of rawPosts) {
      posts.push({
        id: String(post.id || ""),
        caption: String(post.caption || ""),
        mediaType: String(post.media_type || ""),
        image: await cacheImage(post),
        permalink: String(post.permalink || ""),
        timestamp: String(post.timestamp || "")
      });
    }

    const completedAt = new Date().toISOString();
    await atomicJsonWrite(FEED_PATH, {
      schemaVersion: 2,
      connected: true,
      stale: false,
      username,
      updatedAt: completedAt,
      posts
    });
    await atomicJsonWrite(STATUS_PATH, {
      schemaVersion: 1,
      state: token?.warning ? "warning" : "ok",
      tokenMode,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: completedAt,
      postCount: posts.length,
      token: token ? {
        valid: token.valid,
        expiresAt: token.expiresAt,
        dataAccessExpiresAt: token.dataAccessExpiresAt,
        warning: token.warning
      } : {
        valid: true,
        expiresAt: refresh?.expiresAt || null,
        warning: refresh && !refresh.refreshed ? "No se pudo renovar el token en este intento." : ""
      },
      error: null
    });
    console.log(`Instagram sincronizado: ${posts.length} publicaciones. Las imágenes quedaron guardadas localmente.`);
  } catch (error) {
    const safeError = sanitizeError(error);
    await atomicJsonWrite(STATUS_PATH, {
      schemaVersion: 1,
      state: safeError.reconnectRequired ? "reconnect_required" : "error",
      tokenMode,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: previousFeed.updatedAt || previousStatus.lastSuccessAt || null,
      postCount: Array.isArray(previousFeed.posts) ? previousFeed.posts.length : 0,
      token: null,
      error: safeError
    });
    console.error(`::error title=Instagram no se pudo sincronizar::${safeError.message}`);
    process.exitCode = 1;
  } finally {
    if (tokenMode !== "instagram-login") {
      try { await unlink(TOKEN_HANDOFF_PATH); } catch { /* It normally does not exist. */ }
    }
  }
}

await main();
