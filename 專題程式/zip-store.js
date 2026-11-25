(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ZipStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const CHUNK = 4 * 1024 * 1024;
    let table = null;

    function crcTable() {
        if (table) return table;
        table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    }

    function crc32(bytes, previous = 0) {
        const t = crcTable();
        let c = ~previous >>> 0;
        for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return ~c >>> 0;
    }

    async function blobCrc(blob) {
        let crc = 0;
        for (let offset = 0; offset < blob.size; offset += CHUNK) {
            crc = crc32(new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer()), crc);
        }
        return crc;
    }

    function dosTime(date) {
        return {
            time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
            date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
        };
    }

    // Uncompressed ("stored") zip: every file is already compressed or small text, so no deflate is needed.
    // Parts are Blob slices, so the video is not copied into memory a second time.
    async function buildZip(files, now = new Date()) {
        const stamp = dosTime(now);
        const parts = [];
        const central = [];
        let offset = 0;
        for (const [name, blob] of Object.entries(files)) {
            const nameBytes = new TextEncoder().encode(name);
            const crc = await blobCrc(blob);
            if (blob.size > 0xFFFFFFFE || offset > 0xFFFFFFFE) throw new Error('檔案超過 4 GB，無法打包');
            const header = new DataView(new ArrayBuffer(30));
            header.setUint32(0, 0x04034B50, true);
            header.setUint16(4, 20, true);
            header.setUint16(6, 0x0800, true);
            header.setUint16(8, 0, true);
            header.setUint16(10, stamp.time, true);
            header.setUint16(12, stamp.date, true);
            header.setUint32(14, crc, true);
            header.setUint32(18, blob.size, true);
            header.setUint32(22, blob.size, true);
            header.setUint16(26, nameBytes.length, true);
            header.setUint16(28, 0, true);
            parts.push(header.buffer, nameBytes, blob);
            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014B50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint16(8, 0x0800, true);
            entry.setUint16(12, stamp.time, true);
            entry.setUint16(14, stamp.date, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, blob.size, true);
            entry.setUint32(24, blob.size, true);
            entry.setUint16(28, nameBytes.length, true);
            entry.setUint32(42, offset, true);
            central.push(entry.buffer, nameBytes);
            offset += 30 + nameBytes.length + blob.size;
        }
        const centralSize = central.reduce((sum, p) => sum + (p.byteLength ?? p.length), 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054B50, true);
        end.setUint16(8, Object.keys(files).length, true);
        end.setUint16(10, Object.keys(files).length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);
        return new Blob([...parts, ...central, end.buffer], {type: 'application/zip'});
    }

    return {crc32, buildZip};
});
