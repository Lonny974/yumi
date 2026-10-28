// Fonction Supabase « lire-publication » : reçoit le lien d'une publication Instagram ou Facebook,
// lit sa légende et sa photo comme le fait un aperçu de lien, et les renvoie à Yumi.
// Avec { enregistrer: true }, elle range aussi la recette dans la file a_importer (pour le raccourci iOS).
// Si Instagram ou Facebook refusent l'aperçu et que le secret BRIGHTDATA_API_KEY existe, elle passe par
// l'API Web Scraper de Bright Data. La clé reste dans les secrets Supabase, jamais dans le code.
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
    .split(String.fromCharCode(8232)).join("\n").split(String.fromCharCode(8233)).join("\n");

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

// Identifiants des scrapers Bright Data (modifiables par secrets si Bright Data les change).
const SCRAPERS = {
  instagramPost: Deno.env.get("BRIGHTDATA_INSTAGRAM_POSTS") ?? "gd_lk5ns7kz21pck8jpis",
  instagramReel: Deno.env.get("BRIGHTDATA_INSTAGRAM_REELS") ?? "gd_lyclm20il4r5helnj",
  facebookPost: Deno.env.get("BRIGHTDATA_FACEBOOK_POSTS") ?? "gd_lyclm1571iy3mv57zw",
};
const premier = (o: any, cles: string[]) => {
  for (const c of cles) {
    const v = c.split(".").reduce((x, k) => (x == null ? x : x[/^\d+$/.test(k) ? +k : k]), o);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};
// Lit la publication avec l'API Web Scraper de Bright Data : renvoie { texte, image } ou null.
async function brightData(url: string, hote: string) {
  const cle = Deno.env.get("BRIGHTDATA_API_KEY");
  if (!cle) return null;
  const dataset = /facebook|fb\./.test(hote) ? SCRAPERS.facebookPost : /\/reels?\//.test(url) ? SCRAPERS.instagramReel : SCRAPERS.instagramPost;
  const auth = { Authorization: `Bearer ${cle}` };
  let r = await fetch(`https://api.brightdata.com/datasets/v3/scrape?dataset_id=${dataset}&format=json&include_errors=true`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ input: [{ url }] }),
  });
  let data = await r.json().catch(() => null);
  if (r.status === 202 && data?.snapshot_id) {
    // Lecture plus longue que prévu : on attend le résultat jusqu'à ~2 minutes.
    for (let i = 0; i < 24; i++) {
      await new Promise((ok) => setTimeout(ok, 5000));
      const etat = await (await fetch(`https://api.brightdata.com/datasets/v3/progress/${data.snapshot_id}`, { headers: auth })).json();
      if (etat.status === "failed") return null;
      if (etat.status === "ready") {
        r = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${data.snapshot_id}?format=json`, { headers: auth });
        data = await r.json().catch(() => null);
        break;
      }
    }
  }
  const post = Array.isArray(data) ? data[0] : data;
  if (!post || post.error) { console.error("Bright Data", r.status, JSON.stringify(data).slice(0, 500)); return null; }
  return {
    texte: premier(post, ["description", "caption", "content", "post_text", "text", "title"]),
    image: premier(post, ["thumbnail", "display_url", "image_url", "photos.0", "images.0", "post_image", "attachments.0.url", "attachments.0.image"]),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "Méthode non permise" }, 405);
  const corps = await req.json().catch(() => ({}));
  const url = (String(corps.url ?? "").match(/https?:\/\/\S+/) ?? [""])[0];
  let hote = "";
  try { hote = new URL(url).hostname; } catch { /* lien invalide */ }
  if (!HOTES.test(hote)) return json({ erreur: "Envoie un lien Instagram ou Facebook." }, 400);

  let texte = "", image = "", img = "";
  // 1. Lecture gratuite, comme un aperçu de lien.
  try {
    const page = await fetch(url, {
      headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Accept-Language": "fr-FR,fr;q=0.9" },
      redirect: "follow",
    });
    const html = await page.text();
    const desc = legende(meta(html, "og:description") || meta(html, "description"));
    const titre = legende(meta(html, "og:title"));
    texte = titre.length > desc.length + 20 ? titre : desc;
    img = meta(html, "og:image");
  } catch (e) {
    console.error("aperçu impossible", url, e);
  }
  // Page de connexion à la place de la publication : on ne garde pas ce texte.
  if (texte.length < 200 && /log ?in|sign up|connecte-toi|connectez-vous|inscri|create an account|see posts|voir les publications/i.test(texte)) texte = "";
  // 2. Si rien n'a été lu : Bright Data, quand la clé est configurée.
  if (!texte) {
    try {
      const bd = await brightData(url, hote);
      if (bd) { texte = bd.texte; img = bd.image || img; }
    } catch (e) {
      console.error("Bright Data impossible", url, e);
    }
  }
  try {
    if (img) {
      const r = await fetch(img);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (r.ok && buf.length < 2_000_000) image = `data:${r.headers.get("content-type") || "image/jpeg"};base64,${encodeBase64(buf)}`;
    }
  } catch (e) {
    console.error("photo impossible", img, e);
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
