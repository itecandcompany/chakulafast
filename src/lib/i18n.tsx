import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Small, dependency-free i18n layer.
 *
 * A flat dotted-key dictionary rather than nested objects: it keys off
 * `keyof typeof en`, so a missing or misspelled key is a compile error, and
 * declaring `sw` as `Record<TKey, string>` makes an untranslated string fail
 * the build instead of silently shipping English.
 *
 * Scope note: only customer-facing surfaces are translated. The vendor
 * dashboard and the admin console stay in English — they're operator tools
 * used by a handful of people who opted into them, and translating them
 * would double the dictionary for no user-visible benefit. Restaurant- and
 * menu-authored text (dish names, descriptions) is never translated either;
 * it belongs to whoever typed it.
 */

export const LANGS = { en: "English", sw: "Kiswahili" } as const;
export type Lang = keyof typeof LANGS;

const en = {
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.save": "Save",
  "common.submit": "Submit",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.back": "Back",
  "common.total": "Total",
  "common.from": "from",
  "common.minutes": "{count} min",
  "common.away": "{distance} away",
  "common.privacy": "Privacy Policy",
  "common.language": "Language",
  "common.signIn": "Sign in",
  "common.signOut": "Sign out",
  "common.optional": "optional",
  "common.none": "None yet",
  "common.open": "Open now",
  "common.closed": "Closed",
  "common.somethingWrong": "Something went wrong. Please try again.",

  "nav.home": "Home",
  "nav.search": "Search",
  "nav.orders": "Orders",
  "nav.account": "Account",

  "landing.badge": "Pre-order from restaurants near you",
  "landing.title": "Order ahead. Eat the moment you arrive.",
  "landing.subtitle":
    "Search for the dish you want, compare prices at restaurants and hotels around you, and tell them when you'll walk in. Your food is ready — not started — when you get there.",
  "landing.searchPlaceholder": "What do you want to eat? e.g. ugali",
  "landing.searchCta": "Find food",
  "landing.popular": "Popular right now",
  "landing.inTown": "in {town}",
  "landing.changeTown": "Change area",
  "landing.useMyLocation": "Use my location",
  "landing.usingLocation": "Using your location",
  "landing.locating": "Finding you…",
  "landing.locationDenied": "Location unavailable — pick your area instead.",
  "landing.howItWorks": "How it works",
  "landing.step1": "Search a dish",
  "landing.step1Body": "Type what you're craving and see every kitchen nearby that has it.",
  "landing.step2": "Compare and choose",
  "landing.step2Body": "Sort by price, distance or rating. No guessing what it costs.",
  "landing.step3": "Say when you'll arrive",
  "landing.step3Body": "The kitchen times the cooking to your arrival, so nothing sits going cold.",
  "landing.nearbyTitle": "Kitchens around you",
  "landing.nearbyEmpty": "No restaurants listed in this area yet.",
  "landing.viewMenu": "View menu",
  "landing.vendorCta": "Own a restaurant or hotel?",
  "landing.vendorCtaBody": "List your kitchen and start taking pre-orders.",
  "landing.vendorCtaButton": "Register your restaurant",

  "search.title": "Results for “{query}”",
  "search.titleEmpty": "Browse food near you",
  "search.count": "{count} dishes",
  "search.noResults": "No kitchen near you has that right now.",
  "search.noResultsHint": "Try a different spelling, a wider distance, or another area.",
  "search.widen": "Widen search to {km} km",
  "search.clearFilters": "Clear filters",
  "search.placeholder": "Search a dish…",
  "search.didYouMean": "Did you mean",

  "filter.sort": "Sort",
  "filter.sortDistance": "Nearest first",
  "filter.sortPriceAsc": "Cheapest first",
  "filter.sortPriceDesc": "Most expensive first",
  "filter.sortRating": "Best rated",
  "filter.sortPrep": "Fastest to cook",
  "filter.category": "Category",
  "filter.allCategories": "All food",
  "filter.area": "Area",
  "filter.distance": "Within {km} km",
  "filter.anyDistance": "Any distance",
  "filter.maxPrice": "Max price",
  "filter.openOnly": "Open now only",
  "filter.apply": "Show results",

  "cat.local": "Local food",
  "cat.grills": "Grills & roast",
  "cat.fastFood": "Fast food",
  "cat.breakfast": "Breakfast",
  "cat.snacks": "Snacks",
  "cat.drinks": "Drinks",
  "cat.desserts": "Desserts",

  "restaurant.menu": "Menu",
  "restaurant.about": "About",
  "restaurant.reviews": "Reviews",
  "restaurant.hours": "Opening hours",
  "restaurant.directions": "Directions",
  "restaurant.readyOnTime": "{percent}% ready on time",
  "restaurant.noReviews": "No reviews yet.",
  "restaurant.ratingSummary": "{rating} ({count} reviews)",
  "restaurant.prepTime": "Usually {count} min",
  "restaurant.notAccepting": "This kitchen has paused pre-orders.",
  "restaurant.closedNow": "Closed right now — you can still order for later.",
  "restaurant.outOfStock": "Out of stock",
  "restaurant.add": "Add",
  "restaurant.emptyMenu": "This kitchen hasn't added any dishes yet.",

  "cart.title": "Your order",
  "cart.empty": "Your basket is empty.",
  "cart.emptyHint": "Search for a dish to get started.",
  "cart.at": "From {restaurant}",
  "cart.subtotal": "Subtotal",
  "cart.note": "Note for the kitchen",
  "cart.notePlaceholder": "e.g. no pilipili, extra kachumbari",
  "cart.phone": "Phone number",
  "cart.phoneHint": "So the kitchen can reach you if something is unclear.",
  "cart.place": "Place pre-order",
  "cart.placing": "Sending…",
  "cart.switchRestaurant": "Start a new basket?",
  "cart.switchRestaurantBody":
    "Your basket has food from {current}. Adding this dish will clear it and start a new order at {next}.",
  "cart.switchConfirm": "Start new basket",
  "cart.signInFirst": "Sign in to place your order",
  "cart.remove": "Remove",

  "arrival.title": "When will you arrive?",
  "arrival.subtitle": "The kitchen starts cooking so it's ready as you walk in.",
  "arrival.inMinutes": "In {count} min",
  "arrival.now": "I'm here now",
  "arrival.useGps": "Estimate from my location",
  "arrival.gpsBusy": "Working out your travel time…",
  "arrival.gpsResult": "About {count} min away ({distance})",
  "arrival.gpsFailed": "Couldn't estimate — choose a time instead.",
  "arrival.custom": "Other",
  "arrival.readyAt": "Ready at about {time}",

  "order.title": "Your orders",
  "order.live": "In progress",
  "order.past": "Past orders",
  "order.empty": "You haven't ordered anything yet.",
  "order.emptyHint": "Find a dish and pre-order it — it'll show up here.",
  "order.code": "Order {code}",
  "order.placed": "Placed {time}",
  "order.arriveBy": "Arriving at {time}",
  "order.readyIn": "Ready in about {count} min",
  "order.readyNow": "Ready for collection",
  "order.showCode": "Show this code at the counter",
  "order.cancel": "Cancel order",
  "order.cancelConfirm": "Cancel this order?",
  "order.cancelConfirmBody":
    "The kitchen will be told straight away. You can't undo this, but you can order again.",
  "order.cancelled": "Order cancelled",
  "order.cancelReason": "Reason (optional)",
  "order.imOnMyWay": "I'm on my way",
  "order.sharingLocation": "Sharing your location — the kitchen sees your live arrival time.",
  "order.stopSharing": "Stop sharing",
  "order.eta": "You're about {count} min away",
  "order.rate": "Rate this order",
  "order.reorder": "Order again",
  "order.reorderGone": "Nothing from that order is on the menu right now.",
  "order.reorderPartial": "{count} item(s) were unavailable and left out.",
  "order.items": "{count} items",

  "status.pending": "Sent to kitchen",
  "status.accepted": "Accepted",
  "status.preparing": "Cooking now",
  "status.ready": "Ready",
  "status.completed": "Collected",
  "status.cancelled": "Cancelled",

  "review.title": "How was it?",
  "review.stars": "Your rating",
  "review.onTime": "Was your food ready when you arrived?",
  "review.yes": "Yes, it was ready",
  "review.no": "No, I waited",
  "review.comment": "Anything to add?",
  "review.commentPlaceholder": "Tell other customers what to expect",
  "review.submit": "Post review",
  "review.thanks": "Thanks — your review is live.",

  "account.title": "Account",
  "account.profile": "Profile",
  "account.name": "Full name",
  "account.phone": "Phone",
  "account.email": "Email",
  "account.town": "Home area",
  "account.photo": "Photo",
  "account.saved": "Profile saved",
  "account.myRestaurant": "My restaurant dashboard",
  "account.adminConsole": "Admin console",
  "account.installApp": "Install app",

  "auth.customerTitle": "Order food, ready when you arrive",
  "auth.vendorTitle": "List your restaurant on ChakulaFast",
  "auth.signInTitle": "Welcome back",
  "auth.signUpTitle": "Create your account",
  "auth.asCustomer": "I want to order food",
  "auth.asVendor": "I own a restaurant or hotel",
  "auth.haveAccount": "Already have an account?",
  "auth.noAccount": "New here?",
  "auth.emailLabel": "Email",
  "auth.passwordLabel": "Password",
  "auth.nameLabel": "Full name",
  "auth.phoneLabel": "Phone number",
  "auth.townLabel": "Your area",
  "auth.submitSignIn": "Sign in",
  "auth.submitSignUp": "Create account",
  "auth.google": "Continue with Google",
  "auth.or": "or",
  "auth.checkEmail": "Check your email to confirm your account, then sign in.",
  "auth.vendorFeeNotice":
    "Listing your restaurant costs a one-time {fee} registration fee. You'll pay it after creating your account.",
  "auth.passwordHint": "At least 8 characters, with a letter and a number.",
  "auth.browseAsGuest": "Browse without an account",

  "install.title": "Install ChakulaFast",
  "install.subtitle": "Add it to your home screen for faster ordering.",
  "install.button": "Install",
  "install.dismiss": "Not now",
  "install.iosTitle": "Add to Home Screen",
  "install.iosStep1": "Tap the Share button in Safari",
  "install.iosStep2": "Choose “Add to Home Screen”",
  "install.gotIt": "Got it",
} as const;

