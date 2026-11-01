"""Mesure seulement les pixels alpha : ne modifie pas les images générées."""
import json
import statistics
import sys
from PIL import Image


def runs(values):
    groups = []
    for value in values:
        if not groups or value > groups[-1][-1] + 1:
            groups.append([])
        groups[-1].append(value)
    return [(group[0], group[-1] + 1) for group in groups]


image = Image.open(sys.argv[1])
alpha = image.getchannel('A').point(lambda value: 255 if value > 40 else 0)
rows = runs([y for y in range(image.height) if alpha.crop((0, y, image.width, y + 1)).getbbox()])
assert len(rows) == 5, rows
atlas = []
for top, bottom in rows:
    row = alpha.crop((0, top, image.width, bottom))
    columns = runs([x for x in range(image.width) if row.crop((x, 0, x + 1, row.height)).getbbox()])
    assert len(columns) == 3, columns
    poses = []
    for left, right in columns:
        box = alpha.crop((left, top, right, bottom)).getbbox()
        x, y, end_x, end_y = left + box[0], top + box[1], left + box[2], top + box[3]
        head = alpha.crop((x, y, end_x, y + int((end_y - y) * .28))).getbbox()
        axis = x + (head[0] + head[2]) / 2
        poses.append(dict(x=x, y=y, width=end_x-x, height=end_y-y, axis=axis))
    atlas.append(poses)
print(json.dumps(dict(width=image.width, height=image.height, scale=64 / statistics.median(p['height'] for row in atlas for p in row), poses=atlas)))
