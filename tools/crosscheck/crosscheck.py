"""Independent re-computation of the timing pipeline in pure Python (standard library only), to cross-check the JavaScript.

  node tools/crosscheck/dump.cjs > dump.json
  python3 tools/crosscheck/crosscheck.py dump.json            # exact checks: filter, zero-phase, detectTiming
  python3 tools/crosscheck/crosscheck.py dump.json --mc       # also a Monte Carlo with its own RNG and code

Written from the method description (bilinear-transform Butterworth sections, natural cubic spline solved with the
Thomas algorithm, 1 ms velocity grid), not copied from motion-core.js, so a shared mistake is unlikely.
"""
import bisect, cmath, json, math, random, statistics, sys

def biquad(fc, fs):
    """Second-order Butterworth low-pass by the bilinear transform: analog poles at 45 degrees (Q = 1/sqrt 2)."""
    if fc >= fs / 2: fc = fs / 2 - 0.1
    k = math.tan(math.pi * fc / fs)
    q = 1 / math.sqrt(2)
    n = 1 / (1 + k / q + k * k)
    b0 = k * k * n
    return (b0, 2 * b0, b0, 2 * (k * k - 1) * n, (1 - k / q + k * k) * n)

def run_cascade(xs, fc, fs):
    """Two identical sections in series, direct form I, state initialised to the first sample (steady state)."""
    out = xs
    for _ in range(2):
        b0, b1, b2, a1, a2 = biquad(fc, fs)
        x1 = x2 = y1 = y2 = out[0]
        nxt = []
        for x in out:
            y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1, y2, y1 = x1, x, y1, y
            nxt.append(y)
        out = nxt
    return out

def gain_at(freq, fc, fs):
    b0, b1, b2, a1, a2 = biquad(fc, fs)
    z = cmath.exp(-2j * math.pi * freq / fs)
    h = (b0 + b1 * z + b2 * z * z) / (1 + a1 * z + a2 * z * z)
    return abs(h) ** 2  # two identical sections

def zero_phase(xs, fc, fs):
    if len(xs) < 3: return xs[:]
    pad = min(len(xs) - 1, max(3, round(fs / 2)))
    head = [2 * xs[0] - xs[i] for i in range(pad, 0, -1)]
    tail = [2 * xs[-1] - xs[len(xs) - 1 - i] for i in range(1, pad + 1)]
    fwd = run_cascade(head + xs + tail, fc, fs)
    bwd = run_cascade(fwd[::-1], fc, fs)[::-1]
    return bwd[pad:pad + len(xs)]

def natural_spline(x, y):
    """Natural cubic spline through (x, y), second derivatives by the Thomas algorithm; returns evaluator."""
    n = len(x)
    h = [x[i + 1] - x[i] for i in range(n - 1)]
    sub = [0.0] * n; diag = [1.0] * n; sup = [0.0] * n; rhs = [0.0] * n
    for i in range(1, n - 1):
        sub[i] = h[i - 1]; diag[i] = 2 * (h[i - 1] + h[i]); sup[i] = h[i]
        rhs[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1])
    for i in range(1, n):
        m = sub[i] / diag[i - 1]
        diag[i] -= m * sup[i - 1]; rhs[i] -= m * rhs[i - 1]
    m2 = [0.0] * n
    m2[n - 1] = rhs[n - 1] / diag[n - 1]
    for i in range(n - 2, -1, -1):
        m2[i] = (rhs[i] - sup[i] * m2[i + 1]) / diag[i]
    def f(t):
        if t <= x[0]: return y[0]
        if t >= x[-1]: return y[-1]
        i = bisect.bisect_left(x, t) - 1
        d = t - x[i]; hi = h[i]
        a = (m2[i + 1] - m2[i]) / (6 * hi)
        b = m2[i] / 2
        c = (y[i + 1] - y[i]) / hi - hi * (2 * m2[i] + m2[i + 1]) / 6
        return y[i] + c * d + b * d * d + a * d ** 3
    return f

