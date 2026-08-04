import { mkdir, writeFile } from "node:fs/promises";

const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN || "";
const instagramUserId = process.env.INSTAGRAM_USER_ID || "";
const username = process.env.INSTAGRAM_USERNAME || "arvel.customsy2k";

if (!accessToken || !instagramUserId) {
  throw new Error("Faltan INSTAGRAM_USER_ID y FACEBOOK_PAGE_ACCESS_TOKEN en GitHub Secrets.");
}

const url = new URL(`https://graph.facebook.com/v26.0/${encodeURIComponent(instagramUserId)}/media`);
url.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
url.searchParams.set("limit", "50");
url.searchParams.set("access_token", accessToken);

const response = await fetch(url);
const result = await response.json();
if (!response.ok) throw new Error(result?.error?.message || "Meta rechazó la lectura del feed.");

const posts = Array.isArray(result.data) ? result.data.map((post) => ({
  id: String(post.id || ""),
  caption: String(post.caption || ""),
  mediaType: String(post.media_type || ""),
  image: String(post.thumbnail_url || post.media_url || ""),
  permalink: String(post.permalink || ""),
  timestamp: String(post.timestamp || "")
})) : [];

await mkdir("data", { recursive: true });
await writeFile("data/instagram-feed.json", `${JSON.stringify({
  connected: true,
  username,
  updatedAt: new Date().toISOString(),
  posts
}, null, 2)}\n`, "utf8");

console.log(`Instagram sincronizado: ${posts.length} publicaciones.`);
