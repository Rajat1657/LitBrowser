/**
 * Lit Browser - Network-level Ad Blocker & Privacy Engine
 * 
 * Blocks ads, trackers, analytics, popups, and annoyances at the network level
 * using Electron's webRequest API. Adds Do Not Track headers and strips third-party
 * tracking cookies.
 * 
 * @module core/adblocker
 */

'use strict';

/**
 * Default URL path patterns associated with ads, trackers, and beacons.
 * A request is blocked if its URL path contains any of these patterns.
 */
const DEFAULT_URL_PATTERNS = [
  '/ad/',
  '/ads/',
  '/adserver/',
  '/adframe/',
  '/adbanner/',
  '/adx/',
  '/tracker/',
  '/tracking/',
  '/pixel/',
  '/beacon/',
  '/collect',
  '/popup/',
  '/popunder/',
  '/banner',
  '/sponsor'
];

/**
 * Common multi-part / second-level ccTLDs for accurate base domain extraction.
 */
const SECOND_LEVEL_TLDS = new Set([
  'co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'net.au', 'org.uk',
  'gov.uk', 'ac.uk', 'com.sg', 'com.tw', 'co.kr', 'com.mx', 'edu.au', 'org.au',
  'com.tr', 'co.za', 'com.ar', 'com.pk', 'com.ng', 'com.eg', 'com.co'
]);

/**
 * Comprehensive list of known ad networks, trackers, analytics providers,
 * popups, malvertising hosts, and telemetry domains (400+ entries).
 */
