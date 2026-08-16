import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pngDimensions } from '../scripts/render-dashboard-v2-png.mjs';

describe('dashboard v2 PNG validation', () => {
  it('reads the fixed TV dimensions from a PNG header', () => {
    const bytes = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
    bytes.write('IHDR', 12, 'ascii');
    bytes.writeUInt32BE(2560, 16);
    bytes.writeUInt32BE(1440, 20);

    assert.deepEqual(pngDimensions(bytes), { width: 2560, height: 1440 });
  });

  it('rejects non-PNG screenshot output', () => {
    assert.throws(() => pngDimensions(Buffer.from('not a png')), /valid PNG/);
  });
});
