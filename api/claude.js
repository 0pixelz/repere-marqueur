// Fonction serverless Vercel : reçoit une tuile de la photo et demande à Claude de lire les codes.
// La clé reste côté serveur (variable d'environnement ANTHROPIC_API_KEY).
// Les consignes sont écrites ici, pas dans le navigateur : l'endpoint ne sert qu'à cette app.

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_IMAGE_BASE64 = 3_500_000; // ~2,6 Mo d'image, sous la limite de 4,5 Mo de Vercel

const LIST_PROMPT =
  "This photo shows alcohol markers standing upright in a case, seen from above. Each round cap carries a printed label with a colour code " +
  "(examples: BV312, YR57, G41, BGY18, FY01, 120, 0) and a colour name. Labels can be rotated or upside-down.\n" +
  "List every cap whose code you can read with confidence. Do not guess a code.\n" +
  'For every cap that is fully visible but whose code you cannot read (glare, shiny cap, blur, label worn off), add an item with "code":"?" and an empty name, at its centre. ' +
  "Leave out caps that are cut by the image edge.\n" +
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

// Assistant : conversation sur les couleurs. Claude choisit uniquement parmi les marqueurs de la trousse.
function chatRequest(messages, palette) {
  if (!Array.isArray(messages) || !Array.isArray(palette) || palette.length === 0 || palette.length > 600) return null;
  const lines = [];
  for (const p of palette) {
    const code = String((p && p.code) || "").toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(code)) continue;
    const name = String((p && p.name) || "").replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, 40);
    const hex = /^#[0-9a-f]{6}$/i.test(String((p && p.hex) || "")) ? p.hex : "";
    lines.push(code + " | " + name + (hex ? " | " + hex : ""));
  }
  const turns = [];
  for (const m of messages.slice(-12)) {
    const role = m && m.role === "assistant" ? "assistant" : m && m.role === "user" ? "user" : null;
    const text = String((m && m.content) || "").trim().slice(0, 1500);
    if (!role || !text) continue;
    if (!turns.length && role !== "user") continue;                    // must start with the user
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += "\n" + text;
    else turns.push({ role, content: text });
  }
  if (!lines.length || !turns.length || turns[turns.length - 1].role !== "user") return null;
  const system =
    "Tu es l'assistant d'une app pour dessiner aux marqueurs à alcool. Tu réponds en français, de façon naturelle et brève (2 à 4 phrases).\n" +
    "Voici les marqueurs que la personne possède, un par ligne : code | nom | couleur mesurée sur une photo " +
    "(approximative : fie-toi d'abord au nom et à la famille du code, ex. B = bleu, BG = bleu-vert, BV = bleu-violet, YR = jaune-rouge, E = terre, CG/WG/GG = gris).\n" +
    "<marqueurs>\n" + lines.join("\n") + "\n</marqueurs>\n\n" +
    "Structure d'un code : les lettres donnent la famille de couleur ; le premier chiffre est le niveau de saturation (0 à 9, 0 = teinte la plus pure, plus haut = plus grisée) ; " +
    "le ou les derniers chiffres donnent la luminosité de 0 (très clair) à 16 (très foncé). Exemple : YR111 = famille YR, saturation 1, luminosité 11. " +
    "Les couleurs d'une même famille et d'un même niveau de saturation se fondent le mieux : privilégie-les pour un fade, en variant la luminosité. " +
    "Les codes 0 (blender incolore) et 120 (noir) sont à part.\n\n" +
    "Quand la demande porte sur des couleurs à utiliser (un sujet à dessiner, un dégradé ou « fade », quoi marier avec un code donné, des ombres, etc.), " +
    "choisis 3 à 7 marqueurs UNIQUEMENT dans cette liste, jamais un code absent. Pour un fade, prends des teintes voisines classées du plus clair au plus foncé, " +
    "et garde la couleur de départ si la personne en nomme une (un « numéro » ou « # » de couleur désigne un code de la liste). " +
    "Si un code demandé n'est pas dans la liste, dis-le et propose le plus proche. " +
    "Si une image est jointe, c'est le dessin de la personne : un coloriage vierge (traits noirs sans couleur), un croquis, ou un coloriage en cours. " +
    "Commence par dire en une phrase ce que tu y vois : la scène, les objets et, s'il s'agit de personnages connus, lesquels. " +
    "Pour un coloriage vierge, propose les couleurs zone par zone (ex. peau, cheveux, vêtements, bateau, mer, ciel) : les couleurs habituelles des personnages reconnus, " +
    "sinon des couleurs naturelles pour le sujet. Donne pour chaque zone importante une base et, si possible, un ton plus foncé de la même famille pour les ombres. " +
    "Pour un coloriage déjà commencé, respecte les couleurs en place et propose la suite. " +
    "Avec une image, tu peux choisir jusqu'à 16 marqueurs ; « role » nomme alors la zone et l'usage (ex. « salopette, base », « mer, ombre »). " +
    "Si une couleur nécessaire manque dans la liste, propose la plus proche et dis-le. " +
    "Pour une question générale sans choix de couleurs, laisse la liste vide. Ne traite que de dessin, de couleurs et de marqueurs.\n" +
    "Réponds UNIQUEMENT avec ce JSON, sans texte autour :\n" +
    '{"reponse":"ta réponse, avec la technique en une phrase","marqueurs":[{"code":"B02","role":"2 à 4 mots : base claire, transition, ombre, reflet…"}]}';
  return { system, messages: turns };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST seulement" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ code: "no_key", error: "ANTHROPIC_API_KEY manquante" });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const { mode, image } = body;
  const code = String(body.code || "").toUpperCase();

  let content, maxTokens;
  let system;
  if (mode === "chat") {
    const chat = chatRequest(body.messages, body.palette);
    if (!chat) return res.status(400).json({ error: "Demande invalide" });
    if (image !== undefined && image !== "") {
      // a drawing attached to the last message
      if (typeof image !== "string" || image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
        return res.status(400).json({ error: "Image invalide ou trop lourde" });
      }
      const last = chat.messages[chat.messages.length - 1];
      last.content = [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: last.content },
      ];
    }
    system = chat.system;
    content = chat.messages;
    maxTokens = 2200;
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
        ...(system ? { system, messages: content } : { messages: [{ role: "user", content }] }),
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
