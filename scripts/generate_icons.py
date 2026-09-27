import zlib
import struct
import math
import os

def create_png(width, height, pixel_func, filename):
    raw_rows = []
    for y in range(height):
        row = [0] # filter byte 0 (None)
        for x in range(width):
            r, g, b, a = pixel_func(x, y, width, height)
            row.extend([r, g, b, a])
        raw_rows.append(bytes(row))
    raw_data = b''.join(raw_rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
        chunk(b'IDAT', zlib.compress(raw_data, 9)) +
        chunk(b'IEND', b'')
    )

    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Generated {filename} ({len(png)} bytes)")

def draw_icon(x, y, w, h, is_maskable=False):
    # Normalized coords from -1.0 to 1.0
    nx = (x / (w - 1)) * 2 - 1
    ny = (y / (h - 1)) * 2 - 1

    # Base background:
    # Deep indigo: #4338ca (67, 56, 202) gradient to #312e81 (49, 46, 129)
    bg_r = int(79 - (ny + 1) * 15)
    bg_g = int(70 - (ny + 1) * 12)
    bg_b = int(229 - (ny + 1) * 35)

    if is_maskable:
        scale = 0.65  # Keep content inside safe zone (65% diameter)
    else:
        scale = 0.82
        # Rounded corner for non-maskable (radius ~ 22% of dimension)
        corner_r = 0.22
        ax = abs(nx)
        ay = abs(ny)
        if ax > (1 - corner_r) and ay > (1 - corner_r):
            dx = ax - (1 - corner_r)
            dy = ay - (1 - corner_r)
            dist = math.sqrt(dx*dx + dy*dy)
            if dist > corner_r:
                # Outside rounded rect
                return 0, 0, 0, 0
            elif dist > corner_r - 0.02:
                # Anti-alias edge
                alpha = int(255 * (corner_r - dist) / 0.02)
                return bg_r, bg_g, bg_b, max(0, min(255, alpha))

    # Scale coordinates for central icon
    cx = nx / scale
    cy = (ny + 0.05) / scale # slight upward offset

    dist_center = math.sqrt(cx*cx + cy*cy)
    angle = math.atan2(cy, cx) # -pi to pi

    # Gauge arc: from -140 deg to +40 deg (where angle around top is negative y)
    # in screen coords, top is cy < 0, bottom is cy > 0
    # Let's map angle: math.atan2(cy, cx)
    # top is -pi/2 (-1.57 rad). Gauge sweeps from ~-2.6 rad to ~0.5 rad (or angle in radians)
    is_in_gauge_ring = (0.58 <= dist_center <= 0.76)
    
    # Check gauge angular sweep: open at bottom (between ~0.6 rad and ~2.5 rad)
    # The opening is at bottom: angle > 0.6 and angle < 2.54
    is_gauge_angle = not (0.7 < angle < 2.44)

    # Needle: angle pointing towards ~-1.2 rad (about 70 mph / 110 kmh)
    needle_angle = -0.95
    diff_needle = abs(angle - needle_angle)
    if diff_needle > math.pi:
        diff_needle = 2 * math.pi - diff_needle
    is_needle = (dist_center < 0.65 and diff_needle < (0.07 * (1.0 - dist_center * 0.7)))

    # Odometer digital box in lower center:
    # cx in [-0.48, 0.48], cy in [0.22, 0.52]
    is_odo_box = (-0.46 <= cx <= 0.46) and (0.20 <= cy <= 0.48)
    is_odo_border = is_odo_box and (cx < -0.42 or cx > 0.42 or cy < 0.23 or cy > 0.45)
    is_odo_interior = is_odo_box and not is_odo_border

    # Odometer digits imitation (digit slots)
    is_digit_bar = False
    if is_odo_interior and (0.27 <= cy <= 0.41):
        # 5 digit columns
        col = (cx + 0.40) / 0.80 * 5.0
        col_frac = col - math.floor(col)
        if 0.15 <= col_frac <= 0.85:
            is_digit_bar = True

    # Center hub
    is_hub = (dist_center < 0.15)
    is_hub_inner = (dist_center < 0.08)

    # Draw layers
    if is_hub_inner:
        return 56, 189, 248, 255 # Bright cyan hub center
    elif is_hub:
        return 255, 255, 255, 255 # White hub rim
    elif is_needle:
        return 244, 63, 94, 255 # Rose/Red needle
    elif is_in_gauge_ring and is_gauge_angle:
        # Gradient along gauge: cyan to emerald to white
        return 255, 255, 255, 245
    elif is_odo_border:
        return 148, 163, 184, 255 # Slate 400 border
    elif is_digit_bar:
        return 56, 189, 248, 255 # Cyan digital readout
    elif is_odo_interior:
        return 15, 23, 42, 255 # Dark slate background for odometer readout

    return bg_r, bg_g, bg_b, 255

os.makedirs('public', exist_ok=True)
create_png(192, 192, lambda x, y, w, h: draw_icon(x, y, w, h, False), 'public/pwa-192x192.png')
create_png(512, 512, lambda x, y, w, h: draw_icon(x, y, w, h, False), 'public/pwa-512x512.png')
create_png(512, 512, lambda x, y, w, h: draw_icon(x, y, w, h, True), 'public/pwa-maskable-512x512.png')
create_png(180, 180, lambda x, y, w, h: draw_icon(x, y, w, h, False), 'public/apple-touch-icon.png')