def detect(samples, threshold=10.0):
    if len(samples) < 10: return {'reason': 'INSUFFICIENT_SAMPLES'}
    ts = [s['t'] for s in samples]
    if any(ts[i] <= ts[i - 1] for i in range(1, len(ts))): return {'reason': 'INVALID_TIMESTAMPS'}
    sk = natural_spline(ts, [s['kn'] for s in samples]); se = natural_spline(ts, [s['eb'] for s in samples])
    start, end = math.ceil(ts[0]), math.floor(ts[-1])
    kv = []; ev = []
    for t in range(start, end + 1):
        kv.append((t, (sk(t) - sk(t - 1)) / 0.001)); ev.append((t, (se(t) - se(t - 1)) / 0.001))
    me = max(v for _, v in ev); pe = next(t for t, v in ev if v == me)
    # knee event: fastest knee extension from KNEE_WINDOW_MS before the elbow peak up to the elbow peak
    kf = max(start, pe - 400); kwin = [(t, v) for t, v in kv if kf <= t <= pe]
    mk = max(v for _, v in kwin); tk = next(t for t, v in kwin if v == mk)
    if mk <= 0: return {'reason': 'KNEE_EXTENSION_NOT_FOUND'}
    if me <= threshold: return {'reason': 'ELBOW_EXTENSION_NOT_FOUND'}
    tol = 4096 * 2.220446049250313e-16 * max(1, abs(mk)); tol2 = 4096 * 2.220446049250313e-16 * max(1, abs(me))
    if kv[-1][1] >= mk - tol or ev[-1][1] >= me - tol2: return {'reason': 'PEAK_AT_WINDOW_END'}
    te = None
    for t in range(pe, start, -1):
        if (se(t) - se(t - 1)) / 0.001 <= threshold: te = t; break
    if te is None: return {'reason': 'ELBOW_ONSET_NOT_FOUND'}
    return {'dt': te - tk, 'kneePeak': tk, 'elbowOnset': te, 'elbowPeak': pe}

def exact_checks(d):
    worst = 0.0
    for c in d['filterCases']:
        y = run_cascade(c['x'], c['fc'], c['fs'])
        worst = max(worst, max(abs(a - b) for a, b in zip(y, c['y'])))
    print(f"[1] cascade filter: 5 cases, max |python - js| = {worst:.2e}  ->", 'OK' if worst < 1e-9 else 'MISMATCH')
    z = d['zp']; yz = zero_phase(z['x'], z['fc'], z['fs']); wz = max(abs(a - b) for a, b in zip(yz, z['y']))
    print(f"[2] zero-phase filter: max difference = {wz:.2e}  ->", 'OK' if wz < 1e-9 else 'MISMATCH')
    print(f"[3] gain of the two-section cascade at the cutoff: {gain_at(10, 10, 28):.3f} (a true 4th-order Butterworth has 0.707; two identical Q=0.707 sections give 0.500, i.e. -6 dB)")
    bad = ok = 0; reasons = 0
    for w in d['windows']:
        r = detect(w['s'], d['threshold'])
        if r.get('reason') or w['reason']:
            if r.get('reason') == w['reason']: reasons += 1
            else: bad += 1; print('   reason mismatch', r.get('reason'), w['reason'])
        elif (r['dt'], r['kneePeak'], r['elbowOnset'], r['elbowPeak']) == (w['dt'], w['kneePeak'], w['elbowOnset'], w['elbowPeak']): ok += 1
        else: bad += 1; print('   mismatch', r, w['dt'], w['kneePeak'], w['elbowOnset'], w['elbowPeak'])
    print(f"[4] detectTiming on {len(d['windows'])} windows: {ok} identical results, {reasons} identical rejections, {bad} mismatches ->", 'OK' if bad == 0 else 'MISMATCH')
    return bad == 0 and worst < 1e-9 and wz < 1e-9

