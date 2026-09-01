// @ts-check
// The seller's "voice". Numbers are decided by negotiation.js before this file
// is consulted — an LLM may only phrase the message, never move a price. With
// no ANTHROPIC_API_KEY (or on any error) deterministic Norwegian templates run.

/**
 * @typedef {object} VoiceParams
 * @property {string} title
 * @property {number} [offer]        The buyer's latest offer in NOK
 * @property {number} [sellerOffer]  The seller's authoritative price in NOK
 * @property {number} [dealPrice]    The sealed deal price in NOK
 */

/** @type {Record<string, ((p: VoiceParams) => string)[]>} */
const T = {
  accept: [
    (p) => `Da har vi en avtale! ${p.dealPrice} kr for ${p.title} — godt forhandlet. Bruk rabattkoden i kassen.`,
    (p) => `Solgt! ${p.dealPrice} kr. Du pruter bedre enn de fleste roboter jeg har møtt.`,
  ],
  counter: [
    (p) => `Hmm, ${p.offer} kr er i underkant for ${p.title}. Jeg kan strekke meg til ${p.sellerOffer} kr.`,
    (p) => `Nesten! Denne går sjelden under ${p.sellerOffer} kr — men da er den din.`,
    (p) => `Du forhandler hardt. ${p.sellerOffer} kr, og jeg spanderer godt humør på kjøpet.`,
  ],
  reject: [
    (p) => `${p.offer} kr? For en ${p.title}?! Nå tuller du. ${p.sellerOffer} kr er mitt svar.`,
    (p) => `Haha, nei. Den prisen sykler jeg ikke på. ${p.sellerOffer} kr.`,
  ],
  final: [
    (p) => `Siste tilbud: ${p.sellerOffer} kr. Ta det eller kom innom butikken i Skien og prut ansikt til ansikt.`,
  ],
  closed: [() => `Denne forhandlingen er avsluttet. Start en ny om du vil prøve igjen.`],
};

/**
 * @param {string} kind
 * @param {VoiceParams} params
 * @param {number} round
 * @returns {string}
 */
function template(kind, params, round) {
  const list = T[kind] || T.closed;
  return list[round % list.length](params);
}

/**
 * Phrase the seller's reply. All numbers in `params` are already decided and
 * clamped by the negotiation engine — this function only chooses words.
 * @param {string} kind   Decision kind: accept | counter | reject | final | closed
 * @param {VoiceParams} params
 * @param {number} round  Current round, used to vary the template
 * @returns {Promise<string>}
 */
export async function sellerMessage(kind, params, round) {
  const fallback = template(kind, params, round);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.SELLER_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system:
          'Du er en sjarmerende, litt vittig sykkelselger i Skien. Skriv ETT kort svar på norsk (maks 2 setninger). ' +
          'Du MÅ bruke nøyaktig prisene du får oppgitt — aldri nevn andre tall, aldri lov mer rabatt.',
        messages: [
          {
            role: 'user',
            content: `Situasjon: ${kind}. Produkt: ${params.title}. Kundens bud: ${params.offer ?? '-'} kr. Ditt tilbud/pris: ${params.sellerOffer ?? params.dealPrice} kr. Skriv svaret ditt.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback;
    const body = /** @type {any} */ (await res.json());
    const text = (body.content?.[0]?.text || '').trim();
    // Guard: the phrased message must mention the authoritative number.
    const mustMention = String(params.sellerOffer ?? params.dealPrice);
    if (!text || !text.includes(mustMention)) return fallback;
    return text;
  } catch {
    return fallback;
  }
}