const DEFAULT_BLOCKED_DOMAINS = [
  // --- Google Ads, Syndication & Ad Services ---
  'googleadservices.com',
  'googlesyndication.com',
  'doubleclick.net',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'adservice.google.ca',
  'adservice.google.co.uk',
  'adservice.google.de',
  'adservice.google.fr',
  'adservice.google.it',
  'adservice.google.nl',
  'adservice.google.es',
  'googleads.g.doubleclick.net',
  'stats.g.doubleclick.net',
  'cm.g.doubleclick.net',
  'securepubads.g.doubleclick.net',
  'pagead.l.doubleclick.net',
  'partnerad.l.doubleclick.net',
  'doubleclickbygoogle.com',
  'pagead2.googleadservices.com',
  'partner.googleadservices.com',
  'tpc.googlesyndication.com',
  'afs.googlesyndication.com',
  'fundingchoicesmessages.google.com',
  'adwords.google.com',
  'invitemedia.com',
  '2mdn.net',
  'admob.com',

  // --- Google Analytics & Tag Management ---
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'ssl.google-analytics.com',

  // --- Meta / Facebook Tracking, Pixels & Ads ---
  'connect.facebook.net',
  'pixel.facebook.com',
  'an.facebook.com',
  'staticxx.facebook.com',
  'ads.facebook.com',
  'tr.facebook.com',
  'atlas-solutions.com',
  'atlassolutions.com',
  'pixel.instagram.com',
  'ads.instagram.com',

  // --- Amazon Ad System ---
  'amazon-adsystem.com',
  'aax.amazon-adsystem.com',
  's.amazon-adsystem.com',
  'c.amazon-adsystem.com',
  'assoc-amazon.com',
  'adsystem.amazon.com',
  'fls-na.amazon.com',

  // --- Microsoft / Bing / Yahoo Advertising & Telemetry ---
  'ads.msn.com',
  'adcenter.msn.com',
  'rad.msn.com',
  'bat.bing.com',
  'b.bing.com',
  'clarity.ms',
  'c.clarity.ms',
  'advertising.com',
  'adtech.de',
  'adtechus.com',
  'gemini.yahoo.com',
  'adtech.yahooinc.com',
  'oath.com',
  'brightroll.com',
  'ups.analytics.yahoo.com',

  // --- Major Ad Networks, SSPs, DSPs, Exchanges & Header Bidders ---
  'adnxs.com',
  'ib.adnxs.com',
  'm.adnxs.com',
  'secure.adnxs.com',
  'adsrvr.org',
  'rubiconproject.com',
  'fastlane.rubiconproject.com',
  'optimized-by.rubiconproject.com',
  'pubmatic.com',
  'ads.pubmatic.com',
  'showads.pubmatic.com',
  'openx.net',
  'us-u.openx.net',
  'criteo.com',
  'criteo.net',
  'static.criteo.net',
  'gum.criteo.com',
  'outbrain.com',
  'taboola.com',
  'media.net',
  'contextual.media.net',
  'moatads.com',
  'z.moatads.com',
  'betrad.com',
  'bidswitch.net',
  'casalemedia.com',
  'contextweb.com',
  'tag.contextweb.com',
  'dotomi.com',
  'exponential.com',
  'flashtalking.com',
  'freewheel.com',
  'innovid.com',
  'liadm.com',
  'mathtag.com',
  'mookie1.com',
  'quantcast.com',
  'rfihub.com',
  'richrelevance.com',
  'rlcdn.com',
  'sascdn.com',
  'serving-sys.com',
  'bs.serving-sys.com',
  'sharethis.com',
  'simpli.fi',
  'smaato.net',
  'smartadserver.com',
  'diff.smartadserver.com',
  'spotxchange.com',
  'search.spotxchange.com',
  'turn.com',
  'undertone.com',
  'yieldmo.com',
  'ads.yieldmo.com',
  'appnexus.com',
  'sovrn.com',
  'sovrn.co',
  'lijit.com',
  'ap.lijit.com',
  'indexexchange.com',
  'sonobi.com',
  'apex.go.sonobi.com',
  'triplelift.com',
  'ib.3lift.com',
  '3lift.com',
  'teads.tv',
  'teads.com',
  'unrulymedia.com',
  'video.unrulymedia.com',
  'gumgum.com',
  'g2.gumgum.com',
  'nativo.com',
  'postrelease.com',
  'revcontent.com',
  'mgid.com',
  'adroll.com',
  'd.adroll.com',
  'adform.net',
  'track.adform.net',
  'stickyadstv.com',
  'smartclip.net',
  'sharethrough.com',
  'bttrack.com',
  'conversantmedia.com',
  'yieldlab.net',
  'districtm.io',
  '33across.com',
  'sic.33across.com',
  'adblade.com',
  'zedo.com',
  'tribalfusion.com',
  'yieldoptimizer.com',
  'tremorhub.com',
  'extremereach.io',
  'eyeviewads.com',
  'burt.io',
  'conversant.com',
  'pulsepoint.com',
  'admedo.com',
  'playbuzz.com',
  'liveintent.com',
  'steelhousemedia.com',
  'mntn.com',
  'adbutler.com',
  'buysellads.com',
  'buysellads.net',
  'carbonate.buysellads.com',
  'carbonads.net',
  'carbonads.com',
  'kargo.com',
  'inmobi.com',
  'loopme.com',
  'mobfox.com',
  'fyber.com',
  'ironsrc.com',
  'unityads.unity3d.com',
  'vungle.com',
  'chartboost.com',
  'applovin.com',
  'tapjoy.com',
  'adcolony.com',
  'leadbolt.com',
  'startapp.com',
  'bidtheatre.com',
  'adkernel.com',
  'admanmedia.com',
  'adspirit.de',
  'adventori.com',
  'affec.tv',
  'amnetgroup.com',
  'aniview.com',
  'audiencemanager.de',
  'avocet.io',
  'adtarget.me',
  'adition.com',
  'adscale.de',

  // --- Analytics, Session Recording, Heatmaps & User Metrics ---
  'hotjar.com',
  'static.hotjar.com',
  'script.hotjar.com',
  'vars.hotjar.com',
  'mixpanel.com',
  'api.mixpanel.com',
  'cdn.mxpnl.com',
  'segment.com',
  'segment.io',
  'api.segment.io',
  'cdn.segment.com',
  'amplitude.com',
  'api.amplitude.com',
  'fullstory.com',
  'rs.fullstory.com',
  'edge.fullstory.com',
  'heap.io',
  'heapanalytics.com',
  'cdn.heapanalytics.com',
  'mouseflow.com',
  'tools.mouseflow.com',
  'crazyegg.com',
  'script.crazyegg.com',
  'luckyorange.com',
  'cdn.luckyorange.net',
  'upload.luckyorange.net',
  'settings.luckyorange.net',
  'smartlook.com',
  'logrocket.com',
  'r.logrocket.io',
  'inspectlet.com',
  'cdn.inspectlet.com',
  'clicky.com',
  'static.getclicky.com',
  'statcounter.com',
  'c.statcounter.com',
  'chartbeat.com',
  'static.chartbeat.com',
  'mab.chartbeat.com',
  'newrelic.com',
  'nr-data.net',
  'bam.nr-data.net',
  'js-agent.newrelic.com',
  'kissmetrics.com',
  'kissmetrics.io',
  'trkn.us',
  'woopra.com',
  'static.woopra.com',
  'goqubit.com',
  'dynamic-yield.com',
  'optimizely.com',
  'cdn.optimizely.com',
  'logx.optimizely.com',
  'vwo.com',
  'visualwebsiteoptimizer.com',
  'dev.visualwebsiteoptimizer.com',
  'kissmetrics-analytics.com',
  'pendo.io',
  'cdn.pendo.io',
  'data.pendo.io',
  'walkme.com',
  'cdn.walkme.com',
  'sprig.com',
  'cdn.sprig.com',
  'posthog.com',
  'us.posthog.com',
  'eu.posthog.com',
  'app.posthog.com',
  'matomo.org',
  'piwik.pro',
  'mc.yandex.ru',
  'metrika.yandex.ru',
  'speedcurve.com',
  'rum-static.pingdom.net',
  'snowplowanalytics.com',
  'countly.com',

  // --- Trackers, DMPs, Attribution, Cross-Device Tracking ---
  'scorecardresearch.com',
  'b.scorecardresearch.com',
  'sb.scorecardresearch.com',
  'quantserve.com',
  'edge.quantserve.com',
  'pixel.quantserve.com',
  'bluekai.com',
  'tags.bluekai.com',
  'stags.bluekai.com',
  'demdex.net',
  'dpm.demdex.net',
  'fast.demdex.net',
  'krxd.net',
  'cdn.krxd.net',
  'beacon.krxd.net',
  'omtrdc.net',
  '2o7.net',
  'tealiumiq.com',
  'tags.tiqcdn.com',
  'tiqcdn.com',
  'adjust.com',
  'app.adjust.com',
  'view.adjust.com',
  'appsflyer.com',
  'app.appsflyer.com',
  'onelink.appsflyer.com',
  'kochava.com',
  'control.kochava.com',
  'branch.io',
  'api.branch.io',
  'api2.branch.io',
  'cdn.branch.io',
  'tapstream.com',
  'singular.net',
  'lotame.com',
  'crwdcntrl.net',
  'bcp.crwdcntrl.net',
  'eyeota.net',
  'liveamp.net',
  'neustar.biz',
  'agkn.com',
  'adchemy.com',
  'liveramp.com',
  'pippio.com',
  'acxiom.com',
  'tapad.com',
  'crosskey.tapad.com',
  'drew.tapad.com',
  'aggregateknowledge.com',
  'drawbridge.com',
  'vizury.com',
  'exelator.com',
  'loadm.exelator.com',
  'adknowledge.com',
  'connexity.com',
  'bizrate.com',
  'shopzilla.com',
  'reson8.com',
  'intelliad.de',
  'semasio.net',
  'bkrtx.com',
  'everesttech.net',

  // --- Popups, Popunders, Malvertising, Aggressive Ad Networks ---
  'popads.net',
  'serve.popads.net',
  'popcash.net',
  'propellerads.com',
  'adcash.com',
  'clickadu.com',
  'popmyads.com',
  'revenuehits.com',
  'popunder.net',
  'exoclick.com',
  'symapp.net',
  'trafficjunky.net',
  'trafficjunky.com',
  'juicyads.com',
  'ero-advertising.com',
  'plugrush.com',
  'adsterra.com',
  'hilltopads.com',
  'bidvertiser.com',
  'popvertising.com',
  'adxcore.com',
  'trafficfactory.biz',
  'clicksor.com',
  'adf.ly',
  'linkvertise.com',
  'coin-hive.com',
  'coinhive.com',
  'crypto-loot.com',
  'jsecoin.com',
  'yllix.com',
  'zeroredirect1.com',
  'admaven.com',
  'richpush.com',

  // --- Social Trackers & Widgets ---
  'platform.twitter.com',
  'syndication.twitter.com',
  'ads-twitter.com',
  'static.ads-twitter.com',
  'analytics.twitter.com',
  'tr.snapchat.com',
  'sc-static.net',
  'ads.pinterest.com',
  'ctk.pinterest.com',
  'log.pinterest.com',
  'widgets.pinterest.com',
  'px.ads.linkedin.com',
  'snap.licdn.com',
  'platform.linkedin.com',
  'analytics.tiktok.com',
  'ads.tiktok.com',
  'alb.reddit.com',
  'tr.reddit.com',
  'events.reddit.com',
  'addthis.com',
  's7.addthis.com',
  'w.sharethis.com',
  'po.st',
  'linkwithin.com',

  // --- Content Recommendation Widgets & Native Ads ---
  'widgets.outbrain.com',
  'log.outbrain.com',
  'cdn.taboola.com',
  'trc.taboola.com',
  'trends.revcontent.com',
  'cdn.mgid.com',
  'zergnet.com',
  'content.ad',
  'api.content.ad',
  'engageya.com',
  'plista.com',
  'static.plista.com',
  'dianomi.com',

  // --- Telemetry, Notification Trackers, In-App Analytics ---
  'telemetry.mozilla.org',
  'incoming.telemetry.mozilla.org',
  'vortex.data.microsoft.com',
  'browser.pipe.aria.microsoft.com',
  'settings-win.data.microsoft.com',
  'watson.telemetry.microsoft.com',
  'telemetry.sdk.inmobi.com',
  'flurry.com',
  'data.flurry.com',
  'crashlytics.com',
  'reports.crashlytics.com',
  'bugsnag.com',
  'notify.bugsnag.com',
  'sentry.io',
  'braze.com',
  'dev.appboy.com',
  'leanplum.com',
  'onesignal.com',
  'pushwoosh.com',
  'urbanairship.com',
  'airship.com',
  'customer.io',
  'intercom.io',
  'api-iam.intercom.io',
  'drift.com',
  'js.driftt.com'
];

