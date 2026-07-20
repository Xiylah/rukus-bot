/**
 * Built-in adult-site blocklist.
 *
 * A curated list of domains rather than keyword matching on the URL. Keyword
 * matching is what timed a member out for a gif slug reading "crypto": words
 * like "sex", "xxx" and "adult" appear in ordinary hostnames (essex.ac.uk,
 * sussex.gov.uk, adultswim.com, middlesex.edu) and in the slugs of perfectly
 * normal gifs, so scoring text is the wrong instrument here. A domain either is
 * a porn site or it is not, and that is a fact about the domain.
 *
 * Matching is suffix-anchored via domainMatches, so listing "pornhub.com"
 * covers www. and any subdomain, and a lookalike like pornhub.com.evil.ru does
 * NOT match (it is a different registrable domain).
 *
 * This cannot be exhaustive: there are endless adult sites and new ones daily.
 * It covers the large, well-known ones a member is realistically going to
 * paste. Servers needing more add their own to blockedDomains, which is
 * enforced identically.
 */
export const ADULT_DOMAINS = [
  // major tube sites
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "redtube.com",
  "youporn.com",
  "tube8.com",
  "spankbang.com",
  "eporner.com",
  "txxx.com",
  "hclips.com",
  "upornia.com",
  "porntrex.com",
  "beeg.com",
  "tnaflix.com",
  "empflix.com",
  "porn.com",
  "pornone.com",
  "yourporn.sexy",
  "sxyprn.com",
  "porngo.com",
  "hqporner.com",
  "youjizz.com",
  "motherless.com",
  "thumbzilla.com",
  "pornhd.com",
  "drtuber.com",
  "nuvid.com",
  "sunporno.com",
  "vporn.com",
  "gotporn.com",

  // cam and live
  "chaturbate.com",
  "stripchat.com",
  "bongacams.com",
  "cam4.com",
  "myfreecams.com",
  "livejasmin.com",
  "camsoda.com",
  "flirt4free.com",
  "streamate.com",

  // paid / creator platforms
  "onlyfans.com",
  "fansly.com",
  "manyvids.com",
  "clips4sale.com",
  "brazzers.com",
  "bangbros.com",
  "realitykings.com",
  "naughtyamerica.com",
  "digitalplayground.com",
  "evilangel.com",
  "blacked.com",
  "tushy.com",
  "vixen.com",
  "deeper.com",
  "adulttime.com",
  "playboy.com",
  "penthouse.com",

  // image boards and galleries
  "rule34.xxx",
  "rule34video.com",
  "e621.net",
  "e-hentai.org",
  "exhentai.org",
  "nhentai.net",
  "nhentai.xxx",
  "hanime.tv",
  "hentaihaven.xxx",
  "hentai2read.com",
  "hitomi.la",
  "gelbooru.com",
  "danbooru.donmai.us",
  "konachan.com",
  "yande.re",
  "sankakucomplex.com",
  "imagefap.com",
  "erome.com",
  "porn3dx.com",
  "multporn.net",
  "luscious.net",
  "hentaifox.com",
  "simply-hentai.com",

  // aggregators, forums and link hubs
  "theporndude.com",
  "scrolller.com",
  "porndude.com",
  "fapello.com",
  "coomer.su",
  "coomer.party",
  "kemono.su",
  "kemono.party",
  "thothub.tv",
  "thothub.lol",
  "leakedzone.com",
  "influencersgonewild.com",
  "bitchesgirls.com",
  "nudostar.com",

  // escort / dating-adjacent adult
  "adultfriendfinder.com",
  "ashleymadison.com",
  "escortdirectory.com",
  "slixa.com",
  "tryst.link",
];
