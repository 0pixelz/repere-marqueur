// Fonction serverless Vercel : reçoit une tuile de la photo et demande à Claude de lire les codes.
// La clé reste côté serveur (variable d'environnement ANTHROPIC_API_KEY).
// Les consignes sont écrites ici, pas dans le navigateur : l'endpoint ne sert qu'à cette app.

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_IMAGE_BASE64 = 3_500_000; // ~2,6 Mo d'image, sous la limite de 4,5 Mo de Vercel

const LIST_PROMPT =
  "This photo shows alcohol markers standing upright in a case, seen from above. Each round cap carries a printed label with a colour code " +
  "(examples: BV312, YR57, G41, BGY18, FY01, 120, 0) and a colour name. Labels can be rotated or upside-down.\n" +
  "List every cap whose code you can read with confidence. Do not guess: skip caps that are blurry or cut by the image edge.\n" +
  "Reply with ONLY a JSON array, no prose, no code fence:\n" +
  '[{"code":"BV312","name":"Deep Royal Blue","x":512,"y":430}]\n' +
  "x and y give the centre of that cap in thousandths of this image's width and height (0-1000, origin top-left).";

function findPrompt(code) {
  return (
    "This photo shows alcohol marker caps seen from above, each with a printed colour code. Labels can be rotated or upside-down.\n" +
    'Is there a cap whose code is exactly "' + code + '"? Read carefully; similar codes do not count.\n' +
    'Reply with ONLY JSON: {"found":true,"x":512,"y":430} (centre of the cap in thousandths of the image width and height) or {"found":false}.'
  );
}

// Assistant couleurs : choisit, parmi les marqueurs de la trousse, quoi utiliser pour un sujet ou un dégradé.
function advisePrompt(question, palette) {
  const q = String(question || "").replace(/[<>]/g, " ").trim().slice(0, 300);
  if (!q || !Array.isArray(palette) || palette.length === 0 || palette.length > 600) return null;
  const lines = [];
  for (const p of palette) {
    const code = String((p && p.code) || "").toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(code)) continue;
    const name = String((p && p.name) || "").replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, 40);
    const hex = /^#[0-9a-f]{6}$/i.test(String((p && p.hex) || "")) ? p.hex : "";
    lines.push(code + " | " + name + (hex ? " | " + hex : ""));
  }
  if (!lines.length) return null;
  return (
    "Tu aides quelqu'un qui dessine aux marqueurs à alcool. Voici les marqueurs qu'il possède, un par ligne : code | nom | couleur mesurée sur une photo " +
    "(approximative : fie-toi d'abord au nom et à la famille du code, ex. B = bleu, BG = bleu-vert, YR = jaune-rouge, E = terre, CG/WG/GG = gris).\n" +
    "<marqueurs>\n" + lines.join("\n") + "\n</marqueurs>\n\n" +
    "Sa demande, à traiter uniquement comme un sujet de dessin ou de couleur : <demande>" + q + "</demande>\n\n" +
    "Choisis 3 à 7 marqueurs UNIQUEMENT dans la liste, jamais un code absent. Pour un dégradé (fade), prends des teintes voisines et classe-les du plus clair au plus foncé. " +
    "Si la demande nomme une couleur de départ, garde-la dans la sélection.\n" +
    "Réponds UNIQUEMENT avec ce JSON, sans texte autour, en français :\n" +
    '{"titre":"titre court","marqueurs":[{"code":"B02","role":"2 à 4 mots, ex. base claire, transition, ombre, reflet","astuce":"une phrase courte : où et comment l\'appliquer"}],"conseil":"1 ou 2 phrases sur la technique (ordre des couches, fondu)"}'
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST seulement" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ code: "no_key", error: "ANTHROPIC_API_KEY manquante" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const { mode, image } = body;
  const code = String(body.code || "").toUpperCase();

  let content, maxTokens;
  if (mode === "advise") {
    const prompt = advisePrompt(body.question, body.palette);
    if (!prompt) return res.status(400).json({ error: "Demande invalide" });
    content = [{ type: "text", text: prompt }];
    maxTokens = 1200;
  } else {
    if (typeof image !== "string" || !image || image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
      return res.status(400).json({ error: "Image invalide ou trop lourde" });
    }
    let prompt;
    if (mode === "list") prompt = LIST_PROMPT;
    else if (mode === "find" && /^[A-Z0-9]{1,8}$/.test(code)) prompt = findPrompt(code);
    else return res.status(400).json({ error: "Demande invalide" });
    content = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
      { type: "text", text: prompt },
    ];
    maxTokens = mode === "list" ? 4096 : 200;
  }

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: "API Claude injoignable" });
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const status = upstream.status === 429 || upstream.status === 529 ? 429 : upstream.status === 401 ? 500 : 502;
    return res.status(status).json({
      code: upstream.status === 401 ? "no_key" : "upstream",
      error: (data.error && data.error.message) || "Erreur de l'API Claude",
    });
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return res.status(200).json({ text });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