/**
 * AdBlocker class for Lit Browser.
 * 
 * Provides network-level interception using Electron's webRequest API to:
 * - Block known ad, tracker, popup, and analytics domains and URL patterns.
 * - Inject Do Not Track (DNT) and Sec-GPC headers on outgoing requests.
 * - Strip third-party Set-Cookie headers to prevent cross-site tracking.
 */
class AdBlocker {
  /**
   * Initializes the AdBlocker instance with default blocklists, pattern matchers,
   * per-tab tracking maps, and counter metrics.
   */
  constructor() {
    /** @type {Set<string>} Set of blocked hostnames and base domains */
    this.blockedDomains = new Set(
      DEFAULT_BLOCKED_DOMAINS.map(domain => domain.toLowerCase().trim().replace(/^\./, ''))
    );

    /** @type {Array<string|RegExp>} URL path patterns that trigger request cancellation */
    this.urlPatterns = [...DEFAULT_URL_PATTERNS];

    /** @type {Map<number|string, number>} Per-tab blocked request counters */
    this.tabBlockedCounts = new Map();

    /** @type {number} Total requests blocked across the entire lifetime */
    this.totalBlocked = 0;

    /** @type {number} Total requests blocked in the current session */
    this.sessionBlocked = 0;

    /** @type {boolean} Master switch for ad blocking */
    this.enabled = true;

    /** @type {Set<Function>} Registered callback listeners for block events */
    this.blockedCallbacks = new Set();

    /** @type {Electron.Session|null} Associated Electron session instance */
    this.session = null;
  }

