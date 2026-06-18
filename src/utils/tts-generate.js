'use strict';
// Shared TTS buffer generation helper (used by api.js and admin.js)
// Tries Google TTS first for speed ≤ 1.0, falls back to Edge TTS.

const https = require('https');

const EDGE_TTS_VOICES = {
  'af':'af-ZA-AdriNeural','sq':'sq-AL-AnilaNeural','am':'am-ET-AmehaNeural',
  'ar':'ar-SA-ZariyahNeural','az':'az-AZ-BabekNeural','bn':'bn-BD-NabanitaNeural',
  'bs':'bs-BA-VesnaNeural','bg':'bg-BG-KalinaNeural','my':'my-MM-NilarNeural',
  'ca':'ca-ES-JoanaNeural','zh':'zh-CN-XiaoxiaoNeural','zh-tw':'zh-TW-HsiaoChenNeural',
  'zh-hk':'zh-HK-HiuGaaiNeural','hr':'hr-HR-GabrijelaNeural','cs':'cs-CZ-VlastaNeural',
  'da':'da-DK-ChristelNeural','nl':'nl-NL-ColetteNeural','en':'en-US-JennyNeural',
  'et':'et-EE-AnuNeural','fil':'fil-PH-BlessicaNeural','fi':'fi-FI-SelmaNeural',
  'fr':'fr-FR-DeniseNeural','gl':'gl-ES-SabelaNeural','ka':'ka-GE-EkaNeural',
  'de':'de-DE-KatjaNeural','el':'el-GR-AthinaNeural','gu':'gu-IN-DhwaniNeural',
  'he':'he-IL-HilaNeural','hi':'hi-IN-SwaraNeural','hu':'hu-HU-NoemiNeural',
  'is':'is-IS-GudrunNeural','id':'id-ID-GadisNeural','ga':'ga-IE-OrlaNeural',
  'it':'it-IT-ElsaNeural','ja':'ja-JP-NanamiNeural','jv':'jv-ID-SitiNeural',
  'kn':'kn-IN-SapnaNeural','kk':'kk-KZ-AigulNeural','km':'km-KH-SreymomNeural',
  'ko':'ko-KR-SunHiNeural','lo':'lo-LA-KeomanyNeural','lv':'lv-LV-EveritaNeural',
  'lt':'lt-LT-OnaNeural','mk':'mk-MK-MarijaNeural','ms':'ms-MY-YasminNeural',
  'ml':'ml-IN-SobhanaNeural','mt':'mt-MT-GraceNeural','mr':'mr-IN-AarohiNeural',
  'mn':'mn-MN-YesuiNeural','ne':'ne-NP-HemkalaNeural','nb':'nb-NO-PernilleNeural',
  'ps':'ps-AF-LatifaNeural','fa':'fa-IR-DilaraNeural','pl':'pl-PL-ZofiaNeural',
  'pt':'pt-PT-RaquelNeural','pt-br':'pt-BR-FranciscaNeural','ro':'ro-RO-AlinaNeural',
  'ru':'ru-RU-SvetlanaNeural','sr':'sr-RS-SophieNeural','si':'si-LK-ThiliniNeural',
  'sk':'sk-SK-ViktoriaNeural','sl':'sl-SI-PetraNeural','so':'so-SO-UbaxNeural',
  'es':'es-ES-ElviraNeural','su':'su-ID-TutiNeural','sw':'sw-KE-ZuriNeural',
  'sv':'sv-SE-SofieNeural','ta':'ta-IN-PallaviNeural','te':'te-IN-ShrutiNeural',
  'th':'th-TH-PremwadeeNeural','tr':'tr-TR-EmelNeural','uk':'uk-UA-PolinaNeural',
  'ur':'ur-PK-UzmaNeural','uz':'uz-UZ-MadinaNeural','vi':'vi-VN-HoaiMyNeural',
  'cy':'cy-GB-NiaNeural'
};

function wordDisplay(w) {
  const article = w.article || '';
  const separator = article && !article.endsWith("'") && !article.endsWith("\u2019") ? ' ' : '';
  return (article ? article + separator : '') +
    (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
}

function speedToEdgeRate(speed) {
  const pct = Math.round(speed * 100);
  return pct >= 100 ? `+${pct - 100}%` : `-${100 - pct}%`;
}

let _MsEdgeTTS = null, _OUTPUT_FORMAT = null;
function loadMsEdgeTTS() {
  if (!_MsEdgeTTS) {
    try {
      const mod = require('msedge-tts');
      _MsEdgeTTS = mod.MsEdgeTTS;
      _OUTPUT_FORMAT = mod.OUTPUT_FORMAT;
    } catch { throw new Error('msedge-tts not installed'); }
  }
  return { MsEdgeTTS: _MsEdgeTTS, OUTPUT_FORMAT: _OUTPUT_FORMAT };
}

async function bufferTTS(text, langCode, speed) {
  const lc = langCode.toLowerCase();

  if (speed <= 1.0) {
    try {
      const sp  = speed !== 1.0 ? '&ttsspeed=' + speed.toFixed(2) : '';
      const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=' +
        encodeURIComponent(lc) + '&q=' + encodeURIComponent(text) +
        '&client=tw-ob' + sp;
      return await new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
          if (r.statusCode !== 200) return reject(new Error('Google TTS HTTP ' + r.statusCode));
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      });
    } catch { /* fall through */ }
  }

  const voice = EDGE_TTS_VOICES[lc] || EDGE_TTS_VOICES[lc.split('-')[0]] || null;
  if (!voice) throw new Error('No edge-tts voice for: ' + langCode);
  const { MsEdgeTTS, OUTPUT_FORMAT } = loadMsEdgeTTS();
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: speedToEdgeRate(speed) });
  return new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on('data', c => chunks.push(c));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

module.exports = { bufferTTS, EDGE_TTS_VOICES, wordDisplay };
