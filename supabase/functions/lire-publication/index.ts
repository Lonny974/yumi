// Fonction Supabase « lire-publication » : reçoit le lien d'une publication Instagram ou Facebook,
// lit sa légende et sa photo comme le fait un aperçu de lien, et les renvoie à Yumi.
// Avec { enregistrer: true }, elle range aussi la recette dans la file a_importer (pour le raccourci iOS).
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const HOTES = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.watch)$/i;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ENTITES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m)
    .replace(/[\u2028\u2029]/g, "\n");

function meta(html: string, nom: string) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)="${nom}"[^>]*content="([^"]*)"`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="${nom}"`, "i"));
  return decode((a || b)?.[1] ?? "").trim();
}
// « 1 234 likes, 56 comments - compte on 3 octobre 2026: "la légende" » → « la légende »
function legende(s: string) {
  const i = s.search(/:\s*["“«]/);
  if (i >= 0 && i < 250) s = s.slice(i).replace(/^:\s*["“«]\s*/, "").replace(/\s*["”»]\s*\.?\s*$/, "");
  return s.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "Méthode non permise" }, 405);
  const corps = await req.json().catch(() => ({}));
  const url = (String(corps.url ?? "").match(/https?:\/\/\S+/) ?? [""])[0];
  let hote = "";
  try { hote = new URL(url).hostname; } catch { /* lien invalide */ }
  if (!HOTES.test(hote)) return json({ erreur: "Envoie un lien Instagram ou Facebook." }, 400);

  let texte = "", image = "", titre = "";
  try {
    const page = await fetch(url, {
      headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Accept-Language": "fr-FR,fr;q=0.9" },
      redirect: "follow",
    });
    const html = await page.text();
    const desc = legende(meta(html, "og:description") || meta(html, "description"));
    titre = legende(meta(html, "og:title"));
    texte = titre.length > desc.length + 20 ? titre : desc;
    const img = meta(html, "og:image");
    if (img) {
      const r = await fetch(img);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (r.ok && buf.length < 2_000_000) image = `data:${r.headers.get("content-type") || "image/jpeg"};base64,${encodeBase64(buf)}`;
    }
  } catch (e) {
    console.error("lecture impossible", url, e);
  }

  if (corps.enregistrer) {
    const base = Deno.env.get("SUPABASE_URL"), cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    await fetch(`${base}/rest/v1/a_importer`, {
      method: "POST",
      headers: { apikey: cle!, Authorization: `Bearer ${cle}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ url, texte, image }),
    });
  }
  return json({ url, texte, image, lu: !!texte });
});