  /**
   * Initializes network interception on the given Electron session.
   * Attaches handlers to:
   * - onBeforeRequest: block matching ad/tracker domains and URL patterns
   * - onBeforeSendHeaders: add DNT: 1 and Sec-GPC: 1 privacy headers
   * - onHeadersReceived: remove Set-Cookie headers from third-party responses
   * 
   * @param {Electron.Session} session - The Electron session to attach to
   */
  init(session) {
    if (!session || !session.webRequest) {
      throw new Error('AdBlocker.init requires an Electron session with the webRequest API');
    }

    // Clean up previous session if re-initializing
    if (this.session && this.session !== session) {
      this.destroy();
    }

    this.session = session;
    const filter = { urls: ['*://*/*'] };

    // 1. Block matching requests (Ads, Trackers, Annoyances, URL patterns)
    this.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      if (!this.enabled) {
        return callback({ cancel: false });
      }

      try {
        const url = details.url;
        if (!url) {
          return callback({ cancel: false });
        }

        const check = this.shouldBlock(url);
        if (check.blocked) {
          const tabId = details.tabId !== undefined
            ? details.tabId
            : (details.webContentsId !== undefined ? details.webContentsId : null);

          this.totalBlocked++;
          this.sessionBlocked++;

          if (tabId !== null && tabId !== undefined) {
            const current = this.tabBlockedCounts.get(tabId) || 0;
            this.tabBlockedCounts.set(tabId, current + 1);
          }

          const blockInfo = {
            tabId,
            url,
            domain: check.domain,
            type: check.type // 'domain' | 'pattern'
          };

          this._notifyBlocked(blockInfo);
          return callback({ cancel: true });
        }

        return callback({ cancel: false });
      } catch (err) {
        console.error('[AdBlocker] Error in onBeforeRequest:', err);
        return callback({ cancel: false });
      }
    });

    // 2. Add Do Not Track (DNT) & Sec-GPC privacy headers
    this.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      if (!this.enabled) {
        return callback({ requestHeaders: details.requestHeaders });
      }

      try {
        const requestHeaders = { ...details.requestHeaders };
        requestHeaders['DNT'] = '1';
        requestHeaders['Sec-GPC'] = '1';
        return callback({ requestHeaders });
      } catch (err) {
        console.error('[AdBlocker] Error in onBeforeSendHeaders:', err);
        return callback({ requestHeaders: details.requestHeaders });
      }
    });

    // 3. Strip tracking cookies from third-party responses
    this.session.webRequest.onHeadersReceived(filter, (details, callback) => {
      if (!this.enabled) {
        return callback({ responseHeaders: details.responseHeaders });
      }

      try {
        if (this.isThirdParty(details.url, details.initiator, details.referrer, details.resourceType)) {
          const responseHeaders = { ...details.responseHeaders };
          let modified = false;

          for (const headerKey of Object.keys(responseHeaders)) {
            if (headerKey.toLowerCase() === 'set-cookie') {
              delete responseHeaders[headerKey];
              modified = true;
            }
          }

          if (modified) {
            return callback({ responseHeaders });
          }
        }

        return callback({ responseHeaders: details.responseHeaders });
      } catch (err) {
        console.error('[AdBlocker] Error in onHeadersReceived:', err);
        return callback({ responseHeaders: details.responseHeaders });
      }
    });
  }

  /**
   * Alias for init() for backward compatibility.
   * @param {Electron.Session} session
   */
  initialize(session) {
    return this.init(session);
  }

  /**
   * Evaluates whether a URL should be blocked based on its domain or path patterns.
   * 
   * @param {string} url - Target URL to evaluate
   * @returns {{ blocked: boolean, domain: string, type: 'domain'|'pattern'|null }}
   */
  shouldBlock(url) {
    if (!url) {
      return { blocked: false, domain: '', type: null };
    }

    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol.toLowerCase();

      // Only inspect standard web protocols
      if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'ws:' && protocol !== 'wss:') {
        return { blocked: false, domain: '', type: null };
      }

      const hostname = parsed.hostname.toLowerCase();

      // 1. Check known ad/tracking domain rules (including subdomains)
      if (this.isDomainBlocked(hostname)) {
        return { blocked: true, domain: hostname, type: 'domain' };
      }

      // 2. Check URL path patterns
      if (this.isUrlPatternBlocked(parsed.pathname)) {
        return { blocked: true, domain: hostname, type: 'pattern' };
      }

      return { blocked: false, domain: hostname, type: null };
    } catch (err) {
      return { blocked: false, domain: '', type: null };
    }
  }

  /**
   * Checks if a hostname matches any blocked domain or subdomain.
   * Utilizes an efficient O(1) Set lookup for exact matches, combined with
   * hierarchical endsWith checks for subdomains.
   * 
   * @param {string} hostname - The hostname to inspect
   * @returns {boolean} True if the domain or its parent domain is blocked
   */
  isDomainBlocked(hostname) {
    if (!hostname) return false;
    hostname = hostname.toLowerCase().trim();

    // Strip port if present
    if (hostname.includes(':')) {
      hostname = hostname.split(':')[0];
    }

    // 1. Exact match via Set lookup (O(1))
    if (this.blockedDomains.has(hostname)) {
      return true;
    }

    // 2. Hierarchical subdomain check using Set lookups and endsWith
    const parts = hostname.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (this.blockedDomains.has(parentDomain) && hostname.endsWith('.' + parentDomain)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a URL path matches any blocked path pattern.
   * 
   * @param {string} urlOrPath - The pathname or full URL to inspect
   * @returns {boolean} True if path matches any pattern
   */
  isUrlPatternBlocked(urlOrPath) {
    if (!urlOrPath) return false;

    let path = urlOrPath;
    if (urlOrPath.includes('://')) {
      try {
        path = new URL(urlOrPath).pathname;
      } catch (e) {
        path = urlOrPath;
      }
    }

    const lowerPath = path.toLowerCase();

    for (const pattern of this.urlPatterns) {
      if (typeof pattern === 'string') {
        if (lowerPath.includes(pattern.toLowerCase())) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(lowerPath)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Determines if a request is third-party relative to the initiating context.
   * Main frame navigations are considered first-party by definition.
   * 
   * @param {string} targetUrl - Target request URL
   * @param {string} [initiatorUrl] - Request initiator origin
   * @param {string} [referrerUrl] - Request HTTP Referer header
   * @param {string} [resourceType] - Electron resource type
   * @returns {boolean} True if target is a third-party context
   */
  isThirdParty(targetUrl, initiatorUrl, referrerUrl, resourceType) {
    if (resourceType === 'mainFrame') {
      return false;
    }

    const contextUrl = initiatorUrl || referrerUrl;
    if (!contextUrl || contextUrl === 'null' || contextUrl === 'about:blank') {
      return false;
    }

    try {
      const targetHost = new URL(targetUrl).hostname.toLowerCase();
      const contextHost = new URL(contextUrl).hostname.toLowerCase();

      if (targetHost === contextHost) {
        return false;
      }

      const targetBase = this.getBaseDomain(targetHost);
      const contextBase = this.getBaseDomain(contextHost);

      return targetBase !== contextBase;
    } catch (e) {
      return false;
    }
  }

  /**
   * Extracts the base / registrable domain from a hostname, taking into account
   * common multi-part country-code top-level domains (ccTLDs).
   * 
   * @param {string} hostname - The hostname to parse
   * @returns {string} The base domain
   */
  getBaseDomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.toLowerCase().split('.');
    if (parts.length <= 2) return hostname;

    const lastTwo = parts.slice(-2).join('.');
    if (SECOND_LEVEL_TLDS.has(lastTwo) && parts.length > 2) {
      return parts.slice(-3).join('.');
    }

    return parts.slice(-2).join('.');
  }

  /**
   * Retrieves blocked request statistics.
   * 
   * @param {number|string} [tabId] - Optional tab ID for per-tab metrics
   * @returns {{ total: number, session: number, tab?: number, tabCount?: number }}
   */
  getBlockedCount(tabId) {
    const counts = {
      total: this.totalBlocked,
      session: this.sessionBlocked
    };

    if (tabId !== undefined && tabId !== null) {
      const count = this.tabBlockedCounts.get(tabId) || 0;
      counts.tab = count;
      counts.tabCount = count;
    }

    return counts;
  }

  /**
   * Checks whether the ad blocker is currently enabled.
   * 
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Enables or disables network-level ad and tracker blocking.
   * 
   * @param {boolean} enabled - Whether to enable blocking
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  /**
   * Alias for setEnabled() for backward compatibility.
   * @param {boolean} [enabled]
   * @returns {boolean} Current enabled state
   */
  toggle(enabled) {
    if (typeof enabled === 'boolean') {
      this.setEnabled(enabled);
    } else {
      this.setEnabled(!this.enabled);
    }
    return this.enabled;
  }

  /**
   * Registers a callback listener invoked whenever a request is blocked.
   * 
   * @param {Function} callback - Function receiving { tabId, url, domain, type }
   * @returns {Function} Unsubscribe function to remove the listener
   */
  onBlocked(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('AdBlocker.onBlocked expects a function callback');
    }
    this.blockedCallbacks.add(callback);
    return () => {
      this.blockedCallbacks.delete(callback);
    };
  }

  /**
   * Resets the blocked request count for a given tab.
   * If tabId is omitted, resets all per-tab counts.
   * 
   * @param {number|string} [tabId] - ID of the tab to reset
   */
  resetTabCount(tabId) {
    if (tabId !== undefined && tabId !== null) {
      this.tabBlockedCounts.set(tabId, 0);
    } else {
      this.tabBlockedCounts.clear();
    }
  }

  /**
   * Alias for resetTabCount() for backward compatibility.
   * @param {number|string} [tabId]
   */
  resetTab(tabId) {
    this.resetTabCount(tabId);
  }

  /**
   * Adds a domain to the blocklist.
   * 
   * @param {string} domain - Domain name to block
   */
  addBlockedDomain(domain) {
    if (typeof domain === 'string' && domain.trim()) {
      this.blockedDomains.add(domain.toLowerCase().trim().replace(/^\./, ''));
    }
  }

  /**
   * Removes a domain from the blocklist.
   * 
   * @param {string} domain - Domain name to unblock
   */
  removeBlockedDomain(domain) {
    if (typeof domain === 'string') {
      this.blockedDomains.delete(domain.toLowerCase().trim().replace(/^\./, ''));
    }
  }

  /**
   * Adds a URL path pattern to the blocklist.
   * 
   * @param {string|RegExp} pattern - Path substring or RegExp
   */
  addUrlPattern(pattern) {
    if (pattern && !this.urlPatterns.includes(pattern)) {
      this.urlPatterns.push(pattern);
    }
  }

  /**
   * Removes a URL path pattern from the blocklist.
   * 
   * @param {string|RegExp} pattern - Pattern to remove
   */
  removeUrlPattern(pattern) {
    const index = this.urlPatterns.indexOf(pattern);
    if (index !== -1) {
      this.urlPatterns.splice(index, 1);
    }
  }

  /**
   * Notifies all registered callbacks of a blocked request event.
   * 
   * @private
   * @param {{ tabId: number|string|null, url: string, domain: string, type: 'domain'|'pattern' }} info
   */
  _notifyBlocked(info) {
    for (const callback of this.blockedCallbacks) {
      try {
        callback(info);
      } catch (err) {
        console.error('[AdBlocker] Callback execution error:', err);
      }
    }
  }

  /**
   * Cleans up webRequest interceptors, listeners, and references.
   */
  destroy() {
    if (this.session && this.session.webRequest) {
      try {
        this.session.webRequest.onBeforeRequest(null);
      } catch (e) {
        try {
          this.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, null);
        } catch (e2) {}
      }

      try {
        this.session.webRequest.onBeforeSendHeaders(null);
      } catch (e) {
        try {
          this.session.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, null);
        } catch (e2) {}
      }

      try {
        this.session.webRequest.onHeadersReceived(null);
      } catch (e) {
        try {
          this.session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, null);
        } catch (e2) {}
      }
    }

    this.session = null;
    this.blockedCallbacks.clear();
    this.tabBlockedCounts.clear();
    this.enabled = false;
  }
}

AdBlocker.AdBlocker = AdBlocker;
AdBlocker.default = AdBlocker;

module.exports = AdBlocker;