def logistic(x): return 1 / (1 + math.exp(-x))

def mc(n=1000, seed=7):
    """Own Monte Carlo of the baseline condition (28 fps, 2 deg noise, 8 ms jitter): unfiltered vs 10 Hz cascade."""
    r = random.Random(seed)
    res = {'none': ([], []), 'bw10': ([], [])}
    fps, noise, jit = 28, 2.0, 8.0
    for _ in range(n):
        t_down = 600 + r.random() * 100; tau_down = 60 + r.random() * 30
        t_knee = t_down + 380 + r.random() * 160; tau_knee = 40 + r.random() * 25
        dt_peak = 60 + r.random() * 140; t_elb = t_knee + dt_peak; tau_elb = 25 + r.random() * 15
        knee = lambda t: 170 - 60 * logistic((t - t_down) / tau_down) + 60 * logistic((t - t_knee) / tau_knee)
        elbow = lambda t: 70 + 105 * logistic((t - t_elb) / tau_elb)
        vel = lambda t: 105 * logistic((t - t_elb) / tau_elb) * (1 - logistic((t - t_elb) / tau_elb)) / tau_elb * 1000
        t_on = t_elb
        while vel(t_on) > 10: t_on -= 0.01
        raw = []; trig = []
        # live filter state for the trigger and the 10 Hz candidate (identical filters, run sample by sample)
        coefs = biquad(10, fps)
        def mk(): return {'x1': None}
        def step(st, x):
            b0, b1, b2, a1, a2 = coefs
            out = x
            for s in range(2):
                if st[s] is None: st[s] = [out] * 4
                x1, x2, y1, y2 = st[s]
                y = b0 * out + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
                st[s] = [out, x1, y, y1]; out = y
            return out
        fk = [None, None]; fe = [None, None]
        state = 'IDLE'; pk = pe_ = None; last = None; rec = []; done = False
        i = 0
        while True:
            tc = i * 1000 / fps; i += 1
            if tc > t_elb + 1500: break
            now = tc + 40 + abs(r.gauss(0, 1)) * jit
            if last is not None and now <= last: continue
            rk = knee(tc) + r.gauss(0, 1) * noise; re = elbow(tc) + r.gauss(0, 1) * noise
            sk_, se_ = step(fk, rk), step(fe, re)
            if pk is not None:
                ds = (now - last) / 1000; kv = (sk_ - pk) / ds
                if state == 'IDLE' and sk_ < 155 and kv < -40: state = 'REC'; rec = []
                elif state == 'REC':
                    rec.append({'t': now, 'rk': rk, 're': re, 'fk': sk_, 'fe': se_})
                    if (se_ > 155 and (se_ - pe_) / ds < 40) or now - rec[0]['t'] > 1700: done = True; break
            pk, pe_, last = sk_, se_, now
        if not done: continue
        truth_peak, truth_on = t_elb - t_knee, t_on - t_knee
        for name, kk, ee in (('none', 'rk', 're'), ('bw10', 'fk', 'fe')):
            out = detect([{'t': s['t'], 'kn': s[kk], 'eb': s[ee]} for s in rec])
            if 'dt' in out:
                res[name][0].append(out['dt'] - truth_on); res[name][1].append((out['elbowPeak'] - out['kneePeak']) - truth_peak)
    for name, (on, pk_) in res.items():
        print(f"    {name:5s} n={len(pk_)} peak error mean {statistics.mean(pk_):6.1f} SD {statistics.stdev(pk_):5.1f} | onset mean {statistics.mean(on):6.1f} SD {statistics.stdev(on):5.1f}")

if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    ok = exact_checks(d)
    if '--mc' in sys.argv:
        print('[5] independent Monte Carlo, N=1000, baseline condition (JS reported: none peak -2.5 +- 53.1, onset 52.1 +- 60.2; bw10 peak 0.5 +- 43.3, onset 31.2 +- 51.2):')
        mc()
    sys.exit(0 if ok else 1)