export type TKey = keyof typeof en;

const sw: Record<TKey, string> = {
  "common.loading": "Inapakia…",
  "common.retry": "Jaribu tena",
  "common.cancel": "Ghairi",
  "common.close": "Funga",
  "common.save": "Hifadhi",
  "common.submit": "Tuma",
  "common.edit": "Hariri",
  "common.delete": "Futa",
  "common.back": "Rudi",
  "common.total": "Jumla",
  "common.from": "kuanzia",
  "common.minutes": "Dakika {count}",
  "common.away": "Umbali {distance}",
  "common.privacy": "Sera ya Faragha",
  "common.language": "Lugha",
  "common.signIn": "Ingia",
  "common.signOut": "Toka",
  "common.optional": "si lazima",
  "common.none": "Bado hakuna",
  "common.open": "Ipo wazi",
  "common.closed": "Imefungwa",
  "common.somethingWrong": "Kuna hitilafu imetokea. Tafadhali jaribu tena.",

  "nav.home": "Mwanzo",
  "nav.search": "Tafuta",
  "nav.orders": "Oda",
  "nav.account": "Akaunti",

  "landing.badge": "Agiza mapema kwenye migahawa iliyo karibu nawe",
  "landing.title": "Agiza mapema. Kula mara tu unapofika.",
  "landing.subtitle":
    "Tafuta chakula unachotaka, linganisha bei za migahawa na hoteli zilizo karibu nawe, na waambie utakapofika. Chakula chako kinakuwa tayari — si kinaanza kupikwa — unapowasili.",
  "landing.searchPlaceholder": "Unataka kula nini? mfano ugali",
  "landing.searchCta": "Tafuta chakula",
  "landing.popular": "Vinavyotafutwa sasa",
  "landing.inTown": "{town}",
  "landing.changeTown": "Badilisha eneo",
  "landing.useMyLocation": "Tumia mahali nilipo",
  "landing.usingLocation": "Inatumia mahali ulipo",
  "landing.locating": "Inatafuta ulipo…",
  "landing.locationDenied": "Mahali hapapatikani — chagua eneo lako badala yake.",
  "landing.howItWorks": "Inavyofanya kazi",
  "landing.step1": "Tafuta chakula",
  "landing.step1Body": "Andika unachotamani uone kila jiko lililo karibu lenye chakula hicho.",
  "landing.step2": "Linganisha na uchague",
  "landing.step2Body": "Panga kwa bei, umbali au ubora. Hakuna kubahatisha bei.",
  "landing.step3": "Sema utafika saa ngapi",
  "landing.step3Body":
    "Jiko linapanga muda wa kupika kulingana na kuwasili kwako, chakula kisipoe.",
  "landing.nearbyTitle": "Majiko yaliyo karibu nawe",
  "landing.nearbyEmpty": "Bado hakuna mgahawa uliosajiliwa katika eneo hili.",
  "landing.viewMenu": "Ona menyu",
  "landing.vendorCta": "Una mgahawa au hoteli?",
  "landing.vendorCtaBody": "Sajili jiko lako uanze kupokea oda za mapema.",
  "landing.vendorCtaButton": "Sajili mgahawa wako",

  "search.title": "Matokeo ya “{query}”",
  "search.titleEmpty": "Vinjari chakula kilicho karibu nawe",
  "search.count": "Vyakula {count}",
  "search.noResults": "Hakuna jiko lililo karibu lenye chakula hicho kwa sasa.",
  "search.noResultsHint": "Jaribu tahajia nyingine, umbali mkubwa zaidi, au eneo lingine.",
  "search.widen": "Panua utafutaji hadi km {km}",
  "search.clearFilters": "Ondoa vichujio",
  "search.placeholder": "Tafuta chakula…",
  "search.didYouMean": "Ulimaanisha",

  "filter.sort": "Panga",
  "filter.sortDistance": "Karibu zaidi kwanza",
  "filter.sortPriceAsc": "Bei ya chini kwanza",
  "filter.sortPriceDesc": "Bei ya juu kwanza",
  "filter.sortRating": "Zenye ubora zaidi",
  "filter.sortPrep": "Zinazopikwa haraka",
  "filter.category": "Aina",
  "filter.allCategories": "Vyakula vyote",
  "filter.area": "Eneo",
  "filter.distance": "Ndani ya km {km}",
  "filter.anyDistance": "Umbali wowote",
  "filter.maxPrice": "Bei ya juu",
  "filter.openOnly": "Zilizo wazi tu",
  "filter.apply": "Onyesha matokeo",

  "cat.local": "Chakula cha kienyeji",
  "cat.grills": "Choma na kuchoma",
  "cat.fastFood": "Chakula cha haraka",
  "cat.breakfast": "Kifungua kinywa",
  "cat.snacks": "Vitafunio",
  "cat.drinks": "Vinywaji",
  "cat.desserts": "Kitindamlo",

  "restaurant.menu": "Menyu",
  "restaurant.about": "Kuhusu",
  "restaurant.reviews": "Maoni",
  "restaurant.hours": "Saa za kufungua",
  "restaurant.directions": "Njia",
  "restaurant.readyOnTime": "Asilimia {percent} tayari kwa wakati",
  "restaurant.noReviews": "Bado hakuna maoni.",
  "restaurant.ratingSummary": "{rating} (maoni {count})",
  "restaurant.prepTime": "Kawaida dakika {count}",
  "restaurant.notAccepting": "Jiko hili limesitisha oda za mapema.",
  "restaurant.closedNow": "Imefungwa sasa — bado unaweza kuagiza kwa ajili ya baadaye.",
  "restaurant.outOfStock": "Hakuna kwa sasa",
  "restaurant.add": "Ongeza",
  "restaurant.emptyMenu": "Jiko hili bado halijaweka vyakula.",

  "cart.title": "Oda yako",
  "cart.empty": "Kikapu chako hakina kitu.",
  "cart.emptyHint": "Tafuta chakula ili kuanza.",
  "cart.at": "Kutoka {restaurant}",
  "cart.subtotal": "Jumla ndogo",
  "cart.note": "Ujumbe kwa jiko",
  "cart.notePlaceholder": "mfano bila pilipili, kachumbari zaidi",
  "cart.phone": "Namba ya simu",
  "cart.phoneHint": "Ili jiko liweze kukupata endapo kuna jambo halijaeleweka.",
  "cart.place": "Tuma oda ya mapema",
  "cart.placing": "Inatuma…",
  "cart.switchRestaurant": "Anza kikapu kipya?",
  "cart.switchRestaurantBody":
    "Kikapu chako kina chakula cha {current}. Ukiongeza chakula hiki kitafutwa na kuanza oda mpya {next}.",
  "cart.switchConfirm": "Anza kikapu kipya",
  "cart.signInFirst": "Ingia ili kutuma oda yako",
  "cart.remove": "Ondoa",

  "arrival.title": "Utafika saa ngapi?",
  "arrival.subtitle": "Jiko litaanza kupika ili chakula kiwe tayari unapoingia.",
  "arrival.inMinutes": "Baada ya dakika {count}",
  "arrival.now": "Nipo hapa sasa",
  "arrival.useGps": "Kadiria kutoka mahali nilipo",
  "arrival.gpsBusy": "Inakadiria muda wa safari yako…",
  "arrival.gpsResult": "Takriban dakika {count} ({distance})",
  "arrival.gpsFailed": "Imeshindikana kukadiria — chagua muda badala yake.",
  "arrival.custom": "Nyingine",
  "arrival.readyAt": "Tayari saa {time} hivi",

  "order.title": "Oda zako",
  "order.live": "Zinaendelea",
  "order.past": "Oda zilizopita",
  "order.empty": "Bado hujaagiza chochote.",
  "order.emptyHint": "Tafuta chakula uagize mapema — kitaonekana hapa.",
  "order.code": "Oda {code}",
  "order.placed": "Imetumwa {time}",
  "order.arriveBy": "Unafika saa {time}",
  "order.readyIn": "Tayari baada ya dakika {count} hivi",
  "order.readyNow": "Tayari kuchukuliwa",
  "order.showCode": "Onyesha namba hii kaunta",
  "order.cancel": "Ghairi oda",
  "order.cancelConfirm": "Ghairi oda hii?",
  "order.cancelConfirmBody":
    "Jiko litaarifiwa mara moja. Huwezi kutengua, lakini unaweza kuagiza tena.",
  "order.cancelled": "Oda imeghairiwa",
  "order.cancelReason": "Sababu (si lazima)",
  "order.imOnMyWay": "Niko njiani",
  "order.sharingLocation": "Unashiriki mahali ulipo — jiko linaona muda wako wa kufika.",
  "order.stopSharing": "Acha kushiriki",
  "order.eta": "Umebaki takriban dakika {count}",
  "order.rate": "Toa maoni kuhusu oda hii",
  "order.reorder": "Agiza tena",
  "order.reorderGone": "Hakuna chochote cha oda hiyo kinachopatikana sasa.",
  "order.reorderPartial": "Vitu {count} havikupatikana na vimeachwa.",
  "order.items": "Vitu {count}",

  "status.pending": "Imetumwa jikoni",
  "status.accepted": "Imepokelewa",
  "status.preparing": "Inapikwa sasa",
  "status.ready": "Tayari",
  "status.completed": "Imechukuliwa",
  "status.cancelled": "Imeghairiwa",

  "review.title": "Ilikuwaje?",
  "review.stars": "Alama yako",
  "review.onTime": "Je, chakula chako kilikuwa tayari ulipofika?",
  "review.yes": "Ndiyo, kilikuwa tayari",
  "review.no": "Hapana, nilisubiri",
  "review.comment": "Kuna la kuongeza?",
  "review.commentPlaceholder": "Waeleze wateja wengine watarajie nini",
  "review.submit": "Tuma maoni",
  "review.thanks": "Asante — maoni yako yamechapishwa.",

  "account.title": "Akaunti",
  "account.profile": "Wasifu",
  "account.name": "Jina kamili",
  "account.phone": "Simu",
  "account.email": "Barua pepe",
  "account.town": "Eneo lako",
  "account.photo": "Picha",
  "account.saved": "Wasifu umehifadhiwa",
  "account.myRestaurant": "Dashibodi ya mgahawa wangu",
  "account.adminConsole": "Kidhibiti cha msimamizi",
  "account.installApp": "Sakinisha programu",

  "auth.customerTitle": "Agiza chakula, kiwe tayari unapofika",
  "auth.vendorTitle": "Sajili mgahawa wako ChakulaFast",
  "auth.signInTitle": "Karibu tena",
  "auth.signUpTitle": "Fungua akaunti yako",
  "auth.asCustomer": "Nataka kuagiza chakula",
  "auth.asVendor": "Nina mgahawa au hoteli",
  "auth.haveAccount": "Tayari una akaunti?",
  "auth.noAccount": "Ni mara yako ya kwanza?",
  "auth.emailLabel": "Barua pepe",
  "auth.passwordLabel": "Nenosiri",
  "auth.nameLabel": "Jina kamili",
  "auth.phoneLabel": "Namba ya simu",
  "auth.townLabel": "Eneo lako",
  "auth.submitSignIn": "Ingia",
  "auth.submitSignUp": "Fungua akaunti",
  "auth.google": "Endelea na Google",
  "auth.or": "au",
  "auth.checkEmail": "Angalia barua pepe yako kuthibitisha akaunti, kisha ingia.",
  "auth.vendorFeeNotice":
    "Kusajili mgahawa wako kunagharimu ada ya usajili ya mara moja ya {fee}. Utailipa baada ya kufungua akaunti.",
  "auth.passwordHint": "Angalau herufi 8, zikiwa na herufi na tarakimu.",
  "auth.browseAsGuest": "Vinjari bila akaunti",

  "install.title": "Sakinisha ChakulaFast",
  "install.subtitle": "Iweke kwenye skrini yako ya mwanzo kwa kuagiza haraka zaidi.",
  "install.button": "Sakinisha",
  "install.dismiss": "Si sasa",
  "install.iosTitle": "Ongeza kwenye Skrini ya Mwanzo",
  "install.iosStep1": "Gusa kitufe cha Share kwenye Safari",
  "install.iosStep2": "Chagua “Add to Home Screen”",
  "install.gotIt": "Nimeelewa",
};

const DICTS: Record<Lang, Record<TKey, string>> = { en, sw };

const STORAGE_KEY = "chakulafast.lang";

export type TFunc = (key: TKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: TFunc } | undefined>(
  undefined,
);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start from "en" so the server-rendered HTML and the first client
  // render agree. Reading localStorage during the initial render would make
  // them differ and blow up hydration.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "sw") {
        setLangState(stored);
        return;
      }
    } catch {
      // Private mode or blocked storage — fall through to the browser hint.
    }
    if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("sw")) {
      setLangState("sw");
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't persist — not worth failing the switch over.
    }
  }, []);

  const t = useCallback<TFunc>(
    (key, vars) => {
      const raw = DICTS[lang][key] ?? en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience for the common case of only needing the translate function. */
// eslint-disable-next-line react-refresh/only-export-components
export function useT(): TFunc {
  return useI18n().t;
}
