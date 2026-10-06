// GROUP minimap-draft-overlay-placement — the draft label + action bar sit as one group inside the minimap strip,
// never under a handle. Origin: 2026-10-06 usability round E3.
group("minimap-draft-overlay-placement");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("minimap-draft-overlay-placement a. minimapDraftGroupLeft");
    const W = 1000, G = 300;
    const L = o => w.minimapDraftGroupLeft(Object.assign({ W, fromVisible: true, toVisible: true, groupW: G }, o));
    const overlaps = (left, x) => left < x + 11 && left + G > x - 11;
    let l = L({ xa: 100, xb: 800 });
    assert(Math.abs(l - (450 - G / 2)) < 0.01, "wide window: centered, got " + l);
    assert(l >= 100 + 25 && l + G <= 800 - 25, "…with 14px clearance to both handle boxes");
    l = L({ xa: 480, xb: 520 });
    assert(l === 534, "narrow window in the middle: right of the to-handle (roomier side), got " + l);
    assert(!overlaps(l, 480) && !overlaps(l, 520), "…overlapping neither handle box");
    l = L({ xa: 700, xb: 740 });
    assert(l === 700 - 14 - G && !overlaps(l, 700) && !overlaps(l, 740), "narrow, more room on the left: left of the from-handle, got " + l);
    l = L({ xa: 950, xb: 990 });
    assert(l === 950 - 14 - G && !overlaps(l, 950) && !overlaps(l, 990), "narrow at the right edge: left of the from-handle, got " + l);
    l = L({ xa: -50, xb: 300, fromVisible: false, groupW: 200 });
    assert(l === 50, "from handle hidden: centered on the visible window, no clearance needed on the left, got " + l);
    l = L({ xa: 0, xb: 260, fromVisible: false, groupW: 200 });
    assert(l === 30, "hidden from handle: only the to side needs clearance, got " + l);
    assert(l + 200 <= 260 - 25, "…group ends 25px before the to-handle center, got " + l);
    l = L({ xa: 10, xb: 20, groupW: 1010 });
    assert(l === 4, "group wider than the strip: clamped to 4, got " + l);
    l = L({ xa: 990, xb: 995, groupW: 200 });
    assert(l >= 4 && l + 200 <= W - 4, "clamped to [4, W-4], got " + l);
  });
}
