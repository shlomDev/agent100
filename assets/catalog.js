// The Agent 100 catalog. status: live | soon. Numbers not listed are free slots.
// Zuzei agents (#1–#6) live on the Zuzei site; set ZUZEI to its URL.
export const ZUZEI = 'https://zuzei.vercel.app';

export const CATEGORIES = {
  money: 'מחזירים כסף',
  time: 'חוסכים זמן',
  docs: 'מסמכים וכתב יד',
  biz: 'לעסקים',
};

export const AGENTS = [
  { n: 1, name: 'הודעות ספאם', sub: 'עד 1,000 ₪ על כל הודעת פרסומת בלי הסכמה', cat: 'money', status: 'live', href: `${ZUZEI}/spam` },
  { n: 2, name: 'החזרה בחנות', sub: 'ביטול עסקה בתוך 14 ימים', cat: 'money', status: 'live', href: `${ZUZEI}/` },
  { n: 3, name: 'ביטול קנייה באינטרנט', sub: 'עסקת מכר מרחוק', cat: 'money', status: 'live', href: `${ZUZEI}/` },
  { n: 4, name: 'מוצר פגום', sub: 'תיקון, החלפה או החזר', cat: 'money', status: 'live', href: `${ZUZEI}/` },
  { n: 5, name: 'מנוי שלא מבטלים', sub: 'עסקה מתמשכת', cat: 'money', status: 'live', href: `${ZUZEI}/` },
  { n: 6, name: 'פיקדון שכירות', sub: 'המשכיר לא מחזיר', cat: 'money', status: 'live', href: `${ZUZEI}/` },
  { n: 7, name: 'טיסה שאיחרה', sub: 'פיצוי על עיכוב או ביטול טיסה', cat: 'money', status: 'soon' },
  { n: 8, name: 'עמלות בנק', sub: 'מעלים דף חשבון, מוצאים עמלות חשודות', cat: 'money', status: 'soon' },
  { n: 9, name: 'התייקרות', sub: 'סלולר, טלוויזיה, אינטרנט וביטוח', cat: 'money', status: 'soon' },
  { n: 10, name: 'דו"ח חניה', sub: 'ערעור בזמן', cat: 'money', status: 'soon' },
  { n: 11, name: 'ביטוח משלים', sub: 'החזרים מקופת החולים', cat: 'money', status: 'soon' },
  { n: 12, name: 'בדיקת החזר מס', sub: 'האם כדאי לבדוק (בדיקה מקדימה בלבד)', cat: 'money', status: 'soon' },
  { n: 13, name: 'חשבונות מה-SMS', sub: 'חשמל, מים, ארנונה: תזכורת לפני המועד', cat: 'time', status: 'soon' },
  { n: 14, name: 'טכנאי ותורים', sub: 'מה-SMS ישר ליומן', cat: 'time', status: 'soon' },
  { n: 15, name: 'טסט, רישיון וביטוח', sub: 'תזכורות לרכב', cat: 'time', status: 'soon' },
  { n: 16, name: 'הנחה בארנונה', sub: 'האם מגיעה לכם', cat: 'money', status: 'soon' },
  { n: 17, name: 'זכויות מילואים', sub: 'מה מגיע לכם ואיך מבקשים', cat: 'money', status: 'soon' },
  { n: 18, name: 'לידים בוואטסאפ', sub: 'עונה, מסנן וקובע ביקור', cat: 'biz', status: 'soon' },
  { n: 19, name: 'בדיקת חוק הספאם', sub: 'לפני ששולחים קמפיין SMS', cat: 'biz', status: 'soon' },
  { n: 20, name: 'קבלות לעוסק פטור', sub: 'מצילום לטבלה', cat: 'biz', status: 'soon' },
  { n: 21, name: 'טופס מתמונה', sub: 'ממלאים טופס רשמי מצילום מסמכים', cat: 'docs', status: 'soon' },
  { n: 22, name: 'התאמת מכרזים', sub: 'מכרזים חדשים שמתאימים לעסק', cat: 'biz', status: 'soon' },
  { n: 23, name: 'קבלה ← אחריות', sub: 'תזכורת לפני שהאחריות נגמרת', cat: 'time', status: 'soon' },
  { n: 24, name: 'מחברת המעטפות', sub: 'מכתב יד לטבלה: מי נתן כמה', cat: 'docs', status: 'live', href: '/notebook' },
  { n: 25, name: 'הזמנה ← כמה הם נתנו', sub: 'צילום הזמנה, והסכום שהם נתנו לכם', cat: 'docs', status: 'live', href: '/invite' },
];
