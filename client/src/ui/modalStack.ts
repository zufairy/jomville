/** Open VIP popups in mount order; only the top one reacts to Esc. */
const stack: symbol[] = [];

export function pushModal(id: symbol) {
  stack.push(id);
}

export function popModal(id: symbol) {
  const i = stack.indexOf(id);
  if (i >= 0) stack.splice(i, 1);
}

export function isTopModal(id: symbol) {
  return stack[stack.length - 1] === id;
}

export function modalDepth(id: symbol) {
  return stack.indexOf(id);
}
