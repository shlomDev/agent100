// On-phone storage (localStorage). Nothing here is ever sent to our server,
// except handwriting examples, which go along with a page you ask us to read.

const NOTEBOOKS = 'a100:notebooks';
const HANDWRITING = 'a100:handwriting';
const MAX_EXAMPLES = 30;

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // full or blocked
  }
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const notebooks = {
  all() {
    const v = read(NOTEBOOKS, []);
    return Array.isArray(v) ? v : [];
  },
  upsert(nb) {
    const list = notebooks.all().filter((x) => x.id !== nb.id);
    list.unshift(nb);
    return write(NOTEBOOKS, list);
  },
  remove(id) {
    return write(NOTEBOOKS, notebooks.all().filter((x) => x.id !== id));
  },
  // Mark that you gave back to someone on a saved notebook row.
  markReturned(id, rowIndex, returned) {
    const list = notebooks.all();
    const nb = list.find((x) => x.id === id);
    if (!nb || !nb.rows[rowIndex]) return false;
    nb.rows[rowIndex].returned = returned;
    return write(NOTEBOOKS, list);
  },
};

// Your handwriting memory: crops you corrected + the right reading.
export const handwriting = {
  all() {
    const v = read(HANDWRITING, []);
    return Array.isArray(v) ? v : [];
  },
  add(example) {
    const list = [example, ...handwriting.all()].slice(0, MAX_EXAMPLES);
    // If storage is full, drop the oldest until it fits.
    while (list.length && !write(HANDWRITING, list)) list.pop();
  },
  clear() {
    write(HANDWRITING, []);
  },
  // The newest few, in the shape /api/notebook expects.
  forRequest(k = 6) {
    return handwriting.all().slice(0, k).map((e) => ({
      image: { data: e.dataUrl.slice(e.dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' },
      text: e.text,
    }));
  },
};
