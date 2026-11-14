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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST seulement" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ code: "no_key", error: "ANTHROPIC_API_KEY manquante" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const { mode, image } = body;
  const code = String(body.code || "").toUpperCase();

  if (typeof image !== "string" || !image || image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return res.status(400).json({ error: "Image invalide ou trop lourde" });
  }
  let prompt;
  if (mode === "list") prompt = LIST_PROMPT;
  else if (mode === "find" && /^[A-Z0-9]{1,8}$/.test(code)) prompt = findPrompt(code);
  else return res.status(400).json({ error: "Demande invalide" });

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
        max_tokens: mode === "list" ? 4096 : 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              { type: "text", text: prompt },
            ],
          },
        ],
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
