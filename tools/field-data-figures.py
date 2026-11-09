"""Figures from the August 2026 phone test sessions, for the project report.

The raw sessions stay in the private local archive (they are never committed). Run:
    python3 tools/field-data-figures.py <archive folder> <output folder>
The archive folder is the one holding Phase0_2026-08-06/ and Phase1A_2026-08-17/.
Only the files listed below are read; videos and landmarks are not needed.
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib import font_manager

for name in ("Noto Sans CJK TC", "Noto Sans CJK JP", "Noto Sans CJK SC"):
    if any(name in f.name for f in font_manager.fontManager.ttflist):
        plt.rcParams["font.family"] = name
        break
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 200, "font.size": 10})
INK, MUTED, KNEE, ELBOW, BAND = "#18352a", "#617168", "#2f6b8f", "#c4622d", "#e9efe4"

archive, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
p0, p1 = archive / "Phase0_2026-08-06", archive / "Phase1A_2026-08-17"
VISUAL, AUDITORY = p1 / "231018_visual_self-hosted-v5_6-trials", p1 / "231452_auditory_self-hosted-v5_7-trials"
summary = {}


def save(fig, name):
    fig.savefig(out / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# 1. Device comparison (Phase 0, five-minute diagnostic per phone).
devices = [("iPhone 15 Pro（iOS 18、Safari）", p0 / "phase0_2026-08-06_iphone15pro_diagnostics.json"),
           ("Samsung Galaxy A60（Android 10、Chrome）", p0 / "phase0_2026-08-06_galaxy-a60_diagnostics.json")]
rows, cols = [], []
for label, f in devices:
    d = json.loads(f.read_text())
    perf = d["performance"]
    fi, inf = perf["frameIntervalMs"], perf["inferenceDurationMs"]
    cols.append(label)
    rows.append([f"{d['diagnosticDurationSec']:.0f} 秒", f"{perf['presentedFrameCount']:,}", f"{perf['calculatedMeanFps']:.2f}",
                 f"{fi['median']:.0f} / {fi['p95']:.0f}", f"{inf['median']:.0f} / {inf['p95']:.0f}", f"{inf['max']:,.0f}",
                 f"{perf['longFrameCount']}（{perf['longFrameRatePercent']}%）"])
    summary[label] = {"fps": perf["calculatedMeanFps"], "inferenceMedianMs": inf["median"], "inferenceMaxMs": inf["max"]}
labels = ["測試長度", "畫面數", "平均每秒畫面數（fps）", "畫面間隔 中位數 / P95（ms）", "姿態分析耗時 中位數 / P95（ms）", "姿態分析耗時 最大值（ms）", "長停頓畫面"]
fig, ax = plt.subplots(figsize=(8.2, 3.1))
ax.axis("off")
table = ax.table(cellText=list(map(list, zip(*rows))), rowLabels=labels, colLabels=cols, loc="center", cellLoc="center", rowLoc="left")
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1, 1.55)
for (r, c), cell in table.get_celld().items():
    cell.set_edgecolor("#c9d1c7")
    if r == 0:
        cell.set_facecolor("#174f39"); cell.set_text_props(color="white", weight="bold")
    elif c == -1:
        cell.set_facecolor("#f1f5e9")
    if r == 3 and c >= 0:
        cell.set_text_props(weight="bold")
save(fig, "field-device-comparison.png")


# 2–3. Angle signals of the two short iPhone runs, with capture windows and feedback points.
def signals(folder, title, name, note=None):
    s = pd.read_csv(folder / "live-signals.csv")
    t = s.sourceTimestampMs / 1000
    trials = pd.read_csv(folder / "live-trials.csv")
    fig, ax = plt.subplots(figsize=(9, 3.4))
    rec = s.state.eq("RECORDING")
    start = None
    for i, on in enumerate(rec):
        if on and start is None:
            start = t.iloc[i]
        if (not on or i == len(rec) - 1) and start is not None:
            ax.axvspan(start, t.iloc[i], color=BAND, lw=0)
            start = None
    ax.plot(t, s.filteredKneeDeg, color=KNEE, lw=1.3, label="膝關節角度（濾波後）")
    ax.plot(t, s.filteredElbowDeg, color=ELBOW, lw=1.3, label="肘關節角度（濾波後）")
    fb = t[s.state.eq("FEEDBACK")].tolist()
    for i, x in enumerate(fb):
        ax.axvline(x, color=MUTED, lw=0.8, ls=":")
        if i < len(trials):
            tr = trials.iloc[i]
            mark = "" if tr.trialStatus == "accepted" else "（低品質）"
            ax.text(x, 186, f"第{tr.trialOrder}球{mark}\nΔt {tr["dt"]:+.0f}", fontsize=7.5, ha="center", va="bottom", color=INK)
    if note:
        ax.annotate(note[0], note[1], xytext=note[2], fontsize=7.5, color=MUTED, arrowprops={"arrowstyle": "-", "color": MUTED, "lw": 0.6})
    ax.set_ylim(40, 185)
    ax.set_xlim(0, t.max())
    ax.set_xlabel("時間（秒）")
    ax.set_ylabel("角度（度）")
    ax.set_title(title, loc="left", fontsize=11, color=INK, pad=28)
    ax.legend(loc="lower left", fontsize=8, frameon=False, ncol=2)
    ax.text(0.995, 0.02, "淺綠底：系統擷取動作的時段　虛線：系統給回饋的時間點", transform=ax.transAxes, ha="right", fontsize=7.5, color=MUTED)
    save(fig, name)
    return {"frames": len(s), "trials": len(trials), "accepted": int((trials.trialStatus == "accepted").sum())}


summary["visual"] = signals(VISUAL, "8/17 視覺回饋短測（iPhone 15 Pro，41 秒）", "field-signals-visual.png",
                            ("濾波器剛啟動的暫態", (1.1, 78), (2.2, 58)))
summary["auditory"] = signals(AUDITORY, "8/17 聽覺回饋短測（iPhone 15 Pro，44 秒）", "field-signals-auditory.png",
                              ("第一張畫面分析花了 2.4 秒，期間沒有資料", (1.2, 81), (3.2, 58)))

# 4. Pose-analysis time per frame in the two runs (log scale shows the single long stall).
fig, axes = plt.subplots(1, 2, figsize=(9, 2.8), sharey=True)
for ax, (folder, title) in zip(axes, [(VISUAL, "視覺回饋短測"), (AUDITORY, "聽覺回饋短測")]):
    inf = pd.read_csv(folder / "inference-timestamps.csv")
    inf = inf[inf.status.eq("succeeded")]
    x = inf.sourceTimestampMs / 1000
    ax.scatter(x, inf.inferenceDurationMs, s=2, color=KNEE, alpha=0.6)
    worst = inf.inferenceDurationMs.idxmax()
    first = " · 第一張畫面（模型啟動）" if worst == inf.index[0] else ""
    ax.annotate(f"最長 {inf.inferenceDurationMs.max():,.0f} ms{first}", (x[worst], inf.inferenceDurationMs[worst]), textcoords="offset points", xytext=(8, -3), fontsize=8, ha="left", va="center", color=ELBOW)
    ax.set_yscale("log")
    ax.set_title(f"{title}（中位數 {inf.inferenceDurationMs.median():.0f} ms）", fontsize=10, loc="left", color=INK)
    ax.set_xlabel("時間（秒）")
    summary[title] = {"inferenceMedianMs": float(inf.inferenceDurationMs.median()), "inferenceMaxMs": float(inf.inferenceDurationMs.max())}
axes[0].set_ylabel("每張畫面的姿態分析耗時（ms，對數）")
save(fig, "field-inference-time.png")

# 5. Δt of every recorded trial in the August sessions (early algorithm versions).
sessions = [("8/06 iPhone\n裝置診斷", p0 / "phase0_2026-08-06_iphone15pro_trials.csv"),
            ("8/06 Galaxy A60\n裝置診斷", p0 / "phase0_2026-08-06_galaxy-a60_trials.csv"),
            ("8/17 基準\n(v3)", p1 / "221910_baseline_pinned-assets-v3_8-trials" / "live-trials.csv"),
            ("8/17 基準\n(v5)", p1 / "230339_standalone_exports_v5" / "trials.csv"),
            ("8/17 視覺\n(v5)", VISUAL / "live-trials.csv"),
            ("8/17 聽覺\n(v5)", AUDITORY / "live-trials.csv")]
fig, ax = plt.subplots(figsize=(9, 3.6))
ax.axhspan(50, 150, color=BAND, lw=0, label="原訂 50–150 ms（未經驗證）")
dts = []
for i, (label, f) in enumerate(sessions):
    d = pd.read_csv(f)
    ok = d.get("trialStatus", pd.Series(["accepted"] * len(d))).eq("accepted") & d.qualityFlags.eq("OK")
    jitter = [(k % 7 - 3) * 0.05 for k in range(len(d))]
    ax.scatter([i + j for j, o in zip(jitter, ok) if o], d["dt"][ok], s=14, color=KNEE, label="品質合格" if i == 0 else None)
    ax.scatter([i + j for j, o in zip(jitter, ok) if not o], d["dt"][~ok], s=14, facecolors="none", edgecolors=ELBOW, label="品質不合格" if i == 0 else None)
    dts += d["dt"][ok].tolist()
ax.set_xticks(range(len(sessions)), [s[0] for s in sessions], fontsize=8)
ax.set_ylabel("Δt（ms）")
ax.axhline(0, color=MUTED, lw=0.6)
ax.set_xlim(-0.5, len(sessions) - 0.5)
ax.legend(loc="upper right", fontsize=8, frameon=False)
save(fig, "field-dt-early.png")
summary["earlyDt"] = {"n": len(dts), "min": min(dts), "max": max(dts)}

(out / "field-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps(summary, ensure_ascii=False, indent=2))
