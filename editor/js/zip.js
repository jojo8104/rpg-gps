/** Archive ZIP sans compression ni dépendance, avec contrôle CRC32. */
export function createZip(files) {
  const encoder = new TextEncoder(),
    locals = [],
    central = [];
  let offset = 0;
  const bytes = (size) => {
    const buffer = new Uint8Array(size);
    return { buffer, view: new DataView(buffer.buffer) };
  };
  for (const { name, content } of files) {
    const filename = encoder.encode(name),
      data = content instanceof Uint8Array ? content : encoder.encode(content),
      crc = crc32(data);
    const local = bytes(30 + filename.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, filename.length, true);
    local.buffer.set(filename, 30);
    locals.push(local.buffer, data);
    const header = bytes(46 + filename.length);
    header.view.setUint32(0, 0x02014b50, true);
    header.view.setUint16(4, 20, true);
    header.view.setUint16(6, 20, true);
    header.view.setUint16(8, 0x0800, true);
    header.view.setUint32(16, crc, true);
    header.view.setUint32(20, data.length, true);
    header.view.setUint32(24, data.length, true);
    header.view.setUint16(28, filename.length, true);
    header.view.setUint32(42, offset, true);
    header.buffer.set(filename, 46);
    central.push(header.buffer);
    offset += local.buffer.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0),
    end = bytes(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, size, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...locals, ...central, end.buffer], {
    type: "application/zip",
  });
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
