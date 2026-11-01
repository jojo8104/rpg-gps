/** Une pose statique, sans orientation ni animation de marche. */
export function watchLookoutSprite() {
  const scale = 40 / 485;
  const width = 657 * scale;
  const image = new URL(
    "../../assets/groups/watch-lookout-v1.png",
    import.meta.url,
  ).href;
  return `<span class="rpg-watch-lookout" aria-hidden="true" style="width:${width}px;height:40px;left:${32 - width / 2}px;background-image:url('${image}');background-size:${1536 * scale}px ${1024 * scale}px;background-position:${-444 * scale}px ${-288 * scale}px"></span>`;
}
