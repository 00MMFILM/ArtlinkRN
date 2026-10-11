export const ART_REGIONS = [
  ['top-left', '왼쪽 위', 'Top left'], ['top-center', '위쪽 가운데', 'Top centre'], ['top-right', '오른쪽 위', 'Top right'],
  ['middle-left', '왼쪽 가운데', 'Middle left'], ['center', '가운데', 'Centre'], ['middle-right', '오른쪽 가운데', 'Middle right'],
  ['bottom-left', '왼쪽 아래', 'Bottom left'], ['bottom-center', '아래쪽 가운데', 'Bottom centre'], ['bottom-right', '오른쪽 아래', 'Bottom right'],
];
export const artworkPhotos = (note) => (note?.images || []).filter(item => item?.uri && item.type !== 'video');
export const validArtRegion = (value) => ART_REGIONS.some(([id]) => id === value) ? value : null;
export function artworkRegionContext(images) {
  const lines = images.map((image, index) => {
    const region = ART_REGIONS.find(([id]) => id === image?.reviewRegion);
    return region ? `Image ${index + 1}: the artist asks you to examine the ${region[2].toLowerCase()} region.` : '';
  }).filter(Boolean);
  return lines.length ? `\n\n[Artist-selected areas of attention]\n${lines.join('\n')}\nThese are requests, not observed flaws. Refer only to visible evidence. Relate suggestions to the stated artistic intent; do not treat a style preference as an objective error.` : '';
}
