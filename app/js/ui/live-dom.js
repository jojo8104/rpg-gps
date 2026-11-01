// Patch content in place so focus, scroll position and surrounding menus survive.
export function patchLiveElement(current, next) {
  if (
    current.nodeType !== next.nodeType ||
    current.nodeName !== next.nodeName
  ) {
    current.replaceWith(next);
    return;
  }
  if (current.nodeType === 3) {
    if (current.nodeValue !== next.nodeValue)
      current.nodeValue = next.nodeValue;
    return;
  }
  if (current.nodeType !== 1) return;
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name))
      current.removeAttribute(attribute.name);
  }
  for (const attribute of next.attributes) {
    if (current.getAttribute(attribute.name) !== attribute.value)
      current.setAttribute(attribute.name, attribute.value);
  }
  let cursor = current.firstChild;
  for (const child of [...next.childNodes]) {
    const key =
      child.nodeType === 1 ? child.getAttribute("data-live-key") : null;
    if (key && cursor?.getAttribute?.("data-live-key") !== key) {
      const match = [...current.children].find(
        (item) => item.getAttribute("data-live-key") === key,
      );
      if (match) {
        current.insertBefore(match, cursor);
        cursor = match;
      } else {
        current.insertBefore(child, cursor);
        continue;
      }
    }
    if (!cursor) {
      current.append(child);
      continue;
    }
    const following = cursor.nextSibling;
    patchLiveElement(cursor, child);
    cursor = following;
  }
  while (cursor) {
    const following = cursor.nextSibling;
    cursor.remove();
    cursor = following;
  }
}
