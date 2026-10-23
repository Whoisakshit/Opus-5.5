// English / Hindi for the public pages (landing and request). Staff screens stay in English.
// The choice is remembered on the phone; a phone set to Hindi opens in Hindi.
// Hindi text should be reviewed by a native speaker before a real launch.

import { useSyncExternalStore } from 'react';
import type { Item } from './types.ts';

export type Lang = 'en' | 'hi';
const KEY = 'rahat:v2:lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'hi') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

let lang: Lang = initial();
const listeners = new Set<() => void>();

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => lang,
  );
}

/** "5 min ago" in the chosen language. */
export function agoIn(l: Lang, at: number, now: number): string {
  const m = Math.round(Math.max(0, now - at) / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (l === 'hi') {
    if (m < 1) return 'अभी';
    if (m < 60) return `${m} मिनट पहले`;
    if (h < 24) return `${h} घंटे${m % 60 ? ` ${m % 60} मिनट` : ''} पहले`;
    return `${d} दिन ${h % 24} घंटे पहले`;
  }
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ''} ago`;
  return `${d} d ${h % 24} h ago`;
}

const en = {
  // header and common
  howItWorks: 'How it works',
  requestHelp: 'Request help',
  myRequest: 'My request',
  switchTo: 'हिन्दी',
  switchLabel: 'हिन्दी में देखें',
  district: 'Dehradun',
  titleHome: 'Rahat: relief for flood and landslide camps',
  titleRequest: 'Request help | Rahat',
  items: { food: 'Food', water: 'Water', blankets: 'Blankets', medicine: 'Medicine' } as Record<Item, string>,
  itemsLower: { food: 'food', water: 'water', blankets: 'blankets', medicine: 'medicine' } as Record<Item, string>,
  units: { food: 'packs', water: 'cans', blankets: 'pcs', medicine: 'kits' } as Record<Item, string>,
  list: (parts: string[]) => (parts.length ? parts.join(', ') : 'nothing'),

  // landing
  pill: 'Flood and landslide relief',
  h1a: 'Help reaches your camp,',
  h1b: 'even without signal.',
  heroSub: (d: string) => `Tell the ${d} district control room where you are and what your camp needs. Works on any phone, with or without internet.`,
  seeHow: 'See how it works',
  facts: [
    ['Free', 'No account, no app to install'],
    ['Offline', 'Saved on your phone until signal returns'],
    ['1 SMS', 'Is enough to reach the control room'],
    ['GPS', 'Exact location, even without internet'],
  ],
  howEyebrow: 'How it works',
  howTitle: ['From request to relief, in ', 'three steps.'],
  steps: [
    ['Send your request', 'Pin your location, count the people with you and list what you need. It takes about two minutes.'],
    ['Control room confirms', 'An officer calls you back to confirm, then shares the stock fairly, so no camp gets supplies twice while another waits.'],
    ['Supplies reach you', 'By truck, or on foot if the road is blocked. Give the driver your 4-digit code once the goods are with you.'],
  ],
  signalEyebrow: 'Any signal',
  signalTitle: ['Your request gets through, ', 'whatever the network.'],
  signalSub: 'The page notices your connection by itself and uses whichever way works.',
  channels: [
    ['Internet', 'Sent straight away. If the network drops halfway, it is kept and sent again.'],
    ['Phone signal only', 'One short text message carries your whole request to the control room.'],
    ['No signal at all', 'Saved on your phone. It sends by itself the moment any signal returns.'],
  ],
  safetyEyebrow: 'Stay safe while you wait',
  safetyTitle: ['Simple steps that ', 'save lives.'],
  guides: [
    {
      title: 'In a flood',
      points: [
        'Move to higher ground or an upper floor early. Do not wait for the water to rise.',
        'Do not walk, swim or drive through flood water. Even shallow moving water can sweep you away.',
        'Stay away from electric poles and fallen wires. Switch off power at the main if it is safe.',
        'Drink only boiled, filtered or sealed bottled water.',
      ],
    },
    {
      title: 'Near hills and slopes',
      points: [
        'In heavy rain, stay away from steep slopes, river banks and the foot of hills.',
        'Watch for new cracks in the ground or walls, tilting trees or poles, muddy water in streams, or rumbling.',
        'If you see these signs, move away from the slope quickly to stable ground.',
        'After a landslide, keep away from the area. More slides can follow.',
      ],
    },
    {
      title: 'Your phone',
      points: [
        'Open this page once while you have signal. After that it opens even with no internet.',
        'Turn on battery saver and lower the brightness. Keep a power bank if you have one.',
        'Keep documents and medicines in a waterproof bag, with a written list of family phone numbers.',
        'Send a quick check-in every few hours so the control room knows you are safe.',
      ],
    },
  ],
  safetyNote: ['General safety advice. For official guidance, see the ', 'National Disaster Management Authority', '. In danger right now? Call '],
  footer: (d: string) => `Rahat. Relief coordination for the ${d} district control room.`,

  // request page
  subExisting: 'Your request and everything on its way to you. Keep this page; it works offline.',
  subNew: 'Tell the control room where you are and what you need. It takes about two minutes.',
  yourRequests: 'Your requests',
  anotherPlace: 'Another place',
  offlineBold: 'No connection right now.',
  offlineText: 'Fill in the form anyway. It is saved on this phone and sends by itself when signal returns.',
  offlineUrgent: ' If it is urgent and you have phone signal, use "Send by SMS".',
  weakBold: 'Weak connection.',
  weakText: ' We keep trying in the background',
  weakSms: '. SMS is the faster option right now.',
  stop: '.',
  statusTitle: 'Your request',
  sent: (a: string) => `The control room has it. Sent ${a}.`,
  notSent: 'Saved on this phone. It sends when there is signal.',
  verified: 'Confirmed by the control room.',
  waitingVerify: (phone?: string) => `Waiting to be confirmed.${phone ? ` Keep ${phone} switched on; they may call you.` : ''}`,
  teamComing: (team: string, here: boolean) => `${team} is ${here ? 'with you' : 'on the way to you'}.`,
  stillNeeded: (l: string) => `Still needed after what is on the way: ${l}.`,
  outboxTitle: 'Not sent yet',
  outboxText: 'Safe on this phone. If it is urgent, send it another way now.',
  kindReport: 'Request',
  kindCheckin: 'Check-in',
  kindReceipt: 'Delivery receipt',
  hide: 'Hide',
  sendAnother: 'Send another way',
  helpTitle: 'If your request will not send',
  help1: 'Keep this page open. It retries by itself.',
  help2: ['With phone signal but no data, press ', 'Send another way', ' then ', 'Send by SMS', '.'],
  help2To: (n: string) => ` (to ${n})`,
  help3: 'With no signal at all, keep the phone on. Your request sends by itself the moment any signal returns.',
  sosTitle: 'Life in danger? Call now',
  sosLabels: { '112': 'Police, fire, ambulance', state: 'State disaster control room', district: 'District disaster control room' },
  coming: 'Supplies coming to you',
  status: { approved: 'Approved', packed: 'Packed', in_transit: 'On the way', blocked: 'Road blocked', delivered: 'Delivered', received: 'Received' },
  statusText: {
    approved: 'Approved by the control room. Being packed at the warehouse.',
    packed: 'Packed and waiting for a truck.',
    in_transit: 'On the way to you.',
    blocked: 'The road is blocked. A rescue team will carry it to you on foot.',
    delivered: 'Marked delivered. Please count it and confirm below.',
    received: 'Received.',
  },
  withCarrier: (c: string) => ` With ${c}.`,
  handover: 'Handover code',
  handoverHelp: 'Say it to the driver only once the goods are with you.',
  gotIt: 'We received it. Count and confirm',
  countLabel: 'Count what actually arrived',
  countHelp: 'If anything is short, the control room can see at which handover it went missing.',
  confirmReceipt: 'Confirm receipt',
  cancel: 'Cancel',
  formNew: 'Where are you, and what do you need?',
  formUpdate: 'Update your request',
  formNewText: 'One request per place. If many families are together, send one request for all of them.',
  formUpdateText: 'A new update replaces the last one. Give what you still need today; anything already on the way is counted for you.',
  updateSaved: 'Update saved. It goes to the control room as soon as this phone has signal.',
  place: 'Name of the place',
  placePh: 'e.g. Govt. Inter College, Kalsi',
  placeAuto: 'Filled in from your location. Correct it if it is not quite right.',
  placeHint: 'Press "Use GPS" below and this fills itself in when there is internet.',
  yourName: 'Your name',
  phone: 'Phone number for a call back',
  phonePh: 'e.g. 98xxx xxxxx',
  location: 'Exact location',
  within: (m: number) => ` within ${m} m`,
  fromGps: ', from GPS',
  fromMap: ', from map pin',
  fromTyped: ', from typed numbers',
  noLoc: 'No location yet. Press "Use GPS" or tap the map.',
  type: 'Type',
  useGps: 'Use GPS',
  finding: 'Finding you…',
  gpsNone: 'This phone cannot share its location. Tap the map instead.',
  gpsDenied: 'Location permission is off. Allow it in your browser, or tap the map.',
  gpsNoFix: 'No GPS fix yet. Step outside, wait a moment and try again, or tap the map.',
  gpsHelp: 'GPS works without internet. The map picture needs data, but your pin is saved either way.',
  mapLabel: 'Map. Tap to place your camp, or drag the pin.',
  peopleTitle: 'People with you',
  total: 'Total',
  children: 'Children under 5',
  elderly: 'Elderly',
  injured: 'Injured or sick',
  needTitle: 'What you still need',
  urgentTitle: 'Anything urgent?',
  medical: ['Medical emergency', 'Someone needs a doctor or to be taken to hospital.'],
  trapped: ['People trapped', 'Cut off by water or debris and cannot get out.'],
  road: ['Road to us is blocked', 'Supplies will be carried in on foot.'],
  note: 'Anything else (optional)',
  notePh: 'e.g. Landmark: next to the temple, approach from the river side',
  noteHelp: 'Sent over the internet only. It does not fit in the SMS.',
  errName: 'Enter the name of the place, for example the school or village.',
  errLoc: 'Set your location: press "Use GPS", tap the map, or type coordinates.',
  errPeople: 'Enter how many people are with you.',
  errSum: 'Children, elderly and injured cannot add up to more than the total.',
  errPhone: 'Check the phone number. Use digits only, with +91 if you like.',
  sendRequest: 'Send request',
  sendUpdate: 'Send update',
  lat: 'Latitude',
  lng: 'Longitude',
  placePin: 'Place pin here',
  checkinTitle: 'All OK check-in',
  checkinText: 'Send this every few hours, even when you need nothing new. If a camp goes quiet, the control room sends a team to check.',
  peopleNow: 'People now',
  sendCheckin: 'Send check-in',
  checkinDone: 'Check-in saved. Your last request still stands.',

  // SMS box
  smsInfo: (n: number, parts: number) =>
    `${n} characters, ${parts === 1 ? 'fits in one SMS' : `${parts} SMS parts`}. Works with a basic phone signal, no data needed.`,
  sendSms: 'Send by SMS',
  copy: 'Copy',
  copied: 'Copied',
};

export type Strings = typeof en;

const hi: Strings = {
  howItWorks: 'यह कैसे काम करता है',
  requestHelp: 'मदद माँगें',
  myRequest: 'मेरा अनुरोध',
  switchTo: 'English',
  switchLabel: 'Switch to English',
  district: 'देहरादून',
  titleHome: 'राहत: बाढ़ और भूस्खलन शिविरों के लिए मदद',
  titleRequest: 'मदद माँगें | राहत',
  items: { food: 'भोजन', water: 'पानी', blankets: 'कंबल', medicine: 'दवाइयाँ' },
  itemsLower: { food: 'भोजन', water: 'पानी', blankets: 'कंबल', medicine: 'दवाइयाँ' },
  units: { food: 'पैकेट', water: 'कैन', blankets: 'नग', medicine: 'किट' },
  list: (parts) => (parts.length ? parts.join(', ') : 'कुछ नहीं'),

  pill: 'बाढ़ और भूस्खलन राहत',
  h1a: 'मदद आपके शिविर तक पहुँचेगी,',
  h1b: 'नेटवर्क न हो तब भी।',
  heroSub: (d) => `${d} ज़िला नियंत्रण कक्ष को बताइए कि आप कहाँ हैं और आपके शिविर को क्या चाहिए। किसी भी फ़ोन पर, इंटरनेट हो या न हो, काम करता है।`,
  seeHow: 'देखें यह कैसे काम करता है',
  facts: [
    ['मुफ़्त', 'न खाता बनाना, न कोई ऐप डालना'],
    ['ऑफ़लाइन', 'नेटवर्क लौटने तक आपके फ़ोन में सुरक्षित'],
    ['1 SMS', 'नियंत्रण कक्ष तक पहुँचने के लिए काफ़ी'],
    ['GPS', 'सटीक जगह, बिना इंटरनेट के भी'],
  ],
  howEyebrow: 'यह कैसे काम करता है',
  howTitle: ['अनुरोध से राहत तक, ', 'तीन आसान चरणों में।'],
  steps: [
    ['अपना अनुरोध भेजें', 'मैप पर अपनी जगह लगाइए, साथ के लोगों की गिनती कीजिए और ज़रूरी सामान लिखिए। लगभग दो मिनट लगते हैं।'],
    ['नियंत्रण कक्ष पुष्टि करता है', 'एक अधिकारी आपको फ़ोन करके पुष्टि करता है, फिर सामान निष्पक्ष रूप से बाँटा जाता है, ताकि किसी शिविर को दो बार न मिले और कोई दूसरा इंतज़ार न करे।'],
    ['सामान आप तक पहुँचता है', 'ट्रक से, या सड़क बंद हो तो पैदल। सामान मिल जाने के बाद ही ड्राइवर को अपना 4 अंकों का कोड बताइए।'],
  ],
  signalEyebrow: 'कोई भी नेटवर्क',
  signalTitle: ['आपका अनुरोध पहुँचेगा, ', 'नेटवर्क कैसा भी हो।'],
  signalSub: 'यह पेज खुद आपका नेटवर्क पहचानता है और जो तरीका काम करे, उसी से भेजता है।',
  channels: [
    ['इंटरनेट', 'तुरंत भेजा जाता है। बीच में नेटवर्क चला जाए तो सुरक्षित रहता है और दोबारा भेजा जाता है।'],
    ['सिर्फ़ फ़ोन सिग्नल', 'एक छोटा SMS आपका पूरा अनुरोध नियंत्रण कक्ष तक पहुँचा देता है।'],
    ['बिल्कुल नेटवर्क नहीं', 'आपके फ़ोन में सुरक्षित रहता है। जैसे ही नेटवर्क लौटे, अपने आप चला जाता है।'],
  ],
  safetyEyebrow: 'इंतज़ार के दौरान सुरक्षित रहें',
  safetyTitle: ['आसान कदम जो ', 'जान बचाते हैं।'],
  guides: [
    {
      title: 'बाढ़ में',
      points: [
        'समय रहते ऊँची जगह या ऊपर की मंज़िल पर चले जाएँ। पानी बढ़ने का इंतज़ार न करें।',
        'बाढ़ के पानी में न चलें, न तैरें, न गाड़ी चलाएँ। कम गहरा बहता पानी भी बहा ले जा सकता है।',
        'बिजली के खंभों और गिरे हुए तारों से दूर रहें। सुरक्षित हो तो मेन स्विच बंद कर दें।',
        'सिर्फ़ उबला हुआ, छना हुआ या सील बंद बोतल का पानी पिएँ।',
      ],
    },
    {
      title: 'पहाड़ और ढलानों के पास',
      points: [
        'तेज़ बारिश में खड़ी ढलानों, नदी के किनारों और पहाड़ की तलहटी से दूर रहें।',
        'ज़मीन या दीवारों में नई दरारें, झुकते पेड़ या खंभे, नालों में मटमैला पानी या गड़गड़ाहट पर ध्यान दें।',
        'ऐसे संकेत दिखें तो तुरंत ढलान से हटकर मज़बूत ज़मीन पर चले जाएँ।',
        'भूस्खलन के बाद उस जगह से दूर रहें। और भूस्खलन हो सकते हैं।',
      ],
    },
    {
      title: 'आपका फ़ोन',
      points: [
        'नेटवर्क रहते यह पेज एक बार खोल लें। उसके बाद यह बिना इंटरनेट के भी खुलेगा।',
        'बैटरी सेवर चालू करें और स्क्रीन की रोशनी कम रखें। पावर बैंक हो तो साथ रखें।',
        'ज़रूरी कागज़ और दवाइयाँ वाटरप्रूफ़ थैले में रखें, साथ में परिवार के फ़ोन नंबरों की लिखी सूची भी।',
        'हर कुछ घंटों में "सब ठीक है" भेजते रहें, ताकि नियंत्रण कक्ष को पता रहे कि आप सुरक्षित हैं।',
      ],
    },
  ],
  safetyNote: ['सामान्य सुरक्षा सलाह। आधिकारिक दिशानिर्देशों के लिए देखें ', 'राष्ट्रीय आपदा प्रबंधन प्राधिकरण', '। अभी खतरे में हैं? कॉल करें '],
  footer: (d) => `राहत। ${d} ज़िला नियंत्रण कक्ष के लिए राहत समन्वय।`,

  subExisting: 'आपका अनुरोध और आप तक आ रहा सारा सामान। यह पेज सँभालकर रखें, यह ऑफ़लाइन भी खुलता है।',
  subNew: 'नियंत्रण कक्ष को बताइए कि आप कहाँ हैं और क्या चाहिए। लगभग दो मिनट लगते हैं।',
  yourRequests: 'आपके अनुरोध',
  anotherPlace: 'दूसरी जगह',
  offlineBold: 'अभी नेटवर्क नहीं है।',
  offlineText: 'फ़ॉर्म फिर भी भरें। यह इस फ़ोन में सुरक्षित रहेगा और नेटवर्क आते ही अपने आप चला जाएगा।',
  offlineUrgent: ' जल्दी हो और फ़ोन सिग्नल हो, तो "SMS से भेजें" दबाएँ।',
  weakBold: 'नेटवर्क कमज़ोर है।',
  weakText: ' हम पीछे से कोशिश करते रहते हैं',
  weakSms: '। अभी SMS ज़्यादा जल्दी पहुँचेगा।',
  stop: '।',
  statusTitle: 'आपका अनुरोध',
  sent: (a) => `नियंत्रण कक्ष को मिल गया है। ${a} भेजा गया।`,
  notSent: 'इस फ़ोन में सुरक्षित है। नेटवर्क आने पर चला जाएगा।',
  verified: 'नियंत्रण कक्ष ने पुष्टि कर दी है।',
  waitingVerify: (phone) => `पुष्टि का इंतज़ार है।${phone ? ` ${phone} चालू रखें, आपको फ़ोन आ सकता है।` : ''}`,
  teamComing: (team, here) => `${team} ${here ? 'आपके पास पहुँच गया है' : 'आपकी ओर आ रहा है'}।`,
  stillNeeded: (l) => `रास्ते में आ रहे सामान के बाद भी ज़रूरत: ${l}।`,
  outboxTitle: 'अभी नहीं भेजा गया',
  outboxText: 'इस फ़ोन में सुरक्षित है। जल्दी हो तो अभी दूसरे तरीके से भेजें।',
  kindReport: 'अनुरोध',
  kindCheckin: '"सब ठीक है" संदेश',
  kindReceipt: 'सामान की रसीद',
  hide: 'छिपाएँ',
  sendAnother: 'दूसरे तरीके से भेजें',
  helpTitle: 'अगर अनुरोध न जाए',
  help1: 'यह पेज खुला रखें। यह अपने आप दोबारा कोशिश करता है।',
  help2: ['फ़ोन सिग्नल हो पर इंटरनेट न हो, तो ', 'दूसरे तरीके से भेजें', ' और फिर ', 'SMS से भेजें', ' दबाएँ।'],
  help2To: (n) => ` (${n} पर)`,
  help3: 'बिल्कुल नेटवर्क न हो, तो फ़ोन चालू रखें। नेटवर्क आते ही अनुरोध अपने आप चला जाएगा।',
  sosTitle: 'जान खतरे में है? अभी कॉल करें',
  sosLabels: { '112': 'पुलिस, फ़ायर, एम्बुलेंस', state: 'राज्य आपदा नियंत्रण कक्ष', district: 'ज़िला आपदा नियंत्रण कक्ष' },
  coming: 'आपके लिए सामान आ रहा है',
  status: { approved: 'मंज़ूर', packed: 'पैक हो गया', in_transit: 'रास्ते में', blocked: 'सड़क बंद', delivered: 'पहुँचा दिया', received: 'मिल गया' },
  statusText: {
    approved: 'नियंत्रण कक्ष ने मंज़ूर किया है। गोदाम में पैक हो रहा है।',
    packed: 'पैक हो गया है, ट्रक का इंतज़ार है।',
    in_transit: 'आपकी ओर आ रहा है।',
    blocked: 'सड़क बंद है। बचाव दल पैदल लेकर आएगा।',
    delivered: 'पहुँचा दिया गया है। कृपया गिनकर नीचे पुष्टि करें।',
    received: 'मिल गया।',
  },
  withCarrier: (c) => ` ${c} के पास है।`,
  handover: 'सौंपने का कोड',
  handoverHelp: 'सामान मिल जाने के बाद ही ड्राइवर को बताएँ।',
  gotIt: 'सामान मिल गया। गिनकर पुष्टि करें',
  countLabel: 'असल में कितना आया, गिनिए',
  countHelp: 'कुछ कम हो, तो नियंत्रण कक्ष देख सकता है कि किस मोड़ पर कमी हुई।',
  confirmReceipt: 'पुष्टि करें',
  cancel: 'रद्द करें',
  formNew: 'आप कहाँ हैं, और आपको क्या चाहिए?',
  formUpdate: 'अपना अनुरोध बदलें',
  formNewText: 'हर जगह के लिए एक अनुरोध। कई परिवार साथ हों तो सबके लिए एक ही अनुरोध भेजें।',
  formUpdateText: 'नया अनुरोध पिछले की जगह लेता है। आज जो अभी भी चाहिए वही लिखें, रास्ते में आ रहा सामान अपने आप गिना जाता है।',
  updateSaved: 'बदलाव सुरक्षित हो गया। नेटवर्क मिलते ही नियंत्रण कक्ष तक पहुँच जाएगा।',
  place: 'जगह का नाम',
  placePh: 'जैसे: राजकीय इंटर कॉलेज, कालसी',
  placeAuto: 'आपकी लोकेशन से भरा गया है। सही न हो तो बदल दें।',
  placeHint: 'नीचे "GPS से जगह लें" दबाएँ, इंटरनेट हो तो यह अपने आप भर जाएगा।',
  yourName: 'आपका नाम',
  phone: 'वापस फ़ोन करने के लिए नंबर',
  phonePh: 'जैसे: 98xxx xxxxx',
  location: 'सटीक जगह',
  within: (m) => `, लगभग ${m} मीटर तक सही`,
  fromGps: ', GPS से',
  fromMap: ', मैप पिन से',
  fromTyped: ', लिखे गए नंबरों से',
  noLoc: 'अभी जगह नहीं चुनी गई। "GPS से जगह लें" दबाएँ या मैप पर टैप करें।',
  type: 'लिखें',
  useGps: 'GPS से जगह लें',
  finding: 'आपको ढूँढ रहे हैं…',
  gpsNone: 'यह फ़ोन अपनी लोकेशन नहीं दे सकता। मैप पर टैप करें।',
  gpsDenied: 'लोकेशन की अनुमति बंद है। ब्राउज़र में अनुमति दें या मैप पर टैप करें।',
  gpsNoFix: 'अभी GPS नहीं मिला। खुले में जाएँ, थोड़ा रुककर फिर कोशिश करें, या मैप पर टैप करें।',
  gpsHelp: 'GPS बिना इंटरनेट के भी काम करता है। मैप दिखने के लिए इंटरनेट चाहिए, पर आपकी पिन हर हाल में सुरक्षित रहती है।',
  mapLabel: 'मैप। अपने शिविर की जगह पर टैप करें या पिन खींचें।',
  peopleTitle: 'आपके साथ कितने लोग हैं',
  total: 'कुल',
  children: '5 साल से छोटे बच्चे',
  elderly: 'बुज़ुर्ग',
  injured: 'घायल या बीमार',
  needTitle: 'अभी क्या चाहिए',
  urgentTitle: 'कुछ बहुत ज़रूरी?',
  medical: ['मेडिकल इमरजेंसी', 'किसी को डॉक्टर की या अस्पताल ले जाने की ज़रूरत है।'],
  trapped: ['लोग फँसे हैं', 'पानी या मलबे से घिरे हैं और निकल नहीं पा रहे।'],
  road: ['हमारे यहाँ की सड़क बंद है', 'सामान पैदल लाया जाएगा।'],
  note: 'और कुछ (ज़रूरी नहीं)',
  notePh: 'जैसे: पहचान, मंदिर के पास, नदी की तरफ़ से रास्ता',
  noteHelp: 'यह सिर्फ़ इंटरनेट से जाता है, SMS में नहीं आता।',
  errName: 'जगह का नाम लिखें, जैसे स्कूल या गाँव।',
  errLoc: 'अपनी जगह चुनें: "GPS से जगह लें" दबाएँ, मैप पर टैप करें या नंबर लिखें।',
  errPeople: 'लिखें कि आपके साथ कितने लोग हैं।',
  errSum: 'बच्चे, बुज़ुर्ग और घायल मिलाकर कुल लोगों से ज़्यादा नहीं हो सकते।',
  errPhone: 'फ़ोन नंबर जाँचें। सिर्फ़ अंक लिखें, चाहें तो +91 के साथ।',
  sendRequest: 'अनुरोध भेजें',
  sendUpdate: 'बदलाव भेजें',
  lat: 'अक्षांश (Latitude)',
  lng: 'देशांतर (Longitude)',
  placePin: 'यहाँ पिन लगाएँ',
  checkinTitle: '"सब ठीक है" संदेश',
  checkinText: 'हर कुछ घंटों में यह भेजें, भले ही कुछ नया न चाहिए हो। किसी शिविर से खबर न आए, तो नियंत्रण कक्ष जाँच के लिए दल भेजता है।',
  peopleNow: 'अभी कितने लोग',
  sendCheckin: 'भेजें',
  checkinDone: 'संदेश सुरक्षित हो गया। आपका पिछला अनुरोध बना रहेगा।',

  smsInfo: (n, parts) => `${n} अक्षर, ${parts === 1 ? 'एक SMS में आ जाता है' : `${parts} SMS में`}। सिर्फ़ फ़ोन सिग्नल से काम करता है, इंटरनेट की ज़रूरत नहीं।`,
  sendSms: 'SMS से भेजें',
  copy: 'कॉपी करें',
  copied: 'कॉपी हो गया',
};

const DICT: Record<Lang, Strings> = { en, hi };

/** Strings for the chosen language. Re-renders when the language changes. */
export function useT(): Strings & { lang: Lang } {
  const l = useLang();
  return { ...DICT[l], lang: l };
}
