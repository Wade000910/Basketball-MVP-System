# 時序事件匯出與研究用語修正 — 2026-10-29

## 修改目的

舊試次只匯出 `dt`，無法分別檢查膝部事件與手肘事件。本次保留既有數值方法，補存事件估計及其時間定義，供後續驗證使用。

## 事件定義與欄位

`eventDefinitionId` 為 `knee-peak-elbow-onset-v1`。一般試次 CSV 與 Session 的 `live-trials.csv` 均在原有欄位後增加：

| 欄位 | 定義 |
| --- | --- |
| `eventDefinitionId` | 事件定義識別碼 |
| `timingClock` | `pose-result-performance-now`，姿態結果回呼的單調時鐘 |
| `kneePeakPerfMs` | 插值後膝部伸展角速度最大值的估計時間 |
| `elbowOnsetPerfMs` | 從手肘伸展角速度峰值向前搜尋，最後一筆不高於 10 deg/s 的估計時間 |
| `elbowPeakPerfMs` | 手肘伸展角速度最大值的估計時間，供與起始事件區分 |

`dt = elbowOnsetPerfMs - kneePeakPerfMs`，保留零值與負值。有限但品質不足的試次仍保留事件估計，維持不回饋、不納入統計；無效或中止的試次不填造事件時間。每次處理前清除前一試次的估計。

Session manifest 增加 `timingDefinition`，記錄門檻、插值間隔、方向與尚未驗證狀態。舊欄位與八檔結構保留，既有離線讀取器可接受新增欄位；舊檔沒有事件時間，不由 `dt` 回推補造。

## 時鐘限制

新增時間來自既有 `shotData.t` 的 `performance.now()`，是姿態結果回呼時間上的插值估計，包含處理排程影響。它不是來源影格 PTS、相機曝光時間、影片中的球離手時間或已校正的人體事件時間。不得直接拿它與離線標記的 `sourceTimestampMs` 相減；仍須建立並驗證時鐘映射。此版本尚未新增該映射。

事件計算維持 `timing-validity-v3`；建置識別改為 `timing-event-traceability-v1`，用以區分新的匯出與介面。

## 介面

新增可展開的時序定義說明；將「執行升頻演算法」改為「插值與事件時間估計」，將「本體感覺沉澱／感受肌肉記憶」改為設定等待時間。1 ms 計算間隔、1 秒等待及 50–150 ms 候選範圍均不代表量測準確度或訓練效果已被驗證。

研究依據及事件定義差異沿用 [SOURCES](./SOURCES.md) 與 [主張查核](./shooting-claim-audit.md)；本次不宣稱所有引用全文查核完成，也未將既有手肘起始改成文獻的峰值事件。

## 驗證

- 修改前：`npm.cmd test`，38/38 Node 測試及 HTML／Pages 入口檢查通過。
- 修改後：`npm.cmd test`，40/40 Node 測試及 HTML／Pages 入口檢查通過。
- 覆蓋事件時間與有號 `dt` 一致、失敗試次清除舊事件、低品質與無效試次、Session 匯出後由離線讀取器重新載入及 manifest 定義快照。
- 尚未進行手機相機、實際聲音、影片時間校正或瀏覽器下載實測；Node 假錄影器測試不代替實機驗收。
