// Configs for #13 (bills), #14 (appointments), #23 (receipt → warranty).
// The page picks one by <body data-agent="...">.
import { startReader } from './reader-page.js';
import { addMonths, addDays, daysUntil, heDate } from './lib.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const ils = (n) => (n == null ? '' : `${Number(n).toLocaleString('he-IL')} ₪`);
const byDate = (k) => (a, b) => String(a[k] || '9999').localeCompare(String(b[k] || '9999'));
const when = (iso) => {
  if (!iso) return 'בלי תאריך';
  const d = daysUntil(iso, today());
  return d < 0 ? `עבר לפני ${-d} ימים` : d === 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`;
};

const BILL_TYPES = { electricity: 'חשמל', water: 'מים', arnona: 'ארנונה', gas: 'גז', phone: 'סלולר / טלפון', internet: 'אינטרנט', tv: 'טלוויזיה', insurance: 'ביטוח', other: 'אחר' };

const CONFIGS = {
  bill: {
    kind: 'bill',
    emptyText: 'לא מצאנו חשבון לתשלום בהודעה הזו.',
    fields: [
      { key: 'issuer', label: 'מי שולח את החשבון' },
      { key: 'type', label: 'סוג', type: 'select', options: BILL_TYPES },
      { key: 'amount', label: 'סכום לתשלום (₪)', type: 'number' },
      { key: 'dueDate', label: 'מועד אחרון לתשלום', type: 'date' },
    ],
    toEvent: (it) => it.dueDate && {
      title: `לשלם: ${it.issuer || BILL_TYPES[it.type] || 'חשבון'}${it.amount ? ` ${ils(it.amount)}` : ''}`,
      date: it.dueDate,
      description: 'תזכורת מסוכן 13 של Agent 100',
    },
    needDateText: 'חסר מועד אחרון לתשלום. מלאו אותו ונסו שוב.',
    sort: byDate('dueDate'),
    title: (it) => `${it.issuer || BILL_TYPES[it.type] || 'חשבון'}${it.amount ? ` · ${ils(it.amount)}` : ''}${it.paid ? ' · שולם ✓' : ''}`,
    meta: (it) => (it.dueDate ? `לתשלום עד ${heDate(it.dueDate)} · ${it.paid ? 'שולם' : when(it.dueDate)}` : 'בלי תאריך'),
    savedActions: (it) => [[it.paid ? 'לא שולם' : 'שולם', (x) => ({ ...x, paid: !x.paid })]],
  },

  appointment: {
    kind: 'appointment',
    emptyText: 'לא מצאנו תור או ביקור בהודעה הזו.',
    fields: [
      { key: 'who', label: 'מי' },
      { key: 'what', label: 'מה' },
      { key: 'date', label: 'תאריך', type: 'date' },
      { key: 'from', label: 'משעה', type: 'time' },
      { key: 'to', label: 'עד שעה', type: 'time', hint: 'בחלון זמן של טכנאי, השעה האחרונה בחלון' },
      { key: 'place', label: 'מקום' },
    ],
    toEvent: (it) => it.date && {
      title: [it.what, it.who].filter(Boolean).join(' · ') || 'תור',
      date: it.date,
      start: it.from || undefined,
      end: it.from ? it.to || undefined : undefined,
      location: it.place || '',
      description: it.from && it.to ? `חלון זמן: ${it.from}–${it.to}` : '',
    },
    needDateText: 'חסר תאריך. מלאו אותו ונסו שוב.',
    sort: byDate('date'),
    title: (it) => [it.what, it.who].filter(Boolean).join(' · ') || 'תור',
    meta: (it) => [it.date ? `${heDate(it.date)} · ${when(it.date)}` : 'בלי תאריך', it.from && (it.to ? `${it.from}–${it.to}` : it.from), it.place].filter(Boolean).join(' · '),
  },

  receipt: {
    kind: 'receipt',
    emptyText: 'לא מצאנו מוצר עם אחריות בקבלה הזו.',
    fields: [
      { key: 'product', label: 'מוצר' },
      { key: 'store', label: 'חנות' },
      { key: 'date', label: 'תאריך קנייה', type: 'date' },
      { key: 'amount', label: 'מחיר (₪)', type: 'number' },
      { key: 'warrantyMonths', label: 'אחריות (חודשים)', type: 'number', hint: 'אם לא כתוב בקבלה, בדקו בתעודת האחריות. נפוץ: 12, 24 או 36.' },
    ],
    // Reminder a month before the warranty ends (or on the day if that's sooner).
    toEvent: (it) => {
      if (!it.date || !it.warrantyMonths) return null;
      const end = addMonths(it.date, Number(it.warrantyMonths));
      const remind = addDays(end, -30) > today() ? addDays(end, -30) : end;
      return {
        title: `האחריות על ${it.product || 'המוצר'} נגמרת ב-${heDate(end)}`,
        date: remind,
        description: `נקנה ב-${it.store || ''} ${heDate(it.date)}${it.amount ? `, ${ils(it.amount)}` : ''}. אם יש תקלה, זה הזמן לפנות.`,
      };
    },
    needDateText: 'כדי להזכיר, צריך תאריך קנייה ומשך אחריות.',
    sort: (a, b) => byDate('end')({ end: a.date && a.warrantyMonths ? addMonths(a.date, a.warrantyMonths) : null }, { end: b.date && b.warrantyMonths ? addMonths(b.date, b.warrantyMonths) : null }),
    title: (it) => `${it.product || 'מוצר'}${it.store ? ` · ${it.store}` : ''}`,
    meta: (it) => {
      if (!it.date || !it.warrantyMonths) return 'חסר תאריך או משך אחריות';
      const end = addMonths(it.date, it.warrantyMonths);
      const d = daysUntil(end, today());
      return `אחריות עד ${heDate(end)} · ${d < 0 ? 'הסתיימה' : when(end)}`;
    },
  },
};

startReader(CONFIGS[document.body.dataset.agent]);
